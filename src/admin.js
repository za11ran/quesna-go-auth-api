// Admin Dashboard API — BACKEND_HANDOFF.md §5 (part), §9
//   POST /admin/auth/login
//   GET  /admin/change-requests            GET /admin/change-requests/:id
//   POST /admin/change-requests/:id/approve   POST /admin/change-requests/:id/reject
//   GET  /admin/settings/approval-rules    POST /admin/settings/approval-rules
//   GET  /admin/vendors  POST /admin/vendors/:id/approve  POST /admin/vendors/:id/suspend
//   POST /admin/products/most-requested   (تحديد الأكثر طلبًا)
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('./db');
const { signStaffToken, staffAuth } = require('./staff-auth');
const { applyChangeRequest } = require('./changeRequests');
const { notify } = require('./notify');
const { imageUpload, saveImage } = require('./upload');

const slug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `v${Date.now().toString(36)}`;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const nowIso = () => new Date().toISOString();
const fail = (res, s, code, message) =>
  res.status(s).json({ success: false, error_code: code, message, timestamp: nowIso() });
const adminOnly = staffAuth(['admin']);
// المشرف يقدر يراجع طلبات التغيير كمان (قابل للضبط)
const reviewer = staffAuth(['admin', 'dispatcher']);

/* -------- login (staff عام) -------- */
router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, phone, password } = req.body || {};
    if (!password || (!email && !phone)) return fail(res, 422, 'MISSING_CREDENTIALS', 'البيانات ناقصة');
    const { rows } = await db.query(
      `SELECT * FROM staff_users
        WHERE (($1::text IS NOT NULL AND email = $1) OR ($2::text IS NOT NULL AND phone = $2))
        LIMIT 1`,
      [email || null, phone || null]
    );
    const s = rows[0];
    if (!s || !s.is_active || !(await bcrypt.compare(String(password), s.password_hash)))
      return fail(res, 401, 'INVALID_LOGIN', 'بيانات الدخول غير صحيحة');
    await db.query(`UPDATE staff_users SET last_login_at = now() WHERE id = $1`, [s.id]);
    res.json({
      token: signStaffToken(s),
      role: s.role,
      user: { id: s.id, name: s.name, email: s.email, phone: s.phone, vendor_id: s.vendor_id, driver_id: s.driver_id },
    });
  } catch (e) {
    next(e);
  }
});

/* -------- change requests -------- */
router.get('/change-requests', reviewer, async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    for (const [q, col] of [['status', 'cr.status'], ['type', 'cr.entity_type'], ['vendor_id', 'cr.vendor_id']]) {
      if (req.query[q]) { params.push(String(req.query[q])); where.push(`${col} = $${params.length}`); }
    }
    if (!where.length) { params.push('pending'); where.push(`cr.status = $1`); }
    const { rows } = await db.query(
      `SELECT cr.*, v.name_ar AS vendor_name, su.name AS submitted_by_name
         FROM change_requests cr
         LEFT JOIN vendors v ON v.id = cr.vendor_id
         LEFT JOIN staff_users su ON su.id = cr.submitted_by
        WHERE ${where.join(' AND ')} ORDER BY cr.created_at DESC`,
      params
    );
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/change-requests/:id', reviewer, async (req, res, next) => {
  try {
    const cr = (await db.query(`SELECT * FROM change_requests WHERE id = $1`, [req.params.id])).rows[0];
    if (!cr) return fail(res, 404, 'CR_NOT_FOUND', 'طلب التغيير غير موجود');
    // diff بسيط
    const keys = new Set([...Object.keys(cr.current_values || {}), ...Object.keys(cr.new_values || {})]);
    const diff = [...keys].map((k) => ({ field: k, from: (cr.current_values || {})[k] ?? null, to: (cr.new_values || {})[k] ?? null }));
    res.json({ ...cr, diff });
  } catch (e) {
    next(e);
  }
});

