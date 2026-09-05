// Customer orders + addresses + notifications + devices  (BACKEND_HANDOFF.md §7, §10.7-10.9)
//   POST   /api/orders
//   GET    /api/orders                (بيرجع orders + quick_orders مع بعض)
//   GET    /api/orders/:id            (id بيبدأ بـ qo_ = طلب سريع، شوف quickOrderView.js)
//   GET    /api/orders/:id/receipt
//   POST   /api/orders/:id/cancel     (بيشتغل مع الطلب السريع كمان)
//   POST   /api/orders/quick          (طلب سريع — دلوقتي بيوصل للمشرف فعليًا)
//   GET/POST/DELETE /api/addresses[/:id]
//   GET /api/notifications   ·   POST /api/notifications/:id/read
//   POST /api/devices
const router = require('express').Router();
const db = require('./db');
const { authRequired } = require('./auth');
const { notify } = require('./notify');
const { emitTo } = require('./realtime');
const { loadOrder, serializeOrder, n2 } = require('./orderView');
const { loadQuickOrder, serializeQuickOrder, setQuickOrderStatus } = require('./quickOrderView');
const { imagesUpload, saveImages } = require('./upload');
const {
  findValidCoupon,
  computeDiscount: computeCouponDiscount,
  COUPON_MESSAGES,
} = require('./coupons');
const { computeDeliveryTotal } = require('./deliveryPricing');

const { langOf } = require('./lang'); // هيدر LANG أو ?lang= (ar|en)
const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, error_code: code, message, timestamp: new Date().toISOString() });

const T = {
  order_placed: { ar: ['تم استلام طلبك', 'طلبك رقم %s قيد المراجعة'], en: ['Order received', 'Your order %s is being reviewed'] },
  order_cancelled: { ar: ['تم إلغاء الطلب', 'تم إلغاء طلبك رقم %s'], en: ['Order cancelled', 'Your order %s was cancelled'] },
};
const msg = (key, lang, arg) => {
  const [t, b] = (T[key][lang] || T[key].ar);
  return { title: t, body: b.replace('%s', arg) };
};

