// Vendor Dashboard API — BACKEND_HANDOFF.md §8
//   POST /vendor/auth/login
//   GET  /vendor/me
//   GET  /vendor/profile        PUT /vendor/profile        PUT /vendor/profile/status
//   GET  /vendor/products       POST /vendor/products
//   PUT  /vendor/products/:id   PATCH /vendor/products/:id  DELETE /vendor/products/:id
//   GET/POST/PUT/DELETE /vendor/menu-sections[/:id]  (أقسام قائمة المطعم — فوري)
//   GET  /vendor/change-requests  POST /vendor/change-requests/:id/cancel
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('./db');
const { signStaffToken, staffAuth } = require('./staff-auth');
const { submitChangeRequest, vendorFieldsNeedApproval, productFieldsNeedApproval, hasFullPermissions } = require('./changeRequests');
const { loadOrder, serializeOrder, setStatus } = require('./orderView');
const { notify } = require('./notify');
const { emitTo } = require('./realtime');
const { imageUpload, saveImage } = require('./upload');

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

    // ملحوظة: مفيش delivery_fee/min_order هنا خالص — رسوم التوصيل بقت بتتحسب من سعر
    // القرية (deliveryPricing.js)، ومفيش حد أدنى للطلب تاني. اسم المتجر (name_ar/name_en)
    // برضو مش موجود هنا — الأدمن بس اللي يقدر يغيّره (PUT /admin/vendors/:id)، حتى لو
    // full_permissions مفعّلة للمتجر ده.
    const allowed = ['description_ar', 'description_en', 'phone',
      'avg_prep_time_minutes', 'address_ar', 'address_en', 'lat', 'lng'];
    const b = req.body || {};
    const changes = {};
    for (const k of allowed) {
      if (b[k] === undefined) continue;
      const val = ['avg_prep_time_minutes', 'lat', 'lng'].includes(k) ? num(b[k]) : String(b[k]);
      if (String(cur[k] ?? '') !== String(val ?? '')) changes[k] = val;
    }
    if (!Object.keys(changes).length) return fail(res, 422, 'NOTHING_TO_UPDATE', 'مفيش تعديلات');

    const full = await hasFullPermissions(req.staff.vendor_id);
    if (!full && (await vendorFieldsNeedApproval(Object.keys(changes)))) {
      const out = await submitChangeRequest({
        vendorId: req.staff.vendor_id, submittedBy: req.staff.id,
        entityType: 'vendor', entityId: req.staff.vendor_id, action: 'update',
        currentValues: Object.fromEntries(Object.keys(changes).map((k) => [k, cur[k]])),
        newValues: changes,
      });
      return res.status(202).json(out);
    }
    // full_permissions أو كله حقول غير حسّاسة -> فوري
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

// لوجو/غلاف المتجر: التاجر مالوش صلاحية يغيّرهم خالص (ولا حتى Change Request) —
// الأدمن بس اللي بيحطهم وقت إنشاء الحساب أو بعد كده (POST /admin/vendors/:id/logo|cover).

