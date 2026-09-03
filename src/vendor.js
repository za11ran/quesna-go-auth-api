// Vendor Dashboard API — BACKEND_HANDOFF.md §8
//   POST /vendor/auth/login
//   GET  /vendor/me
//   GET  /vendor/profile        PUT /vendor/profile        PUT /vendor/profile/status
//   GET  /vendor/products       POST /vendor/products
//   PUT  /vendor/products/:id   PATCH /vendor/products/:id  DELETE /vendor/products/:id
//   GET  /vendor/change-requests  POST /vendor/change-requests/:id/cancel
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('./db');
const { signStaffToken, staffAuth } = require('./staff-auth');
const { submitChangeRequest, vendorFieldsNeedApproval, productFieldsNeedApproval } = require('./changeRequests');

const nowIso = () => new Date().toISOString();
const fail = (res, s, code, message) =>
  res.status(s).json({ success: false, error_code: code, message, timestamp: nowIso() });
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const vendorRole = staffAuth(['vendor_owner', 'vendor_staff']);

/* -------- login -------- */
router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, phone, password } = req.body || {};
    if (!password || (!email && !phone)) return fail(res, 422, 'MISSING_CREDENTIALS', 'الإيميل/الموبايل وكلمة السر مطلوبين');
    const { rows } = await db.query(
      `SELECT * FROM staff_users
        WHERE role IN ('vendor_owner','vendor_staff')
          AND (($1::text IS NOT NULL AND email = $1) OR ($2::text IS NOT NULL AND phone = $2))
        LIMIT 1`,
      [email || null, phone || null]
    );
    const staff = rows[0];
    if (!staff || !staff.is_active || !(await bcrypt.compare(String(password), staff.password_hash)))
      return fail(res, 401, 'INVALID_LOGIN', 'بيانات الدخول غير صحيحة');
    await db.query(`UPDATE staff_users SET last_login_at = now() WHERE id = $1`, [staff.id]);
    const vendor = await db.query(`SELECT id, name_ar, name_en, type, status FROM vendors WHERE id = $1`, [staff.vendor_id]);
    res.json({
      token: signStaffToken(staff),
      role: staff.role,
      vendor: vendor.rows[0] || null,
      user: { id: staff.id, name: staff.name, email: staff.email, phone: staff.phone },
    });
  } catch (e) {
    next(e);
  }
});

/* -------- me -------- */
router.get('/me', vendorRole, async (req, res, next) => {
  try {
    const v = await db.query(`SELECT * FROM vendors WHERE id = $1`, [req.staff.vendor_id]);
    const pending = await db.query(
      `SELECT count(*)::int c FROM change_requests WHERE vendor_id = $1 AND status = 'pending'`,
      [req.staff.vendor_id]
    );
    res.json({
      user: { id: req.staff.id, role: req.staff.role },
      vendor: v.rows[0] || null,
      permissions: req.staff.role === 'vendor_owner'
        ? ['profile', 'products', 'prices', 'offers', 'orders', 'staff']
        : ['orders', 'product_availability'],
      pending_change_requests: pending.rows[0].c,
    });
  } catch (e) {
    next(e);
  }
});

