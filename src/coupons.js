// أكواد الخصم (Coupons) — يديرها الأدمن من لوحته (admin.js)، والعميل بيكتبها في السلة.
//   POST /api/coupons/validate   body: { code, subtotal }  -> معاينة الخصم قبل الطلب
// الاستخدام الفعلي (وزيادة used_count) بيحصل في orders.js عند POST /api/orders.
const router = require('express').Router();
const db = require('./db');
const { authRequired } = require('./auth');

const nowIso = () => new Date().toISOString();
const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, error_code: code, message, timestamp: nowIso() });

const MESSAGES = {
  COUPON_REQUIRED: 'اكتب كود الخصم',
  COUPON_NOT_FOUND: 'كود الخصم غير صحيح',
  COUPON_NOT_STARTED: 'الكود لسه مش متاح',
  COUPON_EXPIRED: 'انتهت صلاحية الكود',
  COUPON_USES_EXCEEDED: 'الكود وصل للحد الأقصى للاستخدام',
  COUPON_VENDOR_MISMATCH: 'الكود ده خاص بمتجر تاني مش في طلبك',
};

// المتاجر اللي الكود مقصور عليها: vendor_ids (قايمة) لها الأولوية، وإلا
// vendor_id القديم (متجر واحد)، وإلا فاضية = الكود عام على كل الطلب.
function couponVendorIds(coupon) {
  if (Array.isArray(coupon.vendor_ids) && coupon.vendor_ids.length) {
    return coupon.vendor_ids.filter(Boolean).map(String);
  }
  return coupon.vendor_id ? [String(coupon.vendor_id)] : [];
}

// كود عام (مفيش متاجر) → الخصم على subtotal الطلب كله زي ما كان.
// كود مقصور على متجر/متاجر → الخصم بيتحسب على مجموع subtotal بتاع المتاجر دي
// من السلة بس، ولازم متجر واحد منها على الأقل يكون موجود في الطلب.
function subtotalForCoupon(coupon, { subtotal, vendorSubtotals }) {
  const ids = couponVendorIds(coupon);
  if (!ids.length) return { ok: true, subtotal: Number(subtotal) || 0 };
  let sum = 0;
  let matched = false;
  for (const id of ids) {
    if (vendorSubtotals && Object.prototype.hasOwnProperty.call(vendorSubtotals, id)) {
      sum += Number(vendorSubtotals[id]) || 0;
      matched = true;
    }
  }
  if (!matched) return { ok: false };
  return { ok: true, subtotal: sum };
}

// يدوّر على كود صالح (مفعّل + في الفترة الزمنية + مستخدَم أقل من الحد الأقصى).
// مش بيتحقق من الحد الأدنى للطلب هنا — ده محتاج الـ subtotal من الكولر.
async function findValidCoupon(codeRaw) {
  const code = String(codeRaw || '').trim().toUpperCase();
  if (!code) return { error: 'COUPON_REQUIRED' };

  const { rows } = await db.query(`SELECT * FROM coupons WHERE UPPER(code) = $1`, [code]);
  const coupon = rows[0];
  if (!coupon || !coupon.is_active) return { error: 'COUPON_NOT_FOUND' };

  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return { error: 'COUPON_NOT_STARTED' };
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) return { error: 'COUPON_EXPIRED' };
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) return { error: 'COUPON_USES_EXCEEDED' };

  return { coupon };
}

// قيمة الخصم بالجنيه لكوبون معيّن على subtotal معيّن (بيقف عند الـ subtotal نفسه).
function computeDiscount(coupon, subtotal) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const raw =
    coupon.discount_type === 'amount'
      ? Number(coupon.discount_value)
      : sub * (Number(coupon.discount_value) / 100);
  return Math.round(Math.min(sub, Math.max(0, raw)) * 100) / 100;
}

/* ---------------- POST /api/coupons/validate ---------------- */
router.post('/coupons/validate', authRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    const { coupon, error } = await findValidCoupon(b.code);
    if (error) return fail(res, 422, error, MESSAGES[error]);

    const scoped = subtotalForCoupon(coupon, {
      subtotal: b.subtotal,
      vendorSubtotals: b.vendor_subtotals,
    });
    if (!scoped.ok) return fail(res, 422, 'COUPON_VENDOR_MISMATCH', MESSAGES.COUPON_VENDOR_MISMATCH);

    if (scoped.subtotal < Number(coupon.min_order_amount)) {
      return fail(
        res, 422, 'COUPON_MIN_ORDER_NOT_MET',
        `الحد الأدنى لاستخدام الكود ${Number(coupon.min_order_amount)} ج.م`
      );
    }

    res.json({
      valid: true,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: Number(coupon.discount_value),
      discount_amount: computeDiscount(coupon, scoped.subtotal),
      vendor_id: coupon.vendor_id || null,
      vendor_ids: couponVendorIds(coupon),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = {
  router, findValidCoupon, computeDiscount, subtotalForCoupon, couponVendorIds,
  COUPON_MESSAGES: MESSAGES,
};
