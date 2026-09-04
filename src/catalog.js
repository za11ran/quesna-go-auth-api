// Customer catalog API (قراءة فقط): التجّار، المنتجات، الأقسام، الأكثر طلبًا، العروض.
// متوافق مع BACKEND_HANDOFF.md §7 و §10.
//   GET /api/vendors?type=&search=&page=&per_page=
//   GET /api/vendors/:id
//   GET /api/vendors/:id/products?category=&search=&page=
//   GET /api/vendors/:id/products/:productId
//   GET /api/home/categories
//   GET /api/products/most-requested
//   GET /api/offers
const router = require('express').Router();
const db = require('./db');
const { langOf } = require('./lang'); // هيدر LANG أو ?lang= (ar|en)

const num = (v) => (v === null || v === undefined ? v : Number(v));

function paging(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(50, Math.max(1, parseInt(req.query.per_page, 10) || 20));
  return { page, perPage, offset: (page - 1) * perPage };
}
const listEnvelope = (rows, total, page, perPage) => ({
  data: rows,
  meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) },
});

const CATEGORY_LABELS = {
  restaurant: { ar: 'مطعم', en: 'Restaurant' },
  supermarket: { ar: 'سوبر ماركت', en: 'Supermarket' },
  pharmacy: { ar: 'صيدلية', en: 'Pharmacy' },
  bakery: { ar: 'مخبز', en: 'Bakery' },
  cafe: { ar: 'كافيه', en: 'Cafe' },
  other: { ar: 'متجر', en: 'Store' },
};

function serializeVendor(v, lang) {
  return {
    id: v.id,
    name: v[`name_${lang}`] || v.name_ar,
    type: v.type,
    description: v[`description_${lang}`] || v.description_ar || '',
    logo: v.logo || null,
    cover_image: v.cover_image || null,
    phone: v.phone || null,
    category_label: (CATEGORY_LABELS[v.type] || CATEGORY_LABELS.other)[lang],
    rating: num(v.rating) || 0,
    reviews_count: v.reviews_count || 0,
    is_open: v.is_open,
    is_active: v.is_active,
    status: v.status,
    working_hours: v.working_hours || null,
    working_hours_text: v[`working_hours_text_${lang}`] || null,
    delivery_fee: num(v.delivery_fee) || 0,
    min_order: num(v.min_order) || 0,
    avg_prep_time_minutes: v.avg_prep_time_minutes || 0,
    address: v[`address_${lang}`] || v.address_ar || null,
    location: v.lat != null && v.lng != null ? { lat: num(v.lat), lng: num(v.lng) } : null,
    delivery_zones: v.delivery_zones || [],
    has_pending_change: false,
  };
}

function serializeOption(o, productPrice, lang) {
  const price = num(o.price);
  return {
    id: o.id,
    name: o[`name_${lang}`] || o.name_ar,
    price,
    additional_price: Math.round((price - productPrice) * 100) / 100,
    stock: o.stock === null || o.stock === undefined ? null : Number(o.stock),
    is_available: o.is_available,
  };
}

// يحسب أفضل خصم فعّال لمنتج من قائمة عروض التاجر
function discountFor(product, offers) {
  const now = Date.now();
  let best = null;
  for (const off of offers) {
    if (!off.is_active) continue;
    // خصم بمبلغ ثابت ينطبق على منتج محدد فقط؛ store/category بمبلغ = خصم على مستوى الطلب (مش هنا)
    if (off.discount_type === 'amount' && off.scope !== 'product') continue;
    if (off.starts_at && new Date(off.starts_at).getTime() > now) continue;
    if (off.ends_at && new Date(off.ends_at).getTime() < now) continue;
    // scope='category': للسوبر ماركت وغيره target_id بيتطابق مع category، وللمطاعم
    // (مفيش category عندهم) بيتطابق مع menu_section_id بدالها.
    const matches =
      off.scope === 'store' ||
      (off.scope === 'category' && (
        off.target_id === product.category ||
        (product.menu_section_id != null && off.target_id === String(product.menu_section_id))
      )) ||
      (off.scope === 'product' && off.target_id === product.id);
    if (!matches) continue;
    const price = num(product.price);
    const priceAfter =
      off.discount_type === 'percent'
        ? price * (1 - num(off.discount_value) / 100)
        : Math.max(0, price - num(off.discount_value));
    const rounded = Math.round(priceAfter * 100) / 100;
    if (!best || rounded < best.price_after) {
      best = {
        type: off.discount_type === 'percent' ? 'percent' : 'amount',
        value: num(off.discount_value),
        price_after: rounded,
      };
    }
  }
  return best;
}

function serializeProduct(p, options, offers, lang) {
  const price = num(p.price);
  return {
    id: p.id,
    vendor_id: p.vendor_id,
    product_name: p[`name_${lang}`] || p.name_ar,
    brand: p.brand || '',
    description: p[`description_${lang}`] || p.description_ar || '',
    price,
    image: p.image || null,
    category: p.category || null,
    menu_section_id: p.menu_section_id || null,
    stock: p.stock === null || p.stock === undefined ? null : Number(p.stock),
    is_available: p.is_available,
    has_options: p.has_options,
    sort_order: p.sort_order || 0,
    discount: discountFor(p, offers),
    has_pending_change: false,
    options: (options || []).map((o) => serializeOption(o, price, lang)),
  };
}