/* ============================ POST /api/orders ============================ */
router.post('/orders', authRequired, async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const lang = langOf(req);
    const body = req.body || {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return fail(res, 422, 'EMPTY_CART', 'السلة فارغة');

    const paymentMethod = ['cash', 'card', 'wallet'].includes(body.payment_method) ? body.payment_method : 'cash';

    // اقفل نسخة من المنتجات المطلوبة
    const productIds = [...new Set(rawItems.map((i) => String(i.product_id)))];
    const pPlaceholders = productIds.map((_, i) => `$${i + 1}`).join(', ');
    const prodRes = await db.query(
      `SELECT p.*, v.name_ar AS v_name_ar, v.name_en AS v_name_en, v.delivery_fee, v.min_order,
              v.is_open, v.is_active, v.status AS v_status, v.deleted_at AS v_deleted,
              v.order_mode AS v_order_mode, v.phone AS v_phone
         FROM products p JOIN vendors v ON v.id = p.vendor_id
        WHERE p.id IN (${pPlaceholders}) AND p.deleted_at IS NULL`,
      productIds
    );
    const products = Object.fromEntries(prodRes.rows.map((p) => [p.id, p]));

    // العروض لكل تاجر مطلوب
    const vendorIds = [...new Set(prodRes.rows.map((p) => p.vendor_id))];
    const vPlaceholders = vendorIds.map((_, i) => `$${i + 1}`).join(', ');
    const offRes = vendorIds.length
      ? await db.query(`SELECT * FROM offers WHERE vendor_id IN (${vPlaceholders}) AND is_active = true`, vendorIds)
      : { rows: [] };
    const offersByVendor = {};
    for (const off of offRes.rows) (offersByVendor[off.vendor_id] ||= []).push(off);

    const now = Date.now();
    const bestDiscount = (p) => {
      let best = null;
      for (const off of offersByVendor[p.vendor_id] || []) {
        if (off.discount_type === 'amount' && off.scope !== 'product') continue;
        if (off.starts_at && new Date(off.starts_at).getTime() > now) continue;
        if (off.ends_at && new Date(off.ends_at).getTime() < now) continue;
        // scope='category': للمطاعم (مفيش category عندهم) بيتطابق مع menu_section_id بدالها.
        const match =
          off.scope === 'store' ||
          (off.scope === 'category' && (
            off.target_id === p.category ||
            (p.menu_section_id != null && off.target_id === String(p.menu_section_id))
          )) ||
          (off.scope === 'product' && off.target_id === p.id);
        if (!match) continue;
        const base = Number(p.price);
        const after =
          off.discount_type === 'percent'
            ? base * (1 - Number(off.discount_value) / 100)
            : Math.max(0, base - Number(off.discount_value));
        if (best === null || after < best) best = after;
      }
      return best;
    };

    // ابنِ السطور واحسب المجاميع
    const lines = [];
    const optionCache = {};
    for (const raw of rawItems) {
      const pid = String(raw.product_id);
      const p = products[pid];
      if (!p) return fail(res, 422, 'PRODUCT_NOT_FOUND', `منتج غير موجود: ${pid}`);
      if (p.v_deleted || !p.is_active || p.v_status !== 'approved')
        return fail(res, 422, 'VENDOR_UNAVAILABLE', 'المتجر غير متاح');
      if (!p.is_open) return fail(res, 409, 'VENDOR_CLOSED', 'المتجر مغلق حاليًا');
      if (!p.is_available) return fail(res, 409, 'PRODUCT_UNAVAILABLE', `المنتج غير متاح: ${p['name_' + lang] || p.name_ar}`);

      const qty = Math.max(1, parseInt(raw.quantity, 10) || 1);
      const base = Number(p.price);
      let unit = base;
      let optionId = null;
      let optionName = null;

      if (raw.option_id) {
        const key = `${pid}:${raw.option_id}`;
        if (!(key in optionCache)) {
          const or = await db.query(
            `SELECT * FROM product_options WHERE product_id = $1 AND id = $2`,
            [pid, String(raw.option_id)]
          );
          optionCache[key] = or.rows[0] || null;
        }
        const opt = optionCache[key];
        if (!opt) return fail(res, 422, 'OPTION_NOT_FOUND', 'الحجم/النوع غير موجود');
        if (!opt.is_available) return fail(res, 409, 'OPTION_UNAVAILABLE', 'الحجم/النوع غير متاح');
        if (opt.stock !== null && opt.stock !== undefined && Number(opt.stock) < qty)
          return fail(res, 409, 'OUT_OF_STOCK', 'الكمية المطلوبة غير متوفرة');
        unit = Number(opt.price);
        optionId = opt.id;
        optionName = opt['name_' + lang] || opt.name_ar;
      } else {
        if (p.stock !== null && p.stock !== undefined && Number(p.stock) < qty)
          return fail(res, 409, 'OUT_OF_STOCK', 'الكمية المطلوبة غير متوفرة');
        const disc = bestDiscount(p);
        if (disc !== null) unit = disc;
      }

      lines.push({
        vendor_id: p.vendor_id,
        vendor_name: (lang === 'en' ? p.v_name_en : p.v_name_ar) || p.v_name_ar,
        product_id: pid,
        name: p['name_' + lang] || p.name_ar,
        option_id: optionId,
        option_name: optionName,
        unit_price: n2(unit),
        base_price: n2(optionId ? unit : base),
        quantity: qty,
        line_total: n2(unit * qty),
        note: raw.note ? String(raw.note).slice(0, 300) : null,
        delivery_fee: Number(p.delivery_fee) || 0,
        min_order: Number(p.min_order) || 0,
        order_mode: p.v_order_mode || 'app',
        vendor_phone: p.v_phone || null,
      });
    }

    // تجميع لكل تاجر + تحقق الحد الأدنى
    const vendorAgg = {};
    for (const l of lines) {
      const a = (vendorAgg[l.vendor_id] ||= {
        vendor_id: l.vendor_id, vendor_name: l.vendor_name, subtotal: 0,
        delivery_fee: l.delivery_fee, min_order: l.min_order,
        order_mode: l.order_mode, vendor_phone: l.vendor_phone,
      });
      a.subtotal = n2(a.subtotal + l.line_total);
    }
    for (const a of Object.values(vendorAgg)) {
      if (a.subtotal < a.min_order)
        return fail(res, 422, 'MIN_ORDER_NOT_MET', `الحد الأدنى للطلب من ${a.vendor_name} هو ${a.min_order}`);
    }

    const subtotal = n2(Object.values(vendorAgg).reduce((s, a) => s + a.subtotal, 0));

    // رسوم التوصيل: سعر أساسي حسب قرية العميل + رسوم إضافية لكل متجر زيادة عن
    // واحد — مش مجموع رسوم كل متجر (الأدمن بيتحكم في الاتنين من لوحته).
    const customerRes = await db.query(`SELECT village_id FROM users WHERE id = $1`, [req.user.sub]);
    const deliveryTotal = n2(
      await computeDeliveryTotal({
        villageId: customerRes.rows[0]?.village_id || null,
        vendorCount: Object.keys(vendorAgg).length,
      })
    );

    const lineDiscountTotal = n2(lines.reduce((s, l) => s + Math.max(0, l.base_price - l.unit_price) * l.quantity, 0));

    // كود الخصم (اختياري) — يتحقق تاني هنا (مش بس وقت المعاينة) لأن الحالة
    // ممكن تتغيّر بين المعاينة والطلب الفعلي (كوبون خلص، انتهت صلاحيته...).
    let couponCode = null, couponDiscount = 0;
    if (body.coupon_code) {
      const { coupon, error } = await findValidCoupon(body.coupon_code);
      if (error) return fail(res, 422, error, COUPON_MESSAGES[error]);
      if (subtotal < Number(coupon.min_order_amount)) {
        return fail(res, 422, 'COUPON_MIN_ORDER_NOT_MET', `الحد الأدنى لاستخدام الكود ${Number(coupon.min_order_amount)} ج.م`);
      }
      couponDiscount = computeCouponDiscount(coupon, subtotal);
      couponCode = coupon.code;
    }

    const discountTotal = n2(lineDiscountTotal + couponDiscount);
    const total = n2(subtotal + deliveryTotal - couponDiscount);

    // العنوان (id أو نص)
    let addrId = null, addrText = body.address_text || null, addrLat = null, addrLng = null;
    if (body.address_id) {
      const ar = await db.query(
        `SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2`,
        [body.address_id, req.user.sub]
      );
      if (!ar.rowCount) return fail(res, 422, 'ADDRESS_NOT_FOUND', 'العنوان غير موجود');
      addrId = ar.rows[0].id;
      addrText = ar.rows[0].details;
      addrLat = ar.rows[0].lat;
      addrLng = ar.rows[0].lng;
    }
    if (!addrText) return fail(res, 422, 'ADDRESS_REQUIRED', 'العنوان مطلوب');

    // اكتب الطلب داخل transaction
    await client.query('BEGIN');
    const seq = await client.query(`SELECT nextval('order_seq') AS n`);
    const orderId = `ord_${seq.rows[0].n}`;

    await client.query(
      `INSERT INTO orders (id, customer_id, status, payment_method, payment_status,
                           address_id, address_text, address_lat, address_lng, notes,
                           subtotal, delivery_total, discount_total, total,
                           coupon_code, coupon_discount)
       VALUES ($1,$2,'pending',$3,'pending',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [orderId, req.user.sub, paymentMethod, addrId, addrText, addrLat, addrLng,
       body.notes ? String(body.notes).slice(0, 500) : null,
       subtotal, deliveryTotal, discountTotal, total,
       couponCode, couponDiscount]
    );
    if (couponCode) {
      await client.query(`UPDATE coupons SET used_count = used_count + 1 WHERE UPPER(code) = UPPER($1)`, [couponCode]);
    }
    for (const a of Object.values(vendorAgg)) {
      await client.query(
        `INSERT INTO order_vendors (order_id, vendor_id, vendor_name, subtotal, delivery_fee, order_mode, vendor_phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, a.vendor_id, a.vendor_name, a.subtotal, a.delivery_fee, a.order_mode, a.vendor_phone]
      );
    }
    for (const l of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, vendor_id, product_id, name, option_id, option_name,
                                  unit_price, base_price, quantity, line_total, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [orderId, l.vendor_id, l.product_id, l.name, l.option_id, l.option_name,
         l.unit_price, l.base_price, l.quantity, l.line_total, l.note]
      );
    }
    await client.query(
      `INSERT INTO order_status_history (order_id, status, by_role) VALUES ($1,'pending','customer')`,
      [orderId]
    );

    // متاجر "يدوي" (بدون تطبيق تاجر) — الطلب مالوش حد يقبله من لوحة تاجر، فبيتخصم
    // مخزونه فورًا وبيتحوّل على طول لجاهز للاستلام، عشان يظهر في طابور التوزيع
    // والمشرف هو اللي هيتصل بالمطعم تليفونيًا ويبعت الدليفري (بدل خطوة "قبول" التاجر).
    // لو السلة فيها متجر "app" واحد على الأقل، سيبها تمشي بالتدفّق العادي عادي.
    const allManual = Object.values(vendorAgg).every((a) => a.order_mode === 'manual');
    if (allManual) {
      for (const l of lines) {
        const qty = Number(l.quantity);
        if (l.option_id) {
          await client.query(
            `UPDATE product_options SET stock = stock - $3::int
               WHERE product_id = $1 AND id = $2 AND stock IS NOT NULL AND stock >= $3::int`,
            [l.product_id, l.option_id, qty]
          );
        }
        await client.query(
          `UPDATE products SET stock = stock - $2::int
             WHERE id = $1 AND stock IS NOT NULL AND stock >= $2::int`,
          [l.product_id, qty]
        );
      }
      await client.query(
        `UPDATE orders SET status = 'ready_for_pickup', stock_deducted = true,
                accepted_at = now(), ready_at = now(), updated_at = now()
          WHERE id = $1`,
        [orderId]
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, status, by_role)
         VALUES ($1,'accepted','system'), ($1,'ready_for_pickup','system')`,
        [orderId]
      );
    }

    await client.query('COMMIT');

    const m = msg('order_placed', lang, orderId);
    await notify(req.user.sub, { ...m, type: 'order_placed', orderId });

    if (allManual) {
      emitTo(`customer:${req.user.sub}`, 'order:update', { order_id: orderId, status: 'ready_for_pickup' });
      emitTo('role:dispatcher', 'dispatch:needs_assignment', { order_id: orderId });
      emitTo('role:admin', 'dispatch:needs_assignment', { order_id: orderId });
    } else {
      // إشعار لحظي للتجّار المعنيين (التدفّق العادي: التاجر بيقبل من تطبيقه)
      for (const vid of Object.keys(vendorAgg)) emitTo(`vendor:${vid}`, 'order:new', { order_id: orderId });
    }

    const bundle = await loadOrder(orderId);
    res.status(201).json(serializeOrder(bundle));
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    next(err);
  } finally {
    client.release();
  }
});

/* ============================ POST /api/orders/quick ============================ */
// طلب سريع: نص + سعر تقديري + صور (multipart، حقل images، أقصى 5)
router.post('/orders/quick', authRequired, imagesUpload, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.details || String(b.details).trim().length < 3) {
      return fail(res, 422, 'DETAILS_REQUIRED', 'تفاصيل الطلب مطلوبة');
    }
    const urls = await saveImages(req.files, { folder: 'quick', width: 1200 });
    const seq = await db.query(`SELECT nextval('quick_order_seq') AS n`);
    const id = `qo_${seq.rows[0].n}`;
    await db.query(
      `INSERT INTO quick_orders (id, customer_id, details, price, images)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, req.user.sub, String(b.details).trim(), b.price != null ? Number(b.price) : null, JSON.stringify(urls)]
    );
    await notify(req.user.sub, { title: 'استلمنا طلبك السريع', body: `رقم ${id} — هنتواصل معاك`, type: 'order_placed', orderId: id });

    // كان الطلب السريع بيتسجّل ويسيبوه من غير ما حد من المشرفين يعرف بيه خالص.
    // بلّغهم دلوقتي زي بالظبط أي طلب عادي بيبقى جاهز للتوزيع: بث لحظي للوحة
    // التوزيع (نفس الحدث اللي بيسمعه الطابور) + إشعار فعلي لكل مشرف/أدمن.
    emitTo('role:dispatcher', 'dispatch:needs_assignment', { quick_order_id: id, reason: 'quick_order' });
    emitTo('role:admin', 'dispatch:needs_assignment', { quick_order_id: id, reason: 'quick_order' });
    try {
      const staff = await db.query(`SELECT id FROM staff_users WHERE role IN ('dispatcher','admin') AND is_active = true`);
      for (const s of staff.rows) {
        notify(s.id, {
          title: 'طلب سريع جديد', body: `طلب ${id} محتاج مراجعة وتسعير`,
          type: 'quick_order_new', orderId: id, recipientType: 'staff',
        });
      }
    } catch (e) { console.error('[quick-order] فشل تبليغ المشرفين:', e.message); }

    res.status(201).json({ success: true, id, images: urls });
  } catch (e) {
    next(e);
  }
});