router.post('/change-requests/:id/approve', reviewer, async (req, res, next) => {
  try {
    const cr = (await db.query(`SELECT * FROM change_requests WHERE id = $1`, [req.params.id])).rows[0];
    if (!cr) return fail(res, 404, 'CR_NOT_FOUND', 'طلب التغيير غير موجود');
    if (cr.status !== 'pending') return fail(res, 409, 'CR_NOT_PENDING', 'الطلب تمت مراجعته بالفعل');
    await applyChangeRequest(cr);
    await db.query(
      `UPDATE change_requests SET status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
      [cr.id, req.staff.id]
    );
    const owners = await db.query(
      `SELECT id FROM staff_users WHERE vendor_id = $1 AND role = 'vendor_owner' AND is_active = true`,
      [cr.vendor_id]
    );
    for (const o of owners.rows) {
      await notify(o.id, { title: 'تمت الموافقة على تعديلك', body: `طلب ${cr.id}`, type: 'change_request_approved', data: { change_request_id: cr.id }, recipientType: 'staff' });
    }
    res.json({ success: true, status: 'approved' });
  } catch (e) {
    next(e);
  }
});

router.post('/change-requests/:id/reject', reviewer, async (req, res, next) => {
  try {
    const cr = (await db.query(`SELECT * FROM change_requests WHERE id = $1`, [req.params.id])).rows[0];
    if (!cr) return fail(res, 404, 'CR_NOT_FOUND', 'طلب التغيير غير موجود');
    if (cr.status !== 'pending') return fail(res, 409, 'CR_NOT_PENDING', 'الطلب تمت مراجعته بالفعل');
    const note = req.body && req.body.note ? String(req.body.note).slice(0, 500) : null;
    await db.query(
      `UPDATE change_requests SET status = 'rejected', review_note = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
      [cr.id, note, req.staff.id]
    );
    if (cr.entity_type === 'product' && cr.entity_id) {
      const others = await db.query(`SELECT 1 FROM change_requests WHERE entity_id = $1 AND status = 'pending'`, [cr.entity_id]);
      if (!others.rowCount) await db.query(`UPDATE products SET has_pending_change = false WHERE id = $1`, [cr.entity_id]);
    } else if (cr.entity_type === 'vendor') {
      await db.query(`UPDATE vendors SET has_pending_change = false WHERE id = $1`, [cr.vendor_id]);
    }
    const owners = await db.query(
      `SELECT id FROM staff_users WHERE vendor_id = $1 AND role = 'vendor_owner' AND is_active = true`,
      [cr.vendor_id]
    );
    for (const o of owners.rows) {
      await notify(o.id, { title: 'تم رفض تعديلك', body: note ? `السبب: ${note}` : 'بدون سبب', type: 'change_request_rejected', data: { change_request_id: cr.id }, recipientType: 'staff' });
    }
    res.json({ success: true, status: 'rejected' });
  } catch (e) {
    next(e);
  }
});

/* -------- approval rules -------- */
router.get('/settings/approval-rules', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = 'approval_rules'`);
    res.json(rows[0] ? rows[0].value : {});
  } catch (e) {
    next(e);
  }
});

router.post('/settings/approval-rules', adminOnly, async (req, res, next) => {
  try {
    const value = req.body && typeof req.body === 'object' ? req.body : {};
    await db.query(
      `INSERT INTO app_settings (key, value) VALUES ('approval_rules', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(value)]
    );
    res.json({ success: true, value });
  } catch (e) {
    next(e);
  }
});

/* -------- تسعير التوصيل (سعر أساسي لكل قرية + رسوم لكل متجر إضافي) -------- */
router.get('/settings/delivery-pricing', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = 'delivery_pricing'`);
    res.json({ extra_vendor_fee: Number((rows[0]?.value || {}).extra_vendor_fee ?? 15) });
  } catch (e) { next(e); }
});

router.post('/settings/delivery-pricing', adminOnly, async (req, res, next) => {
  try {
    const fee = num((req.body || {}).extra_vendor_fee);
    if (fee === null || fee < 0) return fail(res, 422, 'INVALID_FEE', 'قيمة الرسوم غير صحيحة');
    await db.query(
      `INSERT INTO app_settings (key, value) VALUES ('delivery_pricing', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify({ extra_vendor_fee: fee })]
    );
    res.json({ extra_vendor_fee: fee });
  } catch (e) { next(e); }
});