async function loadOptions(productIds) {
  if (!productIds.length) return {};
  const { rows } = await db.query(
    `SELECT * FROM product_options WHERE product_id = ANY($1) ORDER BY sort_order, id`,
    [productIds]
  );
  const byProduct = {};
  for (const r of rows) (byProduct[r.product_id] ||= []).push(r);
  return byProduct;
}

async function loadOffers(vendorId) {
  const { rows } = await db.query(
    `SELECT * FROM offers WHERE vendor_id = $1 AND is_active = true`,
    [vendorId]
  );
  return rows;
}

/* ---------------- GET /api/vendors ---------------- */
router.get('/vendors', async (req, res, next) => {
  try {
    const lang = langOf(req);
    const { page, perPage, offset } = paging(req);
    const where = [`v.deleted_at IS NULL`, `v.is_active = true`, `v.status = 'approved'`];
    const params = [];
    if (req.query.type) {
      params.push(String(req.query.type));
      where.push(`v.type = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).trim()}%`);
      where.push(`(v.name_ar ILIKE $${params.length} OR v.name_en ILIKE $${params.length})`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalRes = await db.query(`SELECT count(*)::int AS c FROM vendors v ${whereSql}`, params);
    params.push(perPage, offset);
    const { rows } = await db.query(
      `SELECT v.* FROM vendors v ${whereSql}
       ORDER BY v.is_open DESC, v.rating DESC, v.name_ar
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(listEnvelope(rows.map((v) => serializeVendor(v, lang)), totalRes.rows[0].c, page, perPage));
  } catch (e) {
    next(e);
  }
});

/* ---------------- GET /api/vendors/:id ---------------- */
router.get('/vendors/:id', async (req, res, next) => {
  try {
    const lang = langOf(req);
    const { rows } = await db.query(
      `SELECT * FROM vendors WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, error_code: 'VENDOR_NOT_FOUND', message: 'المتجر غير موجود', timestamp: new Date().toISOString() });
    }
    res.json(serializeVendor(rows[0], lang));
  } catch (e) {
    next(e);
  }
});

/* ---------------- GET /api/vendors/:id/products ---------------- */
router.get('/vendors/:id/products', async (req, res, next) => {
  try {
    const lang = langOf(req);
    const { page, perPage, offset } = paging(req);
    const vendor = await db.query(`SELECT id FROM vendors WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
    if (!vendor.rowCount) {
      return res
        .status(404)
        .json({ success: false, error_code: 'VENDOR_NOT_FOUND', message: 'المتجر غير موجود', timestamp: new Date().toISOString() });
    }
    const where = [`p.vendor_id = $1`, `p.deleted_at IS NULL`];
    const params = [req.params.id];
    if (req.query.category) {
      params.push(String(req.query.category));
      where.push(`p.category = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).trim()}%`);
      where.push(`(p.name_ar ILIKE $${params.length} OR p.name_en ILIKE $${params.length})`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalRes = await db.query(`SELECT count(*)::int AS c FROM products p ${whereSql}`, params);
    params.push(perPage, offset);
    const { rows } = await db.query(
      `SELECT p.* FROM products p ${whereSql}
       ORDER BY p.sort_order, p.name_ar
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const opts = await loadOptions(rows.map((p) => p.id));
    const offers = await loadOffers(req.params.id);
    res.json(
      listEnvelope(
        rows.map((p) => serializeProduct(p, opts[p.id], offers, lang)),
        totalRes.rows[0].c,
        page,
        perPage
      )
    );
  } catch (e) {
    next(e);
  }
});

/* ---------------- GET /api/vendors/:id/products/:productId ---------------- */
router.get('/vendors/:id/products/:productId', async (req, res, next) => {
  try {
    const lang = langOf(req);
    const { rows } = await db.query(
      `SELECT * FROM products WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`,
      [req.params.productId, req.params.id]
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, error_code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود', timestamp: new Date().toISOString() });
    }
    const opts = await loadOptions([rows[0].id]);
    const offers = await loadOffers(req.params.id);
    res.json(serializeProduct(rows[0], opts[rows[0].id], offers, lang));
  } catch (e) {
    next(e);
  }
});

