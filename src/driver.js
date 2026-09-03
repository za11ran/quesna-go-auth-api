// Driver App API — BACKEND_HANDOFF.md §4
//   POST /driver/auth/login       GET /driver/me
//   PUT  /driver/status           POST /driver/location
//   GET  /driver/orders           GET /driver/orders/:id
//   POST /driver/orders/:id/accept    POST /driver/orders/:id/reject
//   PATCH /driver/orders/:id/status
//   POST /driver/orders/:id/proof
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('./db');
const { signStaffToken, staffAuth } = require('./staff-auth');
const { loadOrder, serializeOrder, setStatus } = require('./orderView');
const { notify } = require('./notify');

const nowIso = () => new Date().toISOString();
const fail = (res, s, code, message) =>
  res.status(s).json({ success: false, error_code: code, message, timestamp: nowIso() });
const driverRole = staffAuth(['driver']);

async function myDriver(req) {
  const sid = req.staff.id;
  const { rows } = await db.query(`SELECT * FROM drivers WHERE staff_user_id = $1`, [sid]);
  return rows[0] || null;
}
async function ownsOrder(orderId, driverId) {
  const r = await db.query(`SELECT 1 FROM orders WHERE id = $1 AND driver_id = $2`, [orderId, driverId]);
  return r.rowCount > 0;
}

/* -------- login -------- */
router.post('/auth/login', async (req, res, next) => {
  try {
    const { phone, email, password } = req.body || {};
    if (!password || (!phone && !email)) return fail(res, 422, 'MISSING_CREDENTIALS', 'البيانات ناقصة');
    const { rows } = await db.query(
      `SELECT * FROM staff_users
        WHERE role = 'driver'
          AND (($1::text IS NOT NULL AND phone = $1) OR ($2::text IS NOT NULL AND email = $2))
        LIMIT 1`,
      [phone || null, email || null]
    );
    const s = rows[0];
    if (!s || !s.is_active || !(await bcrypt.compare(String(password), s.password_hash)))
      return fail(res, 401, 'INVALID_LOGIN', 'بيانات الدخول غير صحيحة');
    await db.query(`UPDATE staff_users SET last_login_at = now() WHERE id = $1`, [s.id]);
    const d = (await db.query(`SELECT * FROM drivers WHERE staff_user_id = $1`, [s.id])).rows[0];
    res.json({ token: signStaffToken(s), driver: d || null, user: { id: s.id, name: s.name } });
  } catch (e) { next(e); }
});

/* -------- me / status / location -------- */
router.get('/me', driverRole, async (req, res, next) => {
  try {
    const d = await myDriver(req);
    if (!d) return fail(res, 404, 'DRIVER_NOT_FOUND', 'حساب الدليفري غير مربوط');
    res.json(d);
  } catch (e) { next(e); }
});

router.put('/status', driverRole, async (req, res, next) => {
  try {
    const d = await myDriver(req);
    if (!d) return fail(res, 404, 'DRIVER_NOT_FOUND', 'حساب الدليفري غير مربوط');
    const s = String((req.body || {}).status || '');
    if (!['available', 'offline'].includes(s)) return fail(res, 422, 'INVALID_STATUS', 'الحالة لازم available أو offline');
    if (d.status === 'busy' && s === 'offline') return fail(res, 409, 'ON_DELIVERY', 'مش ينفع offline وإنت في توصيلة');
    await db.query(
      `UPDATE drivers SET status = $2, is_online = $3, updated_at = now() WHERE id = $1`,
      [d.id, s, s === 'available']
    );
    res.json({ success: true, status: s });
  } catch (e) { next(e); }
});

