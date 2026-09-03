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

module.exports = router;