/* ============================ GET /api/orders ============================ */
// بيرجع طلبات العميل العادية + الطلبات السريعة مع بعض (مرتّبين بتاريخ الطلب)
// عشان "طلباتي" تعرض كل حاجة الطلبها، مش الطلبات العادية بس.
router.get('/orders', authRequired, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.per_page, 10) || 20));
    const totalRes = await db.query(
      `SELECT ((SELECT count(*) FROM orders WHERE customer_id = $1)
              + (SELECT count(*) FROM quick_orders WHERE customer_id = $1))::int AS c`,
      [req.user.sub]
    );
    const { rows } = await db.query(
      `SELECT id, is_quick FROM (
         SELECT id, placed_at AS at, false AS is_quick FROM orders WHERE customer_id = $1
         UNION ALL
         SELECT id, created_at AS at, true AS is_quick FROM quick_orders WHERE customer_id = $1
       ) combined
       ORDER BY at DESC LIMIT $2 OFFSET $3`,
      [req.user.sub, perPage, (page - 1) * perPage]
    );
    const data = [];
    for (const r of rows) {
      data.push(r.is_quick
        ? serializeQuickOrder(await loadQuickOrder(r.id))
        : serializeOrder(await loadOrder(r.id)));
    }
    res.json({
      data,
      meta: { page, per_page: perPage, total: totalRes.rows[0].c, last_page: Math.max(1, Math.ceil(totalRes.rows[0].c / perPage)) },
    });
  } catch (err) {
    next(err);
  }
});