/* -------- القرى: سعر التوصيل الأساسي لكل قرية -------- */
router.get('/villages', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM villages ORDER BY id`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.put('/villages/:id', adminOnly, async (req, res, next) => {
  try {
    const fee = num((req.body || {}).delivery_base_fee);
    if (fee === null || fee < 0) return fail(res, 422, 'INVALID_FEE', 'السعر غير صحيح');
    const { rows } = await db.query(
      `UPDATE villages SET delivery_base_fee = $1 WHERE id = $2 RETURNING *`,
      [fee, req.params.id]
    );
    if (!rows.length) return fail(res, 404, 'VILLAGE_NOT_FOUND', 'القرية غير موجودة');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/* -------- vendors -------- */
router.get('/vendors', adminOnly, async (req, res, next) => {
  try {
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (req.query.status) { params.push(String(req.query.status)); where.push(`status = $${params.length}`); }
    const { rows } = await db.query(`SELECT * FROM vendors WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params);
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/vendors/:id/approve', adminOnly, async (req, res, next) => {
  try {
    const r = await db.query(`UPDATE vendors SET status = 'approved', is_active = true, updated_at = now() WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
    if (!r.rowCount) return fail(res, 404, 'VENDOR_NOT_FOUND', 'المتجر غير موجود');
    res.json({ success: true, status: 'approved' });
  } catch (e) {
    next(e);
  }
});

router.post('/vendors/:id/suspend', adminOnly, async (req, res, next) => {
  try {
    const r = await db.query(`UPDATE vendors SET status = 'suspended', updated_at = now() WHERE id = $1`, [req.params.id]);
    if (!r.rowCount) return fail(res, 404, 'VENDOR_NOT_FOUND', 'المتجر غير موجود');
    res.json({ success: true, status: 'suspended' });
  } catch (e) {
    next(e);
  }
});

/* -------- products list (لاختيار الأكثر طلبًا) -------- */
router.get('/products', adminOnly, async (req, res, next) => {
  try {
    const where = ['p.deleted_at IS NULL', 'v.deleted_at IS NULL'];
    const params = [];
    if (req.query.vendor_id) { params.push(String(req.query.vendor_id)); where.push(`p.vendor_id = $${params.length}`); }
    if (req.query.search) {
      params.push(`%${String(req.query.search).trim()}%`);
      where.push(`(p.name_ar ILIKE $${params.length} OR p.name_en ILIKE $${params.length})`);
    }
    if (req.query.most_requested === 'true') where.push('p.is_most_requested = true');
    const { rows } = await db.query(
      `SELECT p.id, p.name_ar, p.name_en, p.price, p.image, p.category, p.is_available,
              p.is_most_requested, p.vendor_id, v.name_ar AS vendor_name_ar, v.name_en AS vendor_name_en
         FROM products p JOIN vendors v ON v.id = p.vendor_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.is_most_requested DESC, v.name_ar, p.sort_order, p.name_ar
        LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

/* -------- most-requested -------- */
router.post('/products/most-requested', adminOnly, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body && req.body.product_ids) ? req.body.product_ids.map(String) : null;
    if (!ids) return fail(res, 422, 'PRODUCT_IDS_REQUIRED', 'product_ids مطلوبة');
    await db.query(`UPDATE products SET is_most_requested = false WHERE is_most_requested = true`);
    if (ids.length) {
      const ph = ids.map((_, i) => `$${i + 1}`).join(', ');
      await db.query(`UPDATE products SET is_most_requested = true WHERE id IN (${ph})`, ids);
    }
    res.json({ success: true, count: ids.length });
  } catch (e) {
    next(e);
  }
});

/* ================= Home categories CRUD ================= */
router.get('/categories', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM categories ORDER BY sort_order, id`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});
router.post('/categories', adminOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name_ar && !b.name_en) return fail(res, 422, 'NAME_REQUIRED', 'اسم القسم مطلوب');
    const { rows } = await db.query(
      `INSERT INTO categories (name_ar, name_en, image, type, action, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [String(b.name_ar || b.name_en), String(b.name_en || b.name_ar), b.image || null,
       b.type || 'vendors', b.action || null, num(b.sort_order) || 0, b.is_active !== false]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});