// مواعيد العمل — فوري (مش من الحقول الحسّاسة افتراضيًا)
router.put('/profile/working-hours', vendorRole, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.working_hours || typeof b.working_hours !== 'object') {
      return fail(res, 422, 'WORKING_HOURS_REQUIRED', 'مواعيد العمل مطلوبة');
    }
    await db.query(
      `UPDATE vendors SET working_hours = $2,
              working_hours_text_ar = COALESCE($3, working_hours_text_ar),
              working_hours_text_en = COALESCE($4, working_hours_text_en),
              updated_at = now()
        WHERE id = $1`,
      [req.staff.vendor_id, JSON.stringify(b.working_hours),
       b.working_hours_text_ar ? String(b.working_hours_text_ar) : null,
       b.working_hours_text_en ? String(b.working_hours_text_en) : null]
    );
    res.json((await db.query(`SELECT * FROM vendors WHERE id = $1`, [req.staff.vendor_id])).rows[0]);
  } catch (e) { next(e); }
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
    if (b.menu_section_id !== undefined) {
      if (b.menu_section_id === null || b.menu_section_id === '') {
        params.push(null);
        set.push(`menu_section_id = $${params.length}`);
      } else {
        const sid = parseInt(b.menu_section_id, 10);
        const ok = await db.query(`SELECT 1 FROM menu_sections WHERE id = $1 AND vendor_id = $2`, [sid, req.staff.vendor_id]);
        if (!ok.rowCount) return fail(res, 422, 'MENU_SECTION_NOT_FOUND', 'القسم غير موجود');
        params.push(sid);
        set.push(`menu_section_id = $${params.length}`);
      }
    }
    if (!set.length) return fail(res, 422, 'NOTHING_TO_UPDATE', 'مفيش تعديلات فورية');
    params.push(req.params.id);
    await db.query(`UPDATE products SET ${set.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    res.json((await db.query(`SELECT * FROM products WHERE id = $1`, [req.params.id])).rows[0]);
  } catch (e) {
    next(e);
  }
});

// PUT — تعديل اسم/وصف/فئة/أحجام (حسّاس -> Change Request إلا لو full_permissions).
// السعر مستثنى دايمًا: فوري لكل التجّار بغض النظر عن أي حاجة (شوف PATCH كمان للكمية).
router.put('/products/:id', vendorRole, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const cur = (await db.query(`SELECT * FROM products WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`, [req.params.id, req.staff.vendor_id])).rows[0];
    if (!cur) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'المنتج غير موجود');
    const b = req.body || {};

    // السعر فوري دايمًا
    let priceApplied = false;
    if (b.price !== undefined) {
      const priceVal = num(b.price);
      if (priceVal !== null && String(cur.price ?? '') !== String(priceVal ?? '')) {
        await db.query(`UPDATE products SET price = $2, updated_at = now() WHERE id = $1`, [req.params.id, priceVal]);
        priceApplied = true;
      }
    }

    // image هنا = التاجر لصق رابط صورة مباشرة. رفع ملف فعلي لسه من
    // POST /products/:id/image (منفصل، بيرفع لسيرفرنا بدل ما ياخد رابط جاهز).
    const allowed = ['name_ar', 'name_en', 'brand', 'description_ar', 'description_en', 'category', 'sort_order', 'image'];
    const changes = {};
    for (const k of allowed) {
      if (b[k] === undefined) continue;
      const val = k === 'sort_order' ? num(b[k]) : String(b[k]);
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
    if (!Object.keys(changes).length && !optionsChanged) {
      if (priceApplied) return res.json((await db.query(`SELECT * FROM products WHERE id = $1`, [req.params.id])).rows[0]);
      return fail(res, 422, 'NOTHING_TO_UPDATE', 'مفيش تعديلات');
    }

    const full = await hasFullPermissions(req.staff.vendor_id);
    if (!full && (optionsChanged || (await productFieldsNeedApproval(Object.keys(changes))))) {
      const newValues = { ...changes };
      if (optionsChanged) newValues.options = optionsChanged;
      const out = await submitChangeRequest({
        vendorId: req.staff.vendor_id, submittedBy: req.staff.id,
        entityType: 'product', entityId: req.params.id, action: 'update',
        currentValues: Object.fromEntries(Object.keys(changes).map((k) => [k, cur[k]])),
        newValues,
      });
      return res.status(202).json(out);
    }

    // full_permissions (أو حقول غير حسّاسة) -> فوري
    if (Object.keys(changes).length) {
      const cols = Object.keys(changes);
      await db.query(
        `UPDATE products SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1}`,
        [...cols.map((c) => changes[c]), req.params.id]
      );
    }
    if (optionsChanged) {
      await db.query(`DELETE FROM product_options WHERE product_id = $1`, [req.params.id]);
      for (let i = 0; i < optionsChanged.length; i++) {
        const o = optionsChanged[i];
        await db.query(
          `INSERT INTO product_options (product_id, id, name_ar, name_en, price, stock, is_available, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [req.params.id, o.id, o.name_ar, o.name_en, o.price, o.stock ?? null, o.is_available !== false, i + 1]
        );
      }
      await db.query(`UPDATE products SET has_options = $2 WHERE id = $1`, [req.params.id, optionsChanged.length > 0]);
    }
    res.json((await db.query(`SELECT * FROM products WHERE id = $1`, [req.params.id])).rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST — إضافة منتج (-> Change Request إلا لو full_permissions)
router.post('/products', vendorRole, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const b = req.body || {};
    if (!b.name_ar && !b.name) return fail(res, 422, 'NAME_REQUIRED', 'اسم المنتج مطلوب');
    if (num(b.price) === null) return fail(res, 422, 'PRICE_REQUIRED', 'سعر المنتج مطلوب');

    let menuSectionId = null;
    if (b.menu_section_id !== undefined && b.menu_section_id !== null && b.menu_section_id !== '') {
      const sid = parseInt(b.menu_section_id, 10);
      const ok = await db.query(`SELECT 1 FROM menu_sections WHERE id = $1 AND vendor_id = $2`, [sid, req.staff.vendor_id]);
      if (!ok.rowCount) return fail(res, 422, 'MENU_SECTION_NOT_FOUND', 'القسم غير موجود');
      menuSectionId = sid;
    }
    const options = Array.isArray(b.options) && b.options.length
      ? b.options.map((o) => ({
          id: String(o.id), name_ar: String(o.name_ar || o.name || ''), name_en: String(o.name_en || o.name || ''),
          price: Number(o.price), stock: o.stock === null || o.stock === undefined ? null : parseInt(o.stock, 10),
          is_available: o.is_available !== false,
        }))
      : null;

    const pid = `${req.staff.vendor_id}_${Date.now().toString(36)}`;
    const newValues = {
      id: pid, vendor_id: req.staff.vendor_id,
      name_ar: String(b.name_ar || b.name), name_en: String(b.name_en || b.name || b.name_ar),
      brand: b.brand ? String(b.brand) : '', description_ar: b.description_ar ? String(b.description_ar) : '',
      description_en: b.description_en ? String(b.description_en) : '',
      price: num(b.price), category: b.category ? String(b.category) : null,
      menu_section_id: menuSectionId,
      image: b.image ? String(b.image) : null,
      stock: b.stock === undefined || b.stock === null ? null : parseInt(b.stock, 10),
      is_available: b.is_available !== false, has_options: !!options,
      sort_order: num(b.sort_order) || 0,
    };
    if (options) newValues.options = options; // مش عمود حقيقي — بيتفصل قبل الـ INSERT في products

    if (await hasFullPermissions(req.staff.vendor_id)) {
      const cols = Object.keys(newValues).filter((c) => c !== 'options');
      await db.query(
        `INSERT INTO products (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
        cols.map((c) => newValues[c])
      );
      if (options) {
        for (let i = 0; i < options.length; i++) {
          const o = options[i];
          await db.query(
            `INSERT INTO product_options (product_id, id, name_ar, name_en, price, stock, is_available, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [pid, o.id, o.name_ar, o.name_en, o.price, o.stock ?? null, o.is_available !== false, i + 1]
          );
        }
      }
      return res.status(201).json((await db.query(`SELECT * FROM products WHERE id = $1`, [pid])).rows[0]);
    }

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

// DELETE — حذف soft (-> Change Request إلا لو full_permissions)
router.delete('/products/:id', vendorRole, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const cur = (await db.query(`SELECT id, name_ar FROM products WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`, [req.params.id, req.staff.vendor_id])).rows[0];
    if (!cur) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'المنتج غير موجود');

    if (await hasFullPermissions(req.staff.vendor_id)) {
      await db.query(`UPDATE products SET deleted_at = now() WHERE id = $1`, [req.params.id]);
      return res.json({ success: true });
    }

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

// POST /vendor/products/:id/image — رفع صورة المنتج (-> Change Request إلا لو full_permissions)
router.post('/products/:id/image', vendorRole, imageUpload, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const cur = (await db.query(`SELECT id, image FROM products WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`, [req.params.id, req.staff.vendor_id])).rows[0];
    if (!cur) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'المنتج غير موجود');
    if (!req.file) return fail(res, 422, 'IMAGE_REQUIRED', 'الصورة مطلوبة');
    const img = await saveImage(req.file, { folder: 'products', width: 1000 });

    if (await hasFullPermissions(req.staff.vendor_id)) {
      await db.query(`UPDATE products SET image = $2, updated_at = now() WHERE id = $1`, [req.params.id, img.url]);
      return res.json({ success: true, url: img.url });
    }

    const out = await submitChangeRequest({
      vendorId: req.staff.vendor_id, submittedBy: req.staff.id,
      entityType: 'product', entityId: req.params.id, action: 'update',
      currentValues: { image: cur.image || null }, newValues: { image: img.url },
    });
    res.status(202).json({ ...out, url: img.url });
  } catch (e) { next(e); }
});

