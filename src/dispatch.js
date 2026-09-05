// Dispatch Dashboard API — BACKEND_HANDOFF.md §3
//   GET  /dispatch/orders?status=      GET /dispatch/orders/:id
//   GET  /dispatch/drivers             GET /dispatch/queue
//   POST /dispatch/orders/:id/assign        {driver_id}
//   POST /dispatch/orders/:id/auto-assign
//   POST /dispatch/orders/:id/reassign      {driver_id, reason}
//   POST /dispatch/orders/:id/unassign
//   POST /dispatch/quick-orders/:id/accept    {price?}
//   POST /dispatch/quick-orders/:id/assign    {driver_id}
//   POST /dispatch/quick-orders/:id/unassign   POST /dispatch/quick-orders/:id/cancel
const router = require('express').Router();
const db = require('./db');
const { staffAuth } = require('./staff-auth');
const { loadOrder, serializeOrder, setStatus } = require('./orderView');
const { loadQuickOrder, serializeQuickOrder, setQuickOrderStatus } = require('./quickOrderView');
const { notify } = require('./notify');
const { emitTo } = require('./realtime');
const { sendDriverPush } = require('./push');

const nowIso = () => new Date().toISOString();
const fail = (res, s, code, message) =>
  res.status(s).json({ success: false, error_code: code, message, timestamp: nowIso() });
const dispatchRole = staffAuth(['dispatcher', 'admin']);

// ٩٠ ثانية بدل ٦٠ — كانت ضيقة قوي مع وقت وصول الـ push + فتح التطبيق فعليًا،
// كان بيخلي الطلب "يختفي" من عند الدليفري قبل ما يلحق يقبله. قابل للتعديل من .env.
const OFFER_TIMEOUT_SEC = Number(process.env.DELIVERY_OFFER_TIMEOUT_SEC || 90);

function serializeDriverFull(d) {
  return {
    id: d.id, name: d.name, phone: d.phone, photo: d.photo || null,
    vehicle_type: d.vehicle_type, status: d.status, is_online: d.is_online,
    current_order_id: d.current_order_id || null,
    location: d.lat != null && d.lng != null ? { lat: Number(d.lat), lng: Number(d.lng), updated_at: d.location_updated_at } : null,
    zone: d.zone || null, rating: Number(d.rating) || 0, deliveries_count: d.deliveries_count || 0,
    last_assigned_at: d.last_assigned_at || null,
  };
}

// قائمة الدليفري المتاحين مرتبة حسب الدور (الأقدم في التعيين = عليه الدور)
async function rotationQueue(zone) {
  const params = [];
  let zoneSql = '';
  if (zone) { params.push(zone); zoneSql = `AND (zone = $1 OR zone IS NULL)`; }
  const { rows } = await db.query(
    `SELECT * FROM drivers
      WHERE status = 'available' AND is_online = true ${zoneSql}
   ORDER BY last_assigned_at ASC NULLS FIRST, created_at ASC`,
    params
  );
  return rows;
}

async function assignToDriver(orderId, driver, dispatcherId, { reassign = false } = {}) {
  await db.query(
    `UPDATE orders SET driver_id = $2, dispatcher_id = $3, driver_sub_status = 'heading_to_vendor' WHERE id = $1`,
    [orderId, driver.id, dispatcherId]
  );
  await setStatus(orderId, 'assigned', reassign ? 'dispatcher(reassign)' : 'dispatcher');
  await db.query(
    `UPDATE drivers SET status = 'busy', current_order_id = $2, last_assigned_at = now(), updated_at = now() WHERE id = $1`,
    [driver.id, orderId]
  );
  await db.query(
    `INSERT INTO delivery_offers (order_id, driver_id, expires_at) VALUES ($1, $2, $3)`,
    [orderId, driver.id, new Date(Date.now() + OFFER_TIMEOUT_SEC * 1000).toISOString()]
  );
  if (driver.staff_user_id) {
    await notify(driver.staff_user_id, {
      title: 'تعيين توصيل جديد', body: `طلب ${orderId}`, type: 'order_assigned', orderId, recipientType: 'staff',
    });
  }
  emitTo(`driver:${driver.id}`, 'driver:assignment', { order_id: orderId });
  // push فعلي (وضع الدليفري جوه تطبيق العميل) — notify() فوق ده للوحة الويب بس
  // (staff_users مالهاش user_devices)، فاحتجنا مسار منفصل هنا.
  sendDriverPush(driver.id, {
    title: 'تعيين توصيل جديد',
    body: `طلب ${orderId} جاهز — روح استلمه`,
    data: { type: 'order_assigned', order_id: orderId },
  });
}