router.put('/categories/:id', adminOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    const cols = [];
    const params = [];
    for (const k of ['name_ar', 'name_en', 'image', 'type', 'action', 'sort_order', 'is_active']) {
      if (b[k] === undefined) continue;
      params.push(k === 'sort_order' ? num(b[k]) : k === 'is_active' ? b[k] !== false : b[k]);
      cols.push(`${k} = $${params.length}`);
    }
    if (!cols.length) return fail(res, 422, 'NOTHING_TO_UPDATE', 'مفيش تعديلات');
    params.push(req.params.id);
    const { rows } = await db.query(`UPDATE categories SET ${cols.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (!rows.length) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'القسم غير موجود');
    res.json(rows[0]);
  } catch (e) { next(e); }
});
router.delete('/categories/:id', adminOnly, async (req, res, next) => {
  try {
    const r = await db.query(`DELETE FROM categories WHERE id = $1`, [req.params.id]);
    if (!r.rowCount) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'القسم غير موجود');
    res.json({ success: true });
  } catch (e) { next(e); }
});
router.post('/categories/:id/image', adminOnly, imageUpload, async (req, res, next) => {
  try {
    if (!req.file) return fail(res, 422, 'IMAGE_REQUIRED', 'الصورة مطلوبة');
    const img = await saveImage(req.file, { folder: 'categories', width: 600 });
    const { rows } = await db.query(`UPDATE categories SET image = $2 WHERE id = $1 RETURNING *`, [req.params.id, img.url]);
    if (!rows.length) return fail(res, 404, 'CATEGORY_NOT_FOUND', 'القسم غير موجود');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/* ================= Banners CRUD ================= */
router.get('/banners', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM banners ORDER BY sort_order, id`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});
router.post('/banners', adminOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.image) return fail(res, 422, 'IMAGE_REQUIRED', 'صورة البانر مطلوبة (ارفعها أولاً)');
    const { rows } = await db.query(
      `INSERT INTO banners (title_ar, title_en, image, target_type, target_ref, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.title_ar || null, b.title_en || null, String(b.image), b.target_type || null,
       b.target_ref || null, num(b.sort_order) || 0, b.is_active !== false]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});
router.put('/banners/:id', adminOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    const cols = [];
    const params = [];
    for (const k of ['title_ar', 'title_en', 'image', 'target_type', 'target_ref', 'sort_order', 'is_active']) {
      if (b[k] === undefined) continue;
      params.push(k === 'sort_order' ? num(b[k]) : k === 'is_active' ? b[k] !== false : b[k]);
      cols.push(`${k} = $${params.length}`);
    }
    if (!cols.length) return fail(res, 422, 'NOTHING_TO_UPDATE', 'مفيش تعديلات');
    params.push(req.params.id);
    const { rows } = await db.query(`UPDATE banners SET ${cols.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (!rows.length) return fail(res, 404, 'BANNER_NOT_FOUND', 'البانر غير موجود');
    res.json(rows[0]);
  } catch (e) { next(e); }
});
router.delete('/banners/:id', adminOnly, async (req, res, next) => {
  try {
    const r = await db.query(`DELETE FROM banners WHERE id = $1`, [req.params.id]);
    if (!r.rowCount) return fail(res, 404, 'BANNER_NOT_FOUND', 'البانر غير موجود');
    res.json({ success: true });
  } catch (e) { next(e); }
});
router.post('/banners/image', adminOnly, imageUpload, async (req, res, next) => {
  try {
    if (!req.file) return fail(res, 422, 'IMAGE_REQUIRED', 'الصورة مطلوبة');
    const img = await saveImage(req.file, { folder: 'banners', width: 1600 });
    res.status(201).json({ url: img.url });
  } catch (e) { next(e); }
});

/* ================= إنشاء متجر + حساب صاحبه ================= */
router.post('/vendors', adminOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name_ar && !b.name_en) return fail(res, 422, 'NAME_REQUIRED', 'اسم المتجر مطلوب');
    if (!b.owner_email || !b.owner_password) return fail(res, 422, 'OWNER_REQUIRED', 'إيميل وباسورد صاحب المتجر مطلوبين');
    const id = b.id ? slug(b.id) : slug(b.name_en || b.name_ar);
    const exists = await db.query(`SELECT 1 FROM vendors WHERE id = $1`, [id]);
    if (exists.rowCount) return fail(res, 409, 'VENDOR_EXISTS', 'معرّف المتجر مستخدم بالفعل');
    await db.query(
      `INSERT INTO vendors (id, name_ar, name_en, type, phone, delivery_fee, min_order, status, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'approved',true)`,
      [id, String(b.name_ar || b.name_en), String(b.name_en || b.name_ar),
       b.type || 'restaurant', b.phone || null, num(b.delivery_fee) || 0, num(b.min_order) || 0]
    );
    const hash = await bcrypt.hash(String(b.owner_password), 10);
    const owner = await db.query(
      `INSERT INTO staff_users (name, email, phone, password_hash, role, vendor_id)
       VALUES ($1,$2,$3,$4,'vendor_owner',$5) RETURNING id, email`,
      [b.owner_name || `صاحب ${b.name_ar || id}`, String(b.owner_email), b.owner_phone || null, hash, id]
    );
    res.status(201).json({ vendor_id: id, owner: owner.rows[0] });
  } catch (e) {
    if (e.code === '23505') return fail(res, 409, 'EMAIL_EXISTS', 'الإيميل مستخدم بالفعل');
    next(e);
  }
});