/* -------- profile -------- */
router.get('/profile', vendorRole, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM vendors WHERE id = $1`, [req.staff.vendor_id]);
    if (!rows.length) return fail(res, 404, 'VENDOR_NOT_FOUND', 'المتجر غير موجود');
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// PUT /vendor/profile — الحقول الحسّاسة تروح Change Request
router.put('/profile', vendorRole, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const cur = (await db.query(`SELECT * FROM vendors WHERE id = $1`, [req.staff.vendor_id])).rows[0];
    if (!cur) return fail(res, 404, 'VENDOR_NOT_FOUND', 'المتجر غير موجود');

    const allowed = ['name_ar', 'name_en', 'description_ar', 'description_en', 'phone',
      'delivery_fee', 'min_order', 'avg_prep_time_minutes', 'address_ar', 'address_en', 'lat', 'lng'];
    const b = req.body || {};
    const changes = {};
    for (const k of allowed) {
      if (b[k] === undefined) continue;
      const val = ['delivery_fee', 'min_order', 'avg_prep_time_minutes', 'lat', 'lng'].includes(k) ? num(b[k]) : String(b[k]);
      if (String(cur[k] ?? '') !== String(val ?? '')) changes[k] = val;
    }
    if (!Object.keys(changes).length) return fail(res, 422, 'NOTHING_TO_UPDATE', 'مفيش تعديلات');

    if (await vendorFieldsNeedApproval(Object.keys(changes))) {
      const out = await submitChangeRequest({
        vendorId: req.staff.vendor_id, submittedBy: req.staff.id,
        entityType: 'vendor', entityId: req.staff.vendor_id, action: 'update',
        currentValues: Object.fromEntries(Object.keys(changes).map((k) => [k, cur[k]])),
        newValues: changes,
      });
      return res.status(202).json(out);
    }
    // كله حقول غير حسّاسة -> فوري
    const cols = Object.keys(changes);
    await db.query(
      `UPDATE vendors SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1}`,
      [...cols.map((c) => changes[c]), req.staff.vendor_id]
    );
    res.json((await db.query(`SELECT * FROM vendors WHERE id = $1`, [req.staff.vendor_id])).rows[0]);
  } catch (e) {
    next(e);
  }
});

// PUT /vendor/profile/status — فتح/قفل فوري
router.put('/profile/status', vendorRole, async (req, res, next) => {
  try {
    const isOpen = req.body && (req.body.is_open === true || req.body.is_open === 'true');
    await db.query(`UPDATE vendors SET is_open = $2, updated_at = now() WHERE id = $1`, [req.staff.vendor_id, isOpen]);
    res.json({ success: true, is_open: isOpen });
  } catch (e) {
    next(e);
  }
});

/* -------- products -------- */
router.get('/products', vendorRole, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page, 10) || 50));
    const where = ['vendor_id = $1', 'deleted_at IS NULL'];
    const params = [req.staff.vendor_id];
    if (req.query.category) { params.push(String(req.query.category)); where.push(`category = $${params.length}`); }
    if (req.query.search) { params.push(`%${String(req.query.search).trim()}%`); where.push(`(name_ar ILIKE $${params.length} OR name_en ILIKE $${params.length})`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await db.query(`SELECT count(*)::int c FROM products ${whereSql}`, params)).rows[0].c;
    params.push(perPage, (page - 1) * perPage);
    const { rows } = await db.query(
      `SELECT p.* FROM products p ${whereSql} ORDER BY p.sort_order, p.name_ar
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    if (rows.length) {
      const ph = rows.map((_, i) => `$${i + 1}`).join(', ');
      const opts = await db.query(
        `SELECT * FROM product_options WHERE product_id IN (${ph}) ORDER BY sort_order, id`,
        rows.map((p) => p.id)
      );
      const byP = {};
      for (const o of opts.rows) (byP[o.product_id] ||= []).push(o);
      for (const p of rows) p.options = byP[p.id] || [];
    }
    res.json({ data: rows, meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) } });
  } catch (e) {
    next(e);
  }
});