/* ============================ GET /api/orders/:id ============================ */
router.get('/orders/:id', authRequired, async (req, res, next) => {
  try {
    if (req.params.id.startsWith('qo_')) {
      const qBundle = await loadQuickOrder(req.params.id);
      if (!qBundle || qBundle.qo.customer_id !== req.user.sub)
        return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
      return res.json(serializeQuickOrder(qBundle));
    }
    const bundle = await loadOrder(req.params.id);
    if (!bundle || bundle.order.customer_id !== req.user.sub)
      return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    res.json(serializeOrder(bundle));
  } catch (err) {
    next(err);
  }
});

/* ============================ GET /api/orders/:id/receipt ============================ */
router.get('/orders/:id/receipt', authRequired, async (req, res, next) => {
  try {
    const bundle = await loadOrder(req.params.id);
    if (!bundle || bundle.order.customer_id !== req.user.sub)
      return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    const o = bundle.order;
    res.json({
      order_id: o.id,
      issued_at: new Date().toISOString(),
      status: o.status,
      customer: bundle.customer
        ? { name: bundle.customer.full_name, phone: bundle.customer.phone, address: o.address_text }
        : null,
      vendors: bundle.vendors.map((v) => ({ name: v.vendor_name, subtotal: n2(v.subtotal), delivery_fee: n2(v.delivery_fee) })),
      items: bundle.items.map((it) => ({
        name: it.option_name ? `${it.name} - ${it.option_name}` : it.name,
        unit_price: n2(it.unit_price),
        quantity: it.quantity,
        line_total: n2(it.line_total),
      })),
      subtotal: n2(o.subtotal),
      delivery_fee: n2(o.delivery_total),
      discount: n2(o.discount_total),
      total: n2(o.total),
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      delivered_at: o.delivered_at,
      pdf_url: null,
    });
  } catch (err) {
    next(err);
  }
});

