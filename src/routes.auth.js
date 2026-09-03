// كل مسارات المصادقة تحت /api/auth
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const db = require('./db');
const { normalizeEgyptPhone } = require('./phone');
const { issueOtp, deliverOtp } = require('./otp');
const { signToken, authRequired } = require('./auth');

// يقرأ حقول الفورم من نوع multipart/form-data (تبويب form-data في Apidog)
// بدون رفع ملفات. يشتغل جنب express.json و express.urlencoded.
const form = multer().none();

// حد أقصى 10 طلبات في الدقيقة لكل IP على مسارات المصادقة
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'محاولات كثيرة، جرّب بعد دقيقة' },
});

const isDev = () => process.env.NODE_ENV !== 'production';
const withDevOtp = (body, code) => (isDev() ? { ...body, dev_otp: code } : body);

/* ---------------------------------------------------------------------------
 * 1) إنشاء حساب جديد
 *    POST /api/auth/register
 *    body: { name, phone, village_id }
 *    الرد: { success, phone, next:"otp", dev_otp? }  -> حوّل المستخدم لشاشة OTP
 * ------------------------------------------------------------------------- */
router.post('/register', authLimiter, form, async (req, res, next) => {
  try {
    const { name, phone, village_id } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res.status(422).json({ success: false, error: 'الاسم مطلوب (حرفين على الأقل)' });
    }

    const p = normalizeEgyptPhone(phone);
    if (!p.ok) return res.status(422).json({ success: false, error: p.error });

    const vid = Number(village_id);
    if (!Number.isInteger(vid) || vid <= 0) {
      return res.status(422).json({ success: false, error: 'اختر القرية' });
    }
    const village = await db.query(
      'SELECT id FROM villages WHERE id = $1 AND is_active = true',
      [vid]
    );
    if (village.rowCount === 0) {
      return res.status(422).json({ success: false, error: 'القرية غير موجودة' });
    }

    // هل الرقم مسجّل قبل كده؟
    const existing = await db.query(
      'SELECT id, phone_verified_at FROM users WHERE phone = $1',
      [p.e164]
    );

    let userId;
    if (existing.rowCount > 0) {
      if (existing.rows[0].phone_verified_at) {
        return res.status(409).json({
          success: false,
          error: 'الرقم مسجّل بالفعل، من فضلك سجّل الدخول',
        });
      }
      // حساب موجود لكنه لم يُفعّل: حدّث بياناته وأعد إرسال الكود
      userId = existing.rows[0].id;
      await db.query(
        `UPDATE users SET full_name = $1, village_id = $2, updated_at = now() WHERE id = $3`,
        [String(name).trim(), vid, userId]
      );
    } else {
      try {
        const ins = await db.query(
          `INSERT INTO users (full_name, phone, village_id, role, status)
           VALUES ($1, $2, $3, 'customer', 'pending_verification')
           RETURNING id`,
          [String(name).trim(), p.e164, vid]
        );
        userId = ins.rows[0].id;
      } catch (e) {
        if (e.code === '23505') {
          return res.status(409).json({ success: false, error: 'الرقم مسجّل بالفعل' });
        }
        throw e;
      }
    }

    const code = await issueOtp(userId, 'phone_verify');
    await deliverOtp(p.e164, code, 'تفعيل');

    return res.status(201).json(
      withDevOtp(
        { success: true, message: 'تم إرسال كود التحقق', phone: p.e164, next: 'otp' },
        code
      )
    );
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------------------
 * 2) تسجيل الدخول
 *    POST /api/auth/login
 *    body: { phone }
 *    الرد: { success, phone, next:"otp", dev_otp? }  -> حوّل المستخدم لشاشة OTP
 * ------------------------------------------------------------------------- */
router.post('/login', authLimiter, form, async (req, res, next) => {
  try {
    const p = normalizeEgyptPhone(req.body && req.body.phone);
    if (!p.ok) return res.status(422).json({ success: false, error: p.error });

    const u = await db.query('SELECT id FROM users WHERE phone = $1', [p.e164]);
    if (u.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'لا يوجد حساب بهذا الرقم، أنشئ حساب جديد',
      });
    }

    const code = await issueOtp(u.rows[0].id, 'otp_login');
    await deliverOtp(p.e164, code, 'دخول');

    return res.json(
      withDevOtp(
        { success: true, message: 'تم إرسال كود الدخول', phone: p.e164, next: 'otp' },
        code
      )
    );
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------------------
 * 3) التحقق من كود OTP (لكل من التسجيل والدخول)
 *    POST /api/auth/verify-otp
 *    body: { phone, code }
 *    الرد عند النجاح: { success, token, user }
 * ------------------------------------------------------------------------- */
router.post('/verify-otp', authLimiter, form, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    const p = normalizeEgyptPhone(req.body && req.body.phone);
    if (!p.ok) return res.status(422).json({ success: false, error: p.error });
    if (!/^\d{6}$/.test(String(code || ''))) {
      return res.status(422).json({ success: false, error: 'الكود لازم يكون 6 أرقام' });
    }

    const u = await db.query('SELECT * FROM users WHERE phone = $1', [p.e164]);
    if (u.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'لا يوجد حساب بهذا الرقم' });
    }
    const user = u.rows[0];

    const t = await db.query(
      `SELECT * FROM auth_tokens
        WHERE user_id = $1
          AND purpose IN ('phone_verify', 'otp_login')
          AND consumed_at IS NULL
     ORDER BY created_at DESC
        LIMIT 1`,
      [user.id]
    );
    if (t.rowCount === 0) {
      return res.status(400).json({ success: false, error: 'اطلب كود جديد' });
    }
    const token = t.rows[0];

    if (new Date(token.expires_at) < new Date()) {
      await db.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [token.id]);
      return res.status(400).json({ success: false, error: 'انتهت صلاحية الكود، اطلب كود جديد' });
    }

    const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS || 5);
    if (token.attempts >= maxAttempts) {
      await db.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [token.id]);
      return res.status(429).json({ success: false, error: 'حاولت كثيرًا، اطلب كود جديد' });
    }

    const bcrypt = require('bcryptjs');
    const ok = await bcrypt.compare(String(code), token.token_hash);
    if (!ok) {
      await db.query('UPDATE auth_tokens SET attempts = attempts + 1 WHERE id = $1', [token.id]);
      const left = maxAttempts - (token.attempts + 1);
      return res.status(401).json({
        success: false,
        error: left > 0 ? `الكود غير صحيح (باقي ${left} محاولات)` : 'الكود غير صحيح',
      });
    }

    // نجاح: استهلك الكود وفعّل الحساب
    await db.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [token.id]);
    await db.query(
      `UPDATE users
          SET status = 'active',
              phone_verified_at = COALESCE(phone_verified_at, now()),
              last_login_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [user.id]
    );

    return res.json({
      success: true,
      token: signToken(user),
      user: {
        id: user.id,
        name: user.full_name,
        phone: user.phone,
        village_id: user.village_id,
        status: 'active',
        is_new: !user.phone_verified_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------------------
 * 4) إعادة إرسال الكود
 *    POST /api/auth/resend-otp
 *    body: { phone }
 * ------------------------------------------------------------------------- */
router.post('/resend-otp', authLimiter, form, async (req, res, next) => {
  try {
    const p = normalizeEgyptPhone(req.body && req.body.phone);
    if (!p.ok) return res.status(422).json({ success: false, error: p.error });

    const u = await db.query(
      'SELECT id, phone_verified_at FROM users WHERE phone = $1',
      [p.e164]
    );
    if (u.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'لا يوجد حساب بهذا الرقم' });
    }

    const purpose = u.rows[0].phone_verified_at ? 'otp_login' : 'phone_verify';
    const code = await issueOtp(u.rows[0].id, purpose);
    await deliverOtp(p.e164, code, 'تحقق');

    return res.json(
      withDevOtp({ success: true, message: 'تم إرسال كود جديد', phone: p.e164 }, code)
    );
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------------------
 * 5) بيانات المستخدم الحالي (مسار محمي - للتأكد أن التوكن يعمل)
 *    GET /api/auth/me   header: Authorization: Bearer <token>
 * ------------------------------------------------------------------------- */
router.get('/me', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.full_name AS name, u.phone, u.status, u.village_id,
              v.name AS village_name, u.created_at
         FROM users u
    LEFT JOIN villages v ON v.id = u.village_id
        WHERE u.id = $1`,
      [req.user.sub]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