// PATCH — تعديل تشغيلي فوري: stock / is_available
router.patch('/products/:id', vendorRole, async (req, res, next) => {
  try {
    const p = (await db.query(`SELECT * FROM products WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`, [req.params.id, req.staff.vendor_id])).rows[0];
    if (!p) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'المنتج غير موجود');
    const b = req.body || {};
    const set = [];
    const params = [];
    if (b.stock !== undefined) { params.push(b.stock === null ? null : parseInt(b.stock, 10)); set.push(`stock = $${params.length}`); }
    if (b.is_available !== undefined) { params.push(b.is_available === true || b.is_available === 'true'); set.push(`is_available = $${params.length}`); }
    if (!set.length) return fail(res, 422, 'NOTHING_TO_UPDATE', 'مفيش تعديلات فورية');
    params.push(req.params.id);
    await db.query(`UPDATE products SET ${set.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    res.json((await db.query(`SELECT * FROM products WHERE id = $1`, [req.params.id])).rows[0]);
  } catch (e) {
    next(e);
  }
});

// PUT — تعديل حسّاس (سعر/اسم/أحجام) -> Change Request
router.put('/products/:id', vendorRole, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const cur = (await db.query(`SELECT * FROM products WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`, [req.params.id, req.staff.vendor_id])).rows[0];
    if (!cur) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'المنتج غير موجود');

    const allowed = ['name_ar', 'name_en', 'brand', 'description_ar', 'description_en', 'price', 'category', 'sort_order'];
    const b = req.body || {};
    const changes = {};
    for (const k of allowed) {
      if (b[k] === undefined) continue;
      const val = ['price', 'sort_order'].includes(k) ? num(b[k]) : String(b[k]);
      if (String(cur[k] ?? '') !== String(val ?? '')) changes[k] = val;
    }
    let optionsChanged = null;
    if (Array.isArray(b.options)) {
      optionsChanged = b.options.map((o) => ({
        id: String(o.id), name_ar: String(o.name_ar || o.name || ''), name_en: String(o.name_en || o.name || ''),
        price: Number(o.price), stock: o.stock === null || o.stock === undefined ? null : parseInt(o.stock, 10),
        is_available: o.is_available !== false,
      }));
    }
    if (!Object.keys(changes).length && !optionsChanged) return fail(res, 422, 'NOTHING_TO_UPDATE', 'مفيش تعديلات');

    const newValues = { ...changes };
    if (optionsChanged) newValues.options = optionsChanged;

    if (optionsChanged || (await productFieldsNeedApproval(Object.keys(changes)))) {
      const out = await submitChangeRequest({
        vendorId: req.staff.vendor_id, submittedBy: req.staff.id,
        entityType: 'product', entityId: req.params.id, action: 'update',
        currentValues: Object.fromEntries(Object.keys(changes).map((k) => [k, cur[k]])),
        newValues,
      });
      return res.status(202).json(out);
    }
    const cols = Object.keys(changes);
    await db.query(
      `UPDATE products SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1}`,
      [...cols.map((c) => changes[c]), req.params.id]
    );
    res.json((await db.query(`SELECT * FROM products WHERE id = $1`, [req.params.id])).rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST — إضافة منتج -> Change Request
router.post('/products', vendorRole, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const b = req.body || {};
    if (!b.name_ar && !b.name) return fail(res, 422, 'NAME_REQUIRED', 'اسم المنتج مطلوب');
    if (num(b.price) === null) return fail(res, 422, 'PRICE_REQUIRED', 'سعر المنتج مطلوب');
    const pid = `${req.staff.vendor_id}_${Date.now().toString(36)}`;
    const newValues = {
      id: pid, vendor_id: req.staff.vendor_id,
      name_ar: String(b.name_ar || b.name), name_en: String(b.name_en || b.name || b.name_ar),
      brand: b.brand ? String(b.brand) : '', description_ar: b.description_ar ? String(b.description_ar) : '',
      description_en: b.description_en ? String(b.description_en) : '',
      price: num(b.price), category: b.category ? String(b.category) : null,
      stock: b.stock === undefined || b.stock === null ? null : parseInt(b.stock, 10),
      is_available: b.is_available !== false, has_options: Array.isArray(b.options) && b.options.length > 0,
      sort_order: num(b.sort_order) || 0,
    };
    const out = await submitChangeRequest({
      vendorId: req.staff.vendor_id, submittedBy: req.staff.id,
      entityType: 'product', entityId: pid, action: 'create',
      currentValues: {}, newValues,
    });
    res.status(202).json(out);
  } catch (e) {
    next(e);
  }
});

// DELETE — حذف soft -> Change Request
router.delete('/products/:id', vendorRole, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const cur = (await db.query(`SELECT id, name_ar FROM products WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`, [req.params.id, req.staff.vendor_id])).rows[0];
    if (!cur) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'المنتج غير موجود');
    const out = await submitChangeRequest({
      vendorId: req.staff.vendor_id, submittedBy: req.staff.id,
      entityType: 'product', entityId: req.params.id, action: 'delete',
      currentValues: { id: cur.id, name_ar: cur.name_ar }, newValues: {},
    });
    res.status(202).json(out);
  } catch (e) {
    next(e);
  }
});

/* -------- change requests (vendor side) -------- */
router.get('/change-requests', vendorRole, async (req, res, next) => {
  try {
    const where = ['vendor_id = $1'];
    const params = [req.staff.vendor_id];
    if (req.query.status) { params.push(String(req.query.status)); where.push(`status = $${params.length}`); }
    const { rows } = await db.query(
      `SELECT * FROM change_requests WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/change-requests/:id/cancel', vendorRole, async (req, res, next) => {
  try {
    const cr = (await db.query(`SELECT * FROM change_requests WHERE id = $1 AND vendor_id = $2`, [req.params.id, req.staff.vendor_id])).rows[0];
    if (!cr) return fail(res, 404, 'CR_NOT_FOUND', 'طلب التغيير غير موجود');
    if (cr.status !== 'pending') return fail(res, 409, 'CR_NOT_PENDING', 'لا يمكن سحب طلب تمت مراجعته');
    await db.query(`UPDATE change_requests SET status = 'cancelled', reviewed_at = now() WHERE id = $1`, [cr.id]);
    if (cr.entity_type === 'product' && cr.entity_id) {
      const others = await db.query(`SELECT 1 FROM change_requests WHERE entity_id = $1 AND status = 'pending'`, [cr.entity_id]);
      if (!others.rowCount) await db.query(`UPDATE products SET has_pending_change = false WHERE id = $1`, [cr.entity_id]);
    }
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