/* -------- orders queue -------- */
// بيدمج الطلبات العادية مع الطلبات السريعة (pending اللي لسه محدّش راجعها +
// اللي تحت التنفيذ) في نفس الطابور — عشان طلب سريع جديد يظهر للمشرف زي
// بالظبط أي طلب تاني محتاج تعيين، مش يضيع في جدول محدّش بيفتحه.
router.get('/orders', dispatchRole, async (req, res, next) => {
  try {
    const statuses = req.query.status
      ? [String(req.query.status)]
      : ['ready_for_pickup', 'assigned', 'picked_up', 'on_the_way'];
    // الطلب السريع مالوش 'ready_for_pickup' (مفيش متجر يجهّزه) لكن عنده
    // 'price_review' (مستني موافقة العميل على السعر) و'accepted' (وافق
    // العميل، محتاج تعيين دليفري) — كانوا ناقصين هنا فكان الطلب يختفي من
    // الطابور فور ما يخرج من pending، حتى لو لسه محتاج إجراء من المشرف.
    const quickStatuses = req.query.status
      ? statuses
      : ['pending', 'price_review', 'accepted', ...statuses];
    const ph = statuses.map((_, i) => `$${i + 1}`).join(', ');
    const qph = quickStatuses.map((_, i) => `$${i + 1}`).join(', ');
    const [ordersRes, quickRes] = await Promise.all([
      db.query(`SELECT id, placed_at AS at FROM orders WHERE status IN (${ph}) ORDER BY placed_at ASC`, statuses),
      db.query(`SELECT id, created_at AS at FROM quick_orders WHERE status IN (${qph}) ORDER BY created_at ASC`, quickStatuses),
    ]);
    const combined = [
      ...ordersRes.rows.map((r) => ({ id: r.id, at: r.at, is_quick: false })),
      ...quickRes.rows.map((r) => ({ id: r.id, at: r.at, is_quick: true })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));
    const data = [];
    for (const r of combined) {
      data.push(r.is_quick
        ? serializeQuickOrder(await loadQuickOrder(r.id))
        : serializeOrder(await loadOrder(r.id)));
    }
    res.json({ data });
  } catch (e) { next(e); }
});

router.get('/orders/:id', dispatchRole, async (req, res, next) => {
  try {
    if (req.params.id.startsWith('qo_')) {
      const qb = await loadQuickOrder(req.params.id);
      if (!qb) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
      return res.json(serializeQuickOrder(qb));
    }
    const b = await loadOrder(req.params.id);
    if (!b) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    res.json(serializeOrder(b));
  } catch (e) { next(e); }
});

