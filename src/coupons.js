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
};

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

    const subtotal = Number(b.subtotal) || 0;
    if (subtotal < Number(coupon.min_order_amount)) {
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
      discount_amount: computeDiscount(coupon, subtotal),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = { router, findValidCoupon, computeDiscount, COUPON_MESSAGES: MESSAGES };