/* -------- menu sections (أقسام قائمة المطعم: بيتزا/برجر/مشويات...) --------
   تنظيمية فقط (زي مواعيد العمل) — تعديل فوري بدون Change Request. */
router.get('/menu-sections', vendorRole, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM menu_sections WHERE vendor_id = $1 ORDER BY sort_order, id`,
      [req.staff.vendor_id]
    );
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/menu-sections', vendorRole, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name_ar || !String(b.name_ar).trim()) return fail(res, 422, 'NAME_REQUIRED', 'اسم القسم مطلوب');
    const { rows } = await db.query(
      `INSERT INTO menu_sections (vendor_id, name_ar, name_en, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.staff.vendor_id, String(b.name_ar).trim(), b.name_en ? String(b.name_en).trim() : '', num(b.sort_order) || 0]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.put('/menu-sections/:id', vendorRole, async (req, res, next) => {
  try {
    const cur = (await db.query(`SELECT * FROM menu_sections WHERE id = $1 AND vendor_id = $2`, [req.params.id, req.staff.vendor_id])).rows[0];
    if (!cur) return fail(res, 404, 'MENU_SECTION_NOT_FOUND', 'القسم غير موجود');
    const b = req.body || {};
    const nameAr = b.name_ar !== undefined && String(b.name_ar).trim() ? String(b.name_ar).trim() : cur.name_ar;
    const nameEn = b.name_en !== undefined ? String(b.name_en).trim() : cur.name_en;
    const sortOrder = b.sort_order !== undefined ? (num(b.sort_order) ?? cur.sort_order) : cur.sort_order;
    const { rows } = await db.query(
      `UPDATE menu_sections SET name_ar = $1, name_en = $2, sort_order = $3 WHERE id = $4 RETURNING *`,
      [nameAr, nameEn, sortOrder, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/menu-sections/:id', vendorRole, async (req, res, next) => {
  try {
    // المنتجات المرتبطة بالقسم بترجع menu_section_id = null تلقائيًا (ON DELETE SET NULL)
    const r = await db.query(`DELETE FROM menu_sections WHERE id = $1 AND vendor_id = $2`, [req.params.id, req.staff.vendor_id]);
    if (!r.rowCount) return fail(res, 404, 'MENU_SECTION_NOT_FOUND', 'القسم غير موجود');
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

/* -------- offers (§8.4) — فورية دايمًا (بدون Change Request) -------- */
const OFFER_FIELDS = ['title_ar', 'title_en', 'description_ar', 'description_en', 'banner_image',
  'scope', 'target_id', 'discount_type', 'discount_value', 'starts_at', 'ends_at', 'is_active'];

router.get('/offers', vendorRole, async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM offers WHERE vendor_id = $1 ORDER BY created_at DESC`, [req.staff.vendor_id]);
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.post('/offers', vendorRole, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const b = req.body || {};
    if (!b.title_ar && !b.title) return fail(res, 422, 'TITLE_REQUIRED', 'عنوان العرض مطلوب');
    if (num(b.discount_value) === null) return fail(res, 422, 'DISCOUNT_REQUIRED', 'قيمة الخصم مطلوبة');
    const id = `off_${req.staff.vendor_id}_${Date.now().toString(36)}`;
    const nv = {
      id, vendor_id: req.staff.vendor_id,
      title_ar: String(b.title_ar || b.title), title_en: String(b.title_en || b.title || b.title_ar),
      description_ar: b.description_ar ? String(b.description_ar) : '',
      description_en: b.description_en ? String(b.description_en) : '',
      banner_image: b.banner_image ? String(b.banner_image) : null,
      scope: ['store', 'category', 'product'].includes(b.scope) ? b.scope : 'store',
      target_id: b.target_id ? String(b.target_id) : null,
      discount_type: b.discount_type === 'amount' ? 'amount' : 'percent',
      discount_value: num(b.discount_value),
      starts_at: b.starts_at || null, ends_at: b.ends_at || null,
      is_active: b.is_active !== false,
    };
    const cols = Object.keys(nv);
    const { rows } = await db.query(
      `INSERT INTO offers (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      cols.map((c) => nv[c])
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.put('/offers/:id', vendorRole, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const cur = (await db.query(`SELECT * FROM offers WHERE id = $1 AND vendor_id = $2`, [req.params.id, req.staff.vendor_id])).rows[0];
    if (!cur) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    const b = req.body || {};
    const changes = {};
    for (const k of OFFER_FIELDS) {
      if (b[k] === undefined) continue;
      const val = k === 'discount_value' ? num(b[k]) : k === 'is_active' ? b[k] !== false : b[k] === null ? null : String(b[k]);
      if (String(cur[k] ?? '') !== String(val ?? '')) changes[k] = val;
    }
    if (!Object.keys(changes).length) return fail(res, 422, 'NOTHING_TO_UPDATE', 'مفيش تعديلات');
    const cols = Object.keys(changes);
    const { rows } = await db.query(
      `UPDATE offers SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} AND vendor_id = $${cols.length + 2} RETURNING *`,
      [...cols.map((c) => changes[c]), req.params.id, req.staff.vendor_id]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/offers/:id', vendorRole, async (req, res, next) => {
  try {
    if (req.staff.role !== 'vendor_owner') return fail(res, 403, 'FORBIDDEN', 'صلاحية غير كافية');
    const r = await db.query(`DELETE FROM offers WHERE id = $1 AND vendor_id = $2`, [req.params.id, req.staff.vendor_id]);
    if (!r.rowCount) return fail(res, 404, 'OFFER_NOT_FOUND', 'العرض غير موجود');
    res.json({ success: true });
  } catch (e) { next(e); }
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

/* -------- vendor orders (§8.5) -------- */
async function ownsOrder(orderId, vendorId) {
  const r = await db.query(`SELECT 1 FROM order_vendors WHERE order_id = $1 AND vendor_id = $2`, [orderId, vendorId]);
  return r.rowCount > 0;
}

router.get('/orders', vendorRole, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.per_page, 10) || 20));
    const where = ['ov.vendor_id = $1'];
    const params = [req.staff.vendor_id];
    if (req.query.status) { params.push(String(req.query.status)); where.push(`o.status = $${params.length}`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await db.query(`SELECT count(*)::int c FROM orders o JOIN order_vendors ov ON ov.order_id = o.id ${whereSql}`, params)).rows[0].c;
    params.push(perPage, (page - 1) * perPage);
    const { rows } = await db.query(
      `SELECT o.id FROM orders o JOIN order_vendors ov ON ov.order_id = o.id ${whereSql}
       ORDER BY o.placed_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const data = [];
    for (const r of rows) data.push(serializeOrder(await loadOrder(r.id)));
    res.json({ data, meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) } });
  } catch (e) { next(e); }
});

router.get('/orders/:id', vendorRole, async (req, res, next) => {
  try {
    if (!(await ownsOrder(req.params.id, req.staff.vendor_id))) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    const b = await loadOrder(req.params.id);
    res.json(serializeOrder(b));
  } catch (e) { next(e); }
});

const VENDOR_FLOW = {
  pending: ['accepted', 'rejected'],
  accepted: ['preparing', 'rejected'],
  preparing: ['ready_for_pickup'],
};

router.patch('/orders/:id/status', vendorRole, async (req, res, next) => {
  try {
    if (!(await ownsOrder(req.params.id, req.staff.vendor_id))) return fail(res, 404, 'ORDER_NOT_FOUND', 'الطلب غير موجود');
    const bundle = await loadOrder(req.params.id);
    const from = bundle.order.status;
    const to = String((req.body || {}).status || '');
    if (!(VENDOR_FLOW[from] || []).includes(to)) {
      return fail(res, 409, 'INVALID_TRANSITION', `لا يمكن الانتقال من ${from} إلى ${to}`);
    }

    if (to === 'accepted') {
      // خصم المخزون مرة واحدة
      if (!bundle.order.stock_deducted) {
        for (const it of bundle.items) {
          const qty = Number(it.quantity);
          if (it.option_id) {
            await db.query(
              `UPDATE product_options SET stock = stock - $3::int
                 WHERE product_id = $1 AND id = $2 AND stock IS NOT NULL AND stock >= $3::int`,
              [it.product_id, it.option_id, qty]
            );
          }
          await db.query(
            `UPDATE products SET stock = stock - $2::int
               WHERE id = $1 AND stock IS NOT NULL AND stock >= $2::int`,
            [it.product_id, qty]
          );
        }
        await db.query(`UPDATE orders SET stock_deducted = true WHERE id = $1`, [req.params.id]);
      }
      await setStatus(req.params.id, 'accepted', 'vendor');
      await notify(bundle.order.customer_id, {
        title: { ar: 'تم قبول طلبك', en: 'Your order was accepted' },
        body: {
          ar: `طلبك رقم ${req.params.id} قيد التحضير`,
          en: `Order ${req.params.id} is being prepared`,
        },
        type: 'order_accepted', orderId: req.params.id,
      });
    } else if (to === 'rejected') {
      const reason = (req.body || {}).reason ? String(req.body.reason).slice(0, 300) : null;
      await setStatus(req.params.id, 'rejected', 'vendor', { reject_reason: reason });
      await notify(bundle.order.customer_id, {
        title: { ar: 'اعتذر المتجر عن طلبك', en: 'The store could not accept your order' },
        body: reason
          ? { ar: reason, en: reason }
          : { ar: 'تم رفض الطلب', en: 'The order was rejected' },
        type: 'order_rejected', orderId: req.params.id,
      });
    } else if (to === 'ready_for_pickup') {
      await setStatus(req.params.id, 'ready_for_pickup', 'vendor');
      await notify(bundle.order.customer_id, {
        title: { ar: 'طلبك جاهز', en: 'Your order is ready' },
        body: {
          ar: 'المتجر جهّز طلبك وجاري تعيين مندوب توصيل',
          en: 'The store has prepared your order; a driver is being assigned',
        },
        type: 'order_ready', orderId: req.params.id,
      });
      emitTo('role:dispatcher', 'dispatch:needs_assignment', { order_id: req.params.id });
      emitTo('role:admin', 'dispatch:needs_assignment', { order_id: req.params.id });
    } else {
      await setStatus(req.params.id, to, 'vendor');
    }

    res.json(serializeOrder(await loadOrder(req.params.id)));
  } catch (e) { next(e); }
});

module.exports = router;