/* -------- drivers -------- */
router.get('/drivers', dispatchRole, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM drivers ORDER BY status, last_assigned_at ASC NULLS FIRST`);
    res.json({ data: rows.map(serializeDriverFull) });
  } catch (e) { next(e); }
});

router.get('/queue', dispatchRole, async (req, res, next) => {
  try {
    const q = await rotationQueue(req.query.zone ? String(req.query.zone) : null);
    res.json({ data: q.map((d, i) => ({ position: i + 1, ...serializeDriverFull(d) })) });
  } catch (e) { next(e); }
});

/* -------- assign -------- */
async function requireReadyOrAssigned(res, orderId, allowAssigned) {
  const b = await loadOrder(orderId);
  if (!b) { fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود'); return null; }
  const ok = b.order.status === 'ready_for_pickup' || (allowAssigned && ['assigned', 'picked_up', 'on_the_way'].includes(b.order.status));
  if (!ok) { fail(res, 409, 'ORDER_NOT_READY', 'الطلب مش جاهز للتعيين'); return null; }
  return b;
}

router.post('/orders/:id/assign', dispatchRole, async (req, res, next) => {
  try {
    const b = await requireReadyOrAssigned(res, req.params.id, false);
    if (!b) return;
    const driverId = String((req.body || {}).driver_id || '');
    const d = (await db.query(`SELECT * FROM drivers WHERE id = $1`, [driverId])).rows[0];
    if (!d) return fail(res, 422, 'DRIVER_NOT_FOUND', 'الدليفري غير موجود');
    if (d.status !== 'available' || !d.is_online) return fail(res, 409, 'DRIVER_UNAVAILABLE', 'الدليفري غير متاح');
    await assignToDriver(req.params.id, d, req.staff.id);
    res.json(serializeOrder(await loadOrder(req.params.id)));
  } catch (e) { next(e); }
});

router.post('/orders/:id/auto-assign', dispatchRole, async (req, res, next) => {
  try {
    const b = await requireReadyOrAssigned(res, req.params.id, false);
    if (!b) return;
    const q = await rotationQueue(b.order.address_lat != null ? null : null);
    if (!q.length) return fail(res, 409, 'NO_DRIVERS', 'مفيش دليفري متاح دلوقتي');
    await assignToDriver(req.params.id, q[0], req.staff.id);
    res.json(serializeOrder(await loadOrder(req.params.id)));
  } catch (e) { next(e); }
});

router.post('/orders/:id/reassign', dispatchRole, async (req, res, next) => {
  try {
    const b = await requireReadyOrAssigned(res, req.params.id, true);
    if (!b) return;
    const driverId = String((req.body || {}).driver_id || '');
    const d = (await db.query(`SELECT * FROM drivers WHERE id = $1`, [driverId])).rows[0];
    if (!d) return fail(res, 422, 'DRIVER_NOT_FOUND', 'الدليفري غير موجود');
    // حرّر الدليفري القديم
    if (b.order.driver_id && b.order.driver_id !== driverId) {
      await db.query(`UPDATE drivers SET status = 'available', current_order_id = NULL, updated_at = now() WHERE id = $1`, [b.order.driver_id]);
    }
    await assignToDriver(req.params.id, d, req.staff.id, { reassign: true });
    res.json(serializeOrder(await loadOrder(req.params.id)));
  } catch (e) { next(e); }
});

router.post('/orders/:id/unassign', dispatchRole, async (req, res, next) => {
  try {
    const b = await loadOrder(req.params.id);
    if (!b) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    if (!b.order.driver_id) return fail(res, 409, 'NOT_ASSIGNED', 'الطلب مش معيّن لدليفري');
    await db.query(`UPDATE drivers SET status = 'available', current_order_id = NULL, updated_at = now() WHERE id = $1`, [b.order.driver_id]);
    await db.query(`UPDATE orders SET driver_id = NULL, driver_sub_status = NULL WHERE id = $1`, [req.params.id]);
    await setStatus(req.params.id, 'ready_for_pickup', 'dispatcher(unassign)');
    res.json(serializeOrder(await loadOrder(req.params.id)));
  } catch (e) { next(e); }
});

/* -------- الطلب السريع: مراجعة/تسعير/تعيين -------- */
// مقصود أبسط من التعيين العادي (من غير delivery_offers/مهلة قبول) — المشرف
// بيراجع التفاصيل، يأكّد سعر حقيقي، وبعدين يدّي الطلب لدليفري مباشرة.
// المشرف بيراجع ويحدّد سعر حقيقي — ده مش قبول نهائي؛ لازم عندك موافقة العميل
// الصريحة على السعر ده الأول قبل ما يتعيّنله دليفري (شوف
// POST /api/orders/:id/quick-price/respond في orders.js). كان قبل كده بيقفز
// لـ 'accepted' على طول من غير ما العميل ياخد فرصة يوافق أو يرفض السعر.
router.post('/quick-orders/:id/accept', dispatchRole, async (req, res, next) => {
  try {
    const b = await loadQuickOrder(req.params.id);
    if (!b) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    if (b.qo.status !== 'pending') return fail(res, 409, 'NOT_PENDING', 'الطلب اتراجع بالفعل');
    const price = (req.body || {}).price != null ? Number(req.body.price) : undefined;
    if (price == null || price <= 0) return fail(res, 422, 'PRICE_REQUIRED', 'السعر مطلوب');
    const updated = await setQuickOrderStatus(req.params.id, 'price_review', { dispatcherId: req.staff.id, price });
    await notify(updated.qo.customer_id, {
      title: 'سعر طلبك السريع جاهز',
      body: `سعر طلبك ${req.params.id}: ${price} جنيه — وافق أو ارفض`,
      type: 'quick_order_price', orderId: req.params.id,
      data: { qo_status: 'price_review' },
    });
    res.json(serializeQuickOrder(updated));
  } catch (e) { next(e); }
});

router.post('/quick-orders/:id/assign', dispatchRole, async (req, res, next) => {
  try {
    const b = await loadQuickOrder(req.params.id);
    if (!b) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    if (!['accepted', 'assigned'].includes(b.qo.status)) return fail(res, 409, 'NOT_READY', 'لازم تراجع الطلب وتأكّد السعر الأول');
    const driverId = String((req.body || {}).driver_id || '');
    const d = (await db.query(`SELECT * FROM drivers WHERE id = $1`, [driverId])).rows[0];
    if (!d) return fail(res, 422, 'DRIVER_NOT_FOUND', 'الدليفري غير موجود');
    if (d.status !== 'available' || !d.is_online) return fail(res, 409, 'DRIVER_UNAVAILABLE', 'الدليفري غير متاح');
    if (b.qo.driver_id && b.qo.driver_id !== d.id) {
      await db.query(`UPDATE drivers SET status = 'available', current_order_id = NULL, updated_at = now() WHERE id = $1`, [b.qo.driver_id]);
    }
    await db.query(
      `UPDATE drivers SET status = 'busy', current_order_id = $2, last_assigned_at = now(), updated_at = now() WHERE id = $1`,
      [d.id, req.params.id]
    );
    const updated = await setQuickOrderStatus(req.params.id, 'assigned', {
      dispatcherId: req.staff.id, driverId: d.id, driverSubStatus: 'picked_up',
    });
    if (d.staff_user_id) {
      notify(d.staff_user_id, {
        title: 'تعيين طلب سريع جديد', body: `طلب ${req.params.id}`, type: 'order_assigned',
        orderId: req.params.id, recipientType: 'staff',
      });
    }
    emitTo(`driver:${d.id}`, 'driver:assignment', { order_id: req.params.id });
    sendDriverPush(d.id, {
      title: 'تعيين طلب سريع جديد', body: `طلب ${req.params.id} جاهز — روح استلمه`,
      data: { type: 'order_assigned', order_id: req.params.id },
    });
    res.json(serializeQuickOrder(updated));
  } catch (e) { next(e); }
});

router.post('/quick-orders/:id/unassign', dispatchRole, async (req, res, next) => {
  try {
    const b = await loadQuickOrder(req.params.id);
    if (!b) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    if (!b.qo.driver_id) return fail(res, 409, 'NOT_ASSIGNED', 'الطلب مش معيّن لدليفري');
    await db.query(`UPDATE drivers SET status = 'available', current_order_id = NULL, updated_at = now() WHERE id = $1`, [b.qo.driver_id]);
    const updated = await setQuickOrderStatus(req.params.id, 'accepted', { driverId: null, driverSubStatus: null });
    res.json(serializeQuickOrder(updated));
  } catch (e) { next(e); }
});

router.post('/quick-orders/:id/cancel', dispatchRole, async (req, res, next) => {
  try {
    const b = await loadQuickOrder(req.params.id);
    if (!b) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    if (b.qo.driver_id) {
      await db.query(`UPDATE drivers SET status = 'available', current_order_id = NULL, updated_at = now() WHERE id = $1`, [b.qo.driver_id]);
    }
    const reason = (req.body || {}).reason ? String(req.body.reason).trim().slice(0, 300) : null;
    const updated = await setQuickOrderStatus(req.params.id, 'cancelled', {
      driverId: null, driverSubStatus: null, cancelReason: reason,
    });
    await notify(updated.qo.customer_id, {
      title: 'تم رفض طلبك',
      body: reason ? `طلب ${req.params.id}: ${reason}` : `طلب ${req.params.id} اتلغى`,
      type: 'quick_order_cancelled', orderId: req.params.id,
    });
    res.json(serializeQuickOrder(updated));
  } catch (e) { next(e); }
});

module.exports = router;