/* ============================ POST /api/orders/:id/cancel ============================ */
router.post('/orders/:id/cancel', authRequired, async (req, res, next) => {
  try {
    const lang = langOf(req);
    if (req.params.id.startsWith('qo_')) {
      const qBundle = await loadQuickOrder(req.params.id);
      if (!qBundle || qBundle.qo.customer_id !== req.user.sub)
        return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
      if (qBundle.qo.status !== 'pending')
        return fail(res, 409, 'CANNOT_CANCEL', 'لا يمكن الإلغاء بعد ما المشرف يبدأ مراجعة الطلب');
      const updated = await setQuickOrderStatus(req.params.id, 'cancelled');
      const m = msg('order_cancelled', lang, req.params.id);
      await notify(req.user.sub, { ...m, type: 'order_cancelled', orderId: req.params.id });
      return res.json(serializeQuickOrder(updated));
    }
    const bundle = await loadOrder(req.params.id);
    if (!bundle || bundle.order.customer_id !== req.user.sub)
      return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    if (bundle.order.status !== 'pending')
      return fail(res, 409, 'CANNOT_CANCEL', 'لا يمكن الإلغاء بعد قبول المتجر للطلب');

    await db.query(
      `UPDATE orders SET status='cancelled', cancelled_at=now(), cancel_reason=$2, updated_at=now() WHERE id=$1`,
      [bundle.order.id, req.body && req.body.reason ? String(req.body.reason).slice(0, 300) : null]
    );
    await db.query(
      `INSERT INTO order_status_history (order_id, status, by_role) VALUES ($1,'cancelled','customer')`,
      [bundle.order.id]
    );
    const m = msg('order_cancelled', lang, bundle.order.id);
    await notify(req.user.sub, { ...m, type: 'order_cancelled', orderId: bundle.order.id });
    res.json(serializeOrder(await loadOrder(bundle.order.id)));
  } catch (err) {
    next(err);
  }
});