/* ================= حسابات الدليفري ================= */
router.get('/drivers', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*, s.email, s.is_active AS account_active FROM drivers d LEFT JOIN staff_users s ON s.id = d.staff_user_id ORDER BY d.created_at DESC`
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});
router.post('/drivers', adminOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.phone || !b.password) return fail(res, 422, 'MISSING_FIELDS', 'الاسم والموبايل والباسورد مطلوبين');
    const did = b.id ? slug(b.id) : `drv_${Date.now().toString(36)}`;
    const hash = await bcrypt.hash(String(b.password), 10);
    const staff = await db.query(
      `INSERT INTO staff_users (name, phone, email, password_hash, role, driver_id)
       VALUES ($1,$2,$3,$4,'driver',$5) RETURNING id`,
      [String(b.name), String(b.phone), b.email || null, hash, did]
    );
    await db.query(
      `INSERT INTO drivers (id, staff_user_id, name, phone, vehicle_type, zone, status, is_online)
       VALUES ($1,$2,$3,$4,$5,$6,'offline',false)`,
      [did, staff.rows[0].id, String(b.name), String(b.phone), b.vehicle_type || 'motorcycle', b.zone || null]
    );
    res.status(201).json({ driver_id: did, staff_user_id: staff.rows[0].id });
  } catch (e) {
    if (e.code === '23505') return fail(res, 409, 'EXISTS', 'الموبايل أو الإيميل مستخدم');
    next(e);
  }
});
router.put('/drivers/:id', adminOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    const cols = [];
    const params = [];
    for (const k of ['name', 'phone', 'vehicle_type', 'zone', 'photo']) {
      if (b[k] === undefined) continue;
      params.push(String(b[k])); cols.push(`${k} = $${params.length}`);
    }
    if (b.is_active !== undefined) {
      await db.query(`UPDATE staff_users SET is_active = $2 WHERE driver_id = $1`, [req.params.id, b.is_active !== false]);
    }
    if (cols.length) {
      params.push(req.params.id);
      await db.query(`UPDATE drivers SET ${cols.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    }
    const { rows } = await db.query(`SELECT * FROM drivers WHERE id = $1`, [req.params.id]);
    if (!rows.length) return fail(res, 404, 'DRIVER_NOT_FOUND', 'الدليفري غير موجود');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/* ================= حسابات المشرفين ================= */
router.get('/dispatchers', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT id, name, email, phone, is_active, last_login_at, created_at FROM staff_users WHERE role = 'dispatcher' ORDER BY created_at DESC`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});
router.post('/dispatchers', adminOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.password || (!b.email && !b.phone)) return fail(res, 422, 'MISSING_FIELDS', 'الاسم والباسورد والإيميل/الموبايل مطلوبين');
    const hash = await bcrypt.hash(String(b.password), 10);
    const { rows } = await db.query(
      `INSERT INTO staff_users (name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,$4,'dispatcher') RETURNING id, name, email, phone`,
      [String(b.name), b.email || null, b.phone || null, hash]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return fail(res, 409, 'EXISTS', 'الإيميل أو الموبايل مستخدم');
    next(e);
  }
});

/* ================= نظرة شاملة ================= */
router.get('/orders', adminOnly, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page, 10) || 30));
    const where = [];
    const params = [];
    if (req.query.status) { params.push(String(req.query.status)); where.push(`status = $${params.length}`); }
    if (req.query.vendor_id) {
      params.push(String(req.query.vendor_id));
      where.push(`id IN (SELECT order_id FROM order_vendors WHERE vendor_id = $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await db.query(`SELECT count(*)::int c FROM orders ${whereSql}`, params)).rows[0].c;
    params.push(perPage, (page - 1) * perPage);
    const { rows } = await db.query(
      `SELECT id, status, total, payment_method, payment_status, driver_id, placed_at
         FROM orders ${whereSql} ORDER BY placed_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) } });
  } catch (e) { next(e); }
});
router.get('/users', adminOnly, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page, 10) || 30));
    const total = (await db.query(`SELECT count(*)::int c FROM users`)).rows[0].c;
    const { rows } = await db.query(
      `SELECT id, full_name AS name, phone, email, status, preferred_language AS lang, created_at
         FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [perPage, (page - 1) * perPage]
    );
    res.json({ data: rows, meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) } });
  } catch (e) { next(e); }
});
router.get('/reports', adminOnly, async (req, res, next) => {
  try {
    const q = async (sql, p = []) => (await db.query(sql, p)).rows[0];
    const [orders, revenue, today, drivers, cr, vendors, customers] = await Promise.all([
      q(`SELECT count(*)::int c FROM orders`),
      q(`SELECT COALESCE(sum(total),0)::float c FROM orders WHERE status = 'delivered'`),
      q(`SELECT count(*)::int c FROM orders WHERE placed_at >= date_trunc('day', now())`),
      q(`SELECT count(*)::int c FROM drivers WHERE is_online = true`),
      q(`SELECT count(*)::int c FROM change_requests WHERE status = 'pending'`),
      q(`SELECT count(*)::int c FROM vendors WHERE deleted_at IS NULL`),
      q(`SELECT count(*)::int c FROM users`),
    ]);
    res.json({
      orders_total: orders.c, orders_today: today.c, revenue_delivered: revenue.c,
      drivers_online: drivers.c, pending_change_requests: cr.c,
      vendors: vendors.c, customers: customers.c,
    });
  } catch (e) { next(e); }
});