router.post('/location', driverRole, async (req, res, next) => {
  try {
    const d = await myDriver(req);
    if (!d) return fail(res, 404, 'DRIVER_NOT_FOUND', 'حساب الدليفري غير مربوط');
    const { lat, lng } = req.body || {};
    if (lat == null || lng == null) return fail(res, 422, 'LOCATION_REQUIRED', 'lat و lng مطلوبين');
    await db.query(
      `UPDATE drivers SET lat = $2, lng = $3, location_updated_at = now(), updated_at = now() WHERE id = $1`,
      [d.id, Number(lat), Number(lng)]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

/* -------- orders -------- */
router.get('/orders', driverRole, async (req, res, next) => {
  try {
    const d = await myDriver(req);
    if (!d) return fail(res, 404, 'DRIVER_NOT_FOUND', 'حساب الدليفري غير مربوط');
    const { rows } = await db.query(
      `SELECT id FROM orders WHERE driver_id = $1 ORDER BY placed_at DESC LIMIT 100`, [d.id]
    );
    const data = [];
    for (const r of rows) data.push(serializeOrder(await loadOrder(r.id)));
    res.json({ data });
  } catch (e) { next(e); }
});

router.get('/orders/:id', driverRole, async (req, res, next) => {
  try {
    const d = await myDriver(req);
    if (!d || !(await ownsOrder(req.params.id, d.id))) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    const b = await loadOrder(req.params.id);
    const out = serializeOrder(b);
    // عناوين وأرقام مفيدة للدليفري
    const vend = await db.query(
      `SELECT DISTINCT v.name_ar, v.phone, v.address_ar, v.lat, v.lng
         FROM order_vendors ov JOIN vendors v ON v.id = ov.vendor_id WHERE ov.order_id = $1`,
      [req.params.id]
    );
    out.pickup = vend.rows.map((v) => ({ name: v.name_ar, phone: v.phone, address: v.address_ar, lat: v.lat, lng: v.lng }));
    res.json(out);
  } catch (e) { next(e); }
});

router.post('/orders/:id/accept', driverRole, async (req, res, next) => {
  try {
    const d = await myDriver(req);
    if (!d || !(await ownsOrder(req.params.id, d.id))) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    await db.query(
      `UPDATE delivery_offers SET response = 'accepted', responded_at = now()
        WHERE order_id = $1 AND driver_id = $2 AND response IS NULL`,
      [req.params.id, d.id]
    );
    await db.query(`UPDATE orders SET driver_sub_status = 'heading_to_vendor' WHERE id = $1`, [req.params.id]);
    res.json(serializeOrder(await loadOrder(req.params.id)));
  } catch (e) { next(e); }
});

router.post('/orders/:id/reject', driverRole, async (req, res, next) => {
  try {
    const d = await myDriver(req);
    if (!d || !(await ownsOrder(req.params.id, d.id))) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    await db.query(
      `UPDATE delivery_offers SET response = 'rejected', responded_at = now()
        WHERE order_id = $1 AND driver_id = $2 AND response IS NULL`,
      [req.params.id, d.id]
    );
    // رجّع الطلب للطابور وحرّر الدليفري
    await db.query(`UPDATE drivers SET status = 'available', current_order_id = NULL, updated_at = now() WHERE id = $1`, [d.id]);
    await db.query(`UPDATE orders SET driver_id = NULL, driver_sub_status = NULL WHERE id = $1`, [req.params.id]);
    await setStatus(req.params.id, 'ready_for_pickup', 'driver(reject)');
    res.json({ success: true });
  } catch (e) { next(e); }
});

const DRIVER_FLOW = {
  heading_to_vendor: 'at_vendor',
  at_vendor: 'picked_up',
  picked_up: 'on_the_way',
  on_the_way: 'arrived',
  arrived: 'delivered',
};

router.patch('/orders/:id/status', driverRole, async (req, res, next) => {
  try {
    const d = await myDriver(req);
    if (!d || !(await ownsOrder(req.params.id, d.id))) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    const b = await loadOrder(req.params.id);
    const cur = b.order.driver_sub_status || 'heading_to_vendor';
    const to = String((req.body || {}).status || '');
    if (DRIVER_FLOW[cur] !== to) {
      return fail(res, 409, 'INVALID_TRANSITION', `التالي بعد ${cur} هو ${DRIVER_FLOW[cur] || '—'}`);
    }

    await db.query(`UPDATE orders SET driver_sub_status = $2, updated_at = now() WHERE id = $1`, [req.params.id, to]);

    if (to === 'picked_up') {
      await setStatus(req.params.id, 'picked_up', 'driver');
      await notify(b.order.customer_id, {
        title: 'طلبك اتحرك', body: 'الدليفري استلم طلبك من المتجر', type: 'order_on_the_way', orderId: req.params.id,
      });
    } else if (to === 'on_the_way') {
      await setStatus(req.params.id, 'on_the_way', 'driver');
      await notify(b.order.customer_id, {
        title: 'طلبك في الطريق إليك', body: 'الدليفري جاي دلوقتي', type: 'order_on_the_way', orderId: req.params.id,
      });
    } else if (to === 'arrived') {
      await setStatus(req.params.id, 'arrived', 'driver');
    } else if (to === 'delivered') {
      await setStatus(req.params.id, 'delivered', 'driver');
      await db.query(
        `UPDATE orders SET payment_status = CASE WHEN payment_method = 'cash' THEN 'paid' ELSE payment_status END WHERE id = $1`,
        [req.params.id]
      );
      await db.query(
        `UPDATE drivers SET status = 'available', current_order_id = NULL, deliveries_count = deliveries_count + 1, updated_at = now() WHERE id = $1`,
        [d.id]
      );
      await notify(b.order.customer_id, {
        title: 'تم توصيل طلبك', body: `طلبك رقم ${req.params.id} وصل. شكرًا!`, type: 'order_delivered', orderId: req.params.id,
        data: { receipt_url: `/api/orders/${req.params.id}/receipt` },
      });
    }

    res.json(serializeOrder(await loadOrder(req.params.id)));
  } catch (e) { next(e); }
});

router.post('/orders/:id/proof', driverRole, async (req, res, next) => {
  try {
    const d = await myDriver(req);
    if (!d || !(await ownsOrder(req.params.id, d.id))) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    // صورة/توقيع/كود — تخزين بسيط في status history لحد ما نضيف رفع الصور
    await db.query(
      `INSERT INTO order_status_history (order_id, status, by_role) VALUES ($1, 'proof_recorded', 'driver')`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