/* ============================ Addresses ============================ */
router.get('/addresses', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.sub]
    );
    res.json({
      data: rows.map((a) => ({
        id: a.id, label: a.label, details: a.details,
        lat: a.lat != null ? Number(a.lat) : null, lng: a.lng != null ? Number(a.lng) : null,
        is_default: a.is_default,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/addresses', authRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.details || String(b.details).trim().length < 3)
      return fail(res, 422, 'ADDRESS_DETAILS_REQUIRED', 'تفاصيل العنوان مطلوبة');
    const isDefault = b.is_default === true || b.is_default === 'true';
    if (isDefault) await db.query(`UPDATE user_addresses SET is_default = false WHERE user_id = $1`, [req.user.sub]);
    const { rows } = await db.query(
      `INSERT INTO user_addresses (user_id, label, details, lat, lng, is_default)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.sub, b.label ? String(b.label).slice(0, 60) : null, String(b.details).trim(),
       b.lat != null ? Number(b.lat) : null, b.lng != null ? Number(b.lng) : null, isDefault]
    );
    const a = rows[0];
    res.status(201).json({
      id: a.id, label: a.label, details: a.details,
      lat: a.lat != null ? Number(a.lat) : null, lng: a.lng != null ? Number(a.lng) : null,
      is_default: a.is_default,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/addresses/:id', authRequired, async (req, res, next) => {
  try {
    const r = await db.query(`DELETE FROM user_addresses WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.sub]);
    if (!r.rowCount) return fail(res, 404, 'ADDRESS_NOT_FOUND', 'العنوان غير موجود');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ============================ Notifications ============================ */
router.get('/notifications', authRequired, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.per_page, 10) || 20));
    const totalRes = await db.query(`SELECT count(*)::int AS c FROM notifications WHERE user_id = $1`, [req.user.sub]);
    const unreadRes = await db.query(`SELECT count(*)::int AS c FROM notifications WHERE user_id = $1 AND is_read = false`, [req.user.sub]);
    const { rows } = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.sub, perPage, (page - 1) * perPage]
    );
    res.json({
      data: rows.map((x) => ({
        id: x.id, title: x.title, body: x.body, type: x.type,
        order_id: x.order_id || null, data: x.data || null,
        is_read: x.is_read, created_at: x.created_at,
      })),
      meta: {
        page, per_page: perPage, total: totalRes.rows[0].c, unread: unreadRes.rows[0].c,
        last_page: Math.max(1, Math.ceil(totalRes.rows[0].c / perPage)),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/:id/read', authRequired, async (req, res, next) => {
  try {
    const r = await db.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.sub]
    );
    if (!r.rowCount) return fail(res, 404, 'NOTIFICATION_NOT_FOUND', 'الإشعار غير موجود');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ============================ POST /api/devices ============================ */
router.post('/devices', authRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.token) return fail(res, 422, 'TOKEN_REQUIRED', 'توكن الجهاز مطلوب');
    await db.query(
      `INSERT INTO user_devices (user_id, token, platform)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, token) DO UPDATE SET platform = EXCLUDED.platform, updated_at = now()`,
      [req.user.sub, String(b.token), b.platform ? String(b.platform).slice(0, 10) : null]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