/* ================= أكواد الخصم (Coupons) ================= */
router.get('/coupons', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM coupons ORDER BY created_at DESC`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.post('/coupons', adminOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    const code = String(b.code || '').trim().toUpperCase();
    if (!code) return fail(res, 422, 'CODE_REQUIRED', 'كود الخصم مطلوب');
    if (num(b.discount_value) === null) return fail(res, 422, 'DISCOUNT_VALUE_REQUIRED', 'قيمة الخصم مطلوبة');
    try {
      const { rows } = await db.query(
        `INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_uses, starts_at, ends_at, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          code,
          b.discount_type === 'amount' ? 'amount' : 'percent',
          num(b.discount_value),
          num(b.min_order_amount) || 0,
          b.max_uses === '' || b.max_uses == null ? null : parseInt(b.max_uses, 10),
          b.starts_at || null,
          b.ends_at || null,
          b.is_active !== false,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return fail(res, 409, 'CODE_EXISTS', 'الكود ده مستخدم بالفعل');
      throw e;
    }
  } catch (e) { next(e); }
});

router.put('/coupons/:id', adminOnly, async (req, res, next) => {
  try {
    const cur = (await db.query(`SELECT * FROM coupons WHERE id = $1`, [req.params.id])).rows[0];
    if (!cur) return fail(res, 404, 'COUPON_NOT_FOUND', 'الكود غير موجود');
    const b = req.body || {};
    const code = b.code !== undefined && String(b.code).trim() ? String(b.code).trim().toUpperCase() : cur.code;
    try {
      const { rows } = await db.query(
        `UPDATE coupons SET code=$1, discount_type=$2, discount_value=$3, min_order_amount=$4,
                            max_uses=$5, starts_at=$6, ends_at=$7, is_active=$8
          WHERE id = $9 RETURNING *`,
        [
          code,
          b.discount_type === 'amount' ? 'amount' : (b.discount_type === 'percent' ? 'percent' : cur.discount_type),
          b.discount_value !== undefined ? (num(b.discount_value) ?? cur.discount_value) : cur.discount_value,
          b.min_order_amount !== undefined ? (num(b.min_order_amount) ?? 0) : cur.min_order_amount,
          b.max_uses !== undefined ? (b.max_uses === '' || b.max_uses == null ? null : parseInt(b.max_uses, 10)) : cur.max_uses,
          b.starts_at !== undefined ? (b.starts_at || null) : cur.starts_at,
          b.ends_at !== undefined ? (b.ends_at || null) : cur.ends_at,
          b.is_active !== undefined ? b.is_active !== false : cur.is_active,
          req.params.id,
        ]
      );
      res.json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return fail(res, 409, 'CODE_EXISTS', 'الكود ده مستخدم بالفعل');
      throw e;
    }
  } catch (e) { next(e); }
});

router.delete('/coupons/:id', adminOnly, async (req, res, next) => {
  try {
    const r = await db.query(`DELETE FROM coupons WHERE id = $1`, [req.params.id]);
    if (!r.rowCount) return fail(res, 404, 'COUPON_NOT_FOUND', 'الكود غير موجود');
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