/* ---------------- GET /api/vendors/:id/menu-sections ---------------- */
// أقسام قائمة المطعم (بيتزا/برجر/مشويات...) — يديرها التاجر من لوحته.
router.get('/vendors/:id/menu-sections', async (req, res, next) => {
  try {
    const lang = langOf(req);
    const { rows } = await db.query(
      `SELECT id, name_ar, name_en, sort_order FROM menu_sections
        WHERE vendor_id = $1 ORDER BY sort_order, id`,
      [req.params.id]
    );
    res.json({
      data: rows.map((s) => ({
        id: s.id,
        name: s[`name_${lang}`] || s.name_ar,
        name_ar: s.name_ar,
        name_en: s.name_en,
        sort_order: s.sort_order,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/* ---------------- GET /api/home/categories ---------------- */
router.get('/home/categories', async (req, res, next) => {
  try {
    const lang = langOf(req);
    const { rows } = await db.query(
      `SELECT * FROM categories WHERE is_active = true ORDER BY sort_order, id`
    );
    res.json({
      data: rows.map((c) => ({
        id: c.id,
        name: c[`name_${lang}`] || c.name_ar,
        image: c.image || null,
        type: c.type,
        action: c.action || null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/* ---------------- GET /api/home/banners ---------------- */
router.get('/home/banners', async (req, res, next) => {
  try {
    const lang = langOf(req);
    const { rows } = await db.query(
      `SELECT * FROM banners WHERE is_active = true ORDER BY sort_order, id`
    );
    res.json({
      data: rows.map((x) => ({
        id: x.id,
        title: x[`title_${lang}`] || x.title_ar || null,
        image: x.image,
        target_type: x.target_type || null,
        target_ref: x.target_ref || null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

/* ---------------- GET /api/products/most-requested ---------------- */
router.get('/products/most-requested', async (req, res, next) => {
  try {
    const lang = langOf(req);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { rows } = await db.query(
      `SELECT p.* FROM products p
       JOIN vendors v ON v.id = p.vendor_id
       WHERE p.is_most_requested = true AND p.deleted_at IS NULL
         AND v.deleted_at IS NULL AND v.is_active = true AND v.status = 'approved'
       ORDER BY p.sort_order LIMIT $1`,
      [limit]
    );
    const opts = await loadOptions(rows.map((p) => p.id));
    const offersByVendor = {};
    for (const p of rows) {
      if (!offersByVendor[p.vendor_id]) offersByVendor[p.vendor_id] = await loadOffers(p.vendor_id);
    }
    res.json({
      data: rows.map((p) => serializeProduct(p, opts[p.id], offersByVendor[p.vendor_id], lang)),
    });
  } catch (e) {
    next(e);
  }
});

/* ---------------- GET /api/products/on-offer ---------------- */
// منتجات عليها خصم فعّال دلوقتي (من عروض المتجر/القسم/المنتج) — للصفحة الرئيسية.
router.get('/products/on-offer', async (req, res, next) => {
  try {
    const lang = langOf(req);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const offersRes = await db.query(
      `SELECT o.* FROM offers o
       JOIN vendors v ON v.id = o.vendor_id
       WHERE o.is_active = true
         AND (o.starts_at IS NULL OR o.starts_at <= now())
         AND (o.ends_at   IS NULL OR o.ends_at   >= now())
         AND v.deleted_at IS NULL AND v.is_active = true AND v.status = 'approved'`
    );
    const offersByVendor = {};
    for (const off of offersRes.rows) (offersByVendor[off.vendor_id] ||= []).push(off);
    const vendorIds = Object.keys(offersByVendor);
    if (!vendorIds.length) return res.json({ data: [] });

    const ph = vendorIds.map((_, i) => `$${i + 1}`).join(', ');
    const prodRes = await db.query(
      `SELECT * FROM products WHERE vendor_id IN (${ph}) AND deleted_at IS NULL AND is_available = true`,
      vendorIds
    );

    const withDiscount = [];
    for (const p of prodRes.rows) {
      const d = discountFor(p, offersByVendor[p.vendor_id]);
      if (d) withDiscount.push({ product: p, savings: num(p.price) - d.price_after });
    }
    // الأعلى وفرًا (بالجنيه) الأول
    withDiscount.sort((a, b) => b.savings - a.savings);
    const top = withDiscount.slice(0, limit).map((x) => x.product);

    const opts = await loadOptions(top.map((p) => p.id));
    res.json({
      data: top.map((p) => serializeProduct(p, opts[p.id], offersByVendor[p.vendor_id], lang)),
    });
  } catch (e) {
    next(e);
  }
});

/* ---------------- GET /api/offers ---------------- */
router.get('/offers', async (req, res, next) => {
  try {
    const lang = langOf(req);
    const { rows } = await db.query(
      `SELECT o.* FROM offers o
       JOIN vendors v ON v.id = o.vendor_id
       WHERE o.is_active = true
         AND (o.starts_at IS NULL OR o.starts_at <= now())
         AND (o.ends_at   IS NULL OR o.ends_at   >= now())
         AND v.deleted_at IS NULL AND v.is_active = true AND v.status = 'approved'
       ORDER BY o.created_at DESC`
    );
    res.json({
      data: rows.map((o) => ({
        id: o.id,
        vendor_id: o.vendor_id,
        title: o[`title_${lang}`] || o.title_ar,
        description: o[`description_${lang}`] || o.description_ar || '',
        banner_image: o.banner_image || null,
        scope: o.scope,
        target_id: o.target_id || null,
        discount_type: o.discount_type,
        discount_value: num(o.discount_value),
        starts_at: o.starts_at,
        ends_at: o.ends_at,
        is_active: o.is_active,
      })),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
