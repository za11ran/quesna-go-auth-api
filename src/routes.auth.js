// كل مسارات المصادقة تحت /api/auth
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
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
  message: { success: false, error_code: 'RATE_LIMITED', error: 'محاولات كثيرة، جرّب بعد دقيقة' },
});

const isDev = () => process.env.NODE_ENV !== 'production';
// يرجّع dev_otp في الرد أثناء التطوير، أو الكود الثابت المؤقت لو DEV_LOGIN_OTP متضبّط.
const withDevOtp = (body, code) => {
  if (process.env.DEV_LOGIN_OTP) return { ...body, dev_otp: String(process.env.DEV_LOGIN_OTP) };
  return isDev() ? { ...body, dev_otp: code } : body;
};

// رد خطأ موحّد: يحمل error_code ثابت (للتطبيق) + رسالة عربية (للتشخيص).
// التطبيق (عربي/إنجليزي) يترجم error_code عنده — مش بيعتمد على نص الـ error.
const fail = (res, status, code, message, extra = {}) =>
  res.status(status).json({ success: false, error_code: code, error: message, ...extra });

// ---- أدوات تحقّق للحقول الاختيارية ----
// null = لم يُرسل (تجاهله)، undefined = قيمة غير صحيحة (ارفض)، نص = قيمة صحيحة.
function cleanUrl(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (s.length > 2000) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : undefined;
  } catch {
    return undefined;
  }
}
function cleanEmail(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 150 ? s : undefined;
}
function cleanBirthDate(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return undefined;
  const year = d.getUTCFullYear();
  if (year < 1900 || d.getTime() > Date.now()) return undefined;
  return s;
}
function cleanGender(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  return s === 'male' || s === 'female' ? s : undefined;
}
function cleanLang(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  return s === 'ar' || s === 'en' ? s : undefined;
}

// أعمدة البروفايل التي تُرجَع للتطبيق
const PROFILE_SELECT = `
  SELECT u.id,
         u.full_name        AS name,
         u.phone,
         u.email,
         u.avatar_url,
         u.birth_date,
         u.gender,
         u.preferred_language AS lang,
         u.status,
         u.village_id,
         v.name             AS village_name,
         v.key              AS village_key,
         u.created_at,
         u.updated_at,
         u.phone_verified_at
    FROM users u
    LEFT JOIN villages v ON v.id = u.village_id
   WHERE u.id = $1`;

// يحوّل birth_date من كائن تاريخ إلى نص YYYY-MM-DD
function shapeUser(row) {
  if (!row) return row;
  return {
    ...row,
    birth_date: row.birth_date
      ? new Date(row.birth_date).toISOString().slice(0, 10)
      : null,
  };
}

/* ---------------------------------------------------------------------------
 * 1) إنشاء حساب جديد            POST /api/auth/register?lang=ar
 *    body: name, phone, village_id
 *    query: lang (اختياري: ar|en، الافتراضي ar) - لغة واجهة التطبيق
 *    الرد: { success, phone, next:"otp", dev_otp? }  -> شاشة الـ OTP
 * ------------------------------------------------------------------------- */
router.post('/register', authLimiter, form, async (req, res, next) => {
  try {
    const { name, phone, village_id, village_key } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return fail(res, 422, 'NAME_REQUIRED', 'الاسم مطلوب (حرفين على الأقل)');
    }

    const p = normalizeEgyptPhone(phone);
    if (!p.ok) return fail(res, 422, 'INVALID_PHONE', p.error);

    // القرية: يقبل village_id (رقم) أو village_key (slug ثابت من التطبيق)
    let village;
    if (village_key !== undefined && String(village_key).trim() !== '') {
      village = await db.query(
        'SELECT id FROM villages WHERE key = $1 AND is_active = true',
        [String(village_key).trim()]
      );
    } else {
      const vid = Number(village_id);
      if (!Number.isInteger(vid) || vid <= 0) {
        return fail(res, 422, 'VILLAGE_REQUIRED', 'اختر القرية');
      }
      village = await db.query(
        'SELECT id FROM villages WHERE id = $1 AND is_active = true',
        [vid]
      );
    }
    if (village.rowCount === 0) {
      return fail(res, 422, 'VILLAGE_NOT_FOUND', 'القرية غير موجودة');
    }
    const vid = village.rows[0].id;

    // اللغة: query parameter اختياري (?lang=ar) يبعته التطبيق تلقائيًا
    // (لغة الواجهة الحالية). الافتراضي 'ar'. مقبول في الـ body كمان كـ fallback.
    const lang = cleanLang(
      req.query.lang !== undefined ? req.query.lang : req.body.lang
    );
    if (lang === undefined) {
      return fail(res, 422, 'INVALID_LANGUAGE', 'lang لازم يكون ar أو en');
    }

    // باقي بيانات البروفايل (الصورة، الإيميل، تاريخ الميلاد، النوع) بتتضاف لاحقًا
    // من شاشة البروفايل عبر PATCH /api/auth/me.

    // هل الرقم مسجّل قبل كده؟
    const existing = await db.query(
      'SELECT id, phone_verified_at FROM users WHERE phone = $1',
      [p.e164]
    );

    let userId;
    if (existing.rowCount > 0) {
      if (existing.rows[0].phone_verified_at) {
        return fail(res, 409, 'ALREADY_REGISTERED', 'الرقم مسجّل بالفعل، من فضلك سجّل الدخول');
      }
      // حساب موجود لكنه لم يُفعّل: حدّث الاسم والقرية واللغة وأعد إرسال الكود
      userId = existing.rows[0].id;
      await db.query(
        `UPDATE users
            SET full_name = $1, village_id = $2,
                preferred_language = COALESCE($3, preferred_language),
                updated_at = now()
          WHERE id = $4`,
        [String(name).trim(), vid, lang, userId]
      );
    } else {
      try {
        const ins = await db.query(
          `INSERT INTO users (full_name, phone, village_id, preferred_language, role, status)
           VALUES ($1, $2, $3, COALESCE($4, 'ar'), 'customer', 'pending_verification')
           RETURNING id`,
          [String(name).trim(), p.e164, vid, lang]
        );
        userId = ins.rows[0].id;
      } catch (e) {
        if (e.code === '23505') {
          return fail(res, 409, 'ALREADY_REGISTERED', 'الرقم مسجّل بالفعل');
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
 * 2) تسجيل الدخول               POST /api/auth/login
 *    body: phone
 * ------------------------------------------------------------------------- */
router.post('/login', authLimiter, form, async (req, res, next) => {
  try {
    const p = normalizeEgyptPhone(req.body && req.body.phone);
    if (!p.ok) return fail(res, 422, 'INVALID_PHONE', p.error);

    const u = await db.query('SELECT id FROM users WHERE phone = $1', [p.e164]);
    if (u.rowCount === 0) {
      return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'لا يوجد حساب بهذا الرقم، أنشئ حساب جديد');
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
 * 3) التحقق من كود OTP           POST /api/auth/verify-otp
 *    body: phone, code
 *    الرد عند النجاح: { success, token, user }
 * ------------------------------------------------------------------------- */
router.post('/verify-otp', authLimiter, form, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    const p = normalizeEgyptPhone(req.body && req.body.phone);
    if (!p.ok) return fail(res, 422, 'INVALID_PHONE', p.error);
    if (!/^\d{6}$/.test(String(code || ''))) {
      return fail(res, 422, 'INVALID_OTP_FORMAT', 'الكود لازم يكون 6 أرقام');
    }

    const u = await db.query(
      `SELECT u.*, v.name AS village_name, v.key AS village_key
         FROM users u
         LEFT JOIN villages v ON v.id = u.village_id
        WHERE u.phone = $1`,
      [p.e164]
    );
    if (u.rowCount === 0) {
      return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'لا يوجد حساب بهذا الرقم');
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
      return fail(res, 400, 'OTP_NOT_FOUND', 'اطلب كود جديد');
    }
    const token = t.rows[0];

    if (new Date(token.expires_at) < new Date()) {
      await db.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [token.id]);
      return fail(res, 400, 'OTP_EXPIRED', 'انتهت صلاحية الكود، اطلب كود جديد');
    }

    const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS || 5);
    if (token.attempts >= maxAttempts) {
      await db.query('UPDATE auth_tokens SET consumed_at = now() WHERE id = $1', [token.id]);
      return fail(res, 429, 'OTP_TOO_MANY_ATTEMPTS', 'حاولت كثيرًا، اطلب كود جديد');
    }

    // كود ثابت مؤقت للتجربة اليدوية لحد ما نشترك في مزوّد SMS.
    // فعّله بمتغيّر البيئة DEV_LOGIN_OTP=123456 — واحذفه بعد ربط الـ SMS.
    const masterOtp =
      !!process.env.DEV_LOGIN_OTP && String(code) === String(process.env.DEV_LOGIN_OTP);
    const ok = masterOtp || (await bcrypt.compare(String(code), token.token_hash));
    if (!ok) {
      await db.query('UPDATE auth_tokens SET attempts = attempts + 1 WHERE id = $1', [token.id]);
      const left = Math.max(0, maxAttempts - (token.attempts + 1));
      return fail(
        res, 401, 'OTP_WRONG',
        left > 0 ? `الكود غير صحيح (باقي ${left} محاولات)` : 'الكود غير صحيح',
        { attempts_left: left }
      );
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
        email: user.email,
        avatar_url: user.avatar_url,
        birth_date: user.birth_date
          ? new Date(user.birth_date).toISOString().slice(0, 10)
          : null,
        gender: user.gender,
        lang: user.preferred_language,
        village_id: user.village_id,
        village_name: user.village_name,
        village_key: user.village_key,
        status: 'active',
        created_at: user.created_at,
        is_new: !user.phone_verified_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------------------
 * 4) إعادة إرسال الكود           POST /api/auth/resend-otp
 *    body: phone
 * ------------------------------------------------------------------------- */
router.post('/resend-otp', authLimiter, form, async (req, res, next) => {
  try {
    const p = normalizeEgyptPhone(req.body && req.body.phone);
    if (!p.ok) return fail(res, 422, 'INVALID_PHONE', p.error);

    const u = await db.query(
      'SELECT id, phone_verified_at FROM users WHERE phone = $1',
      [p.e164]
    );
    if (u.rowCount === 0) {
      return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'لا يوجد حساب بهذا الرقم');
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
 * 5) بيانات المستخدم الحالي      GET /api/auth/me   (محمي)
 *    يرجّع البروفايل كامل: الاسم، الصورة، الإيميل، القرية، تاريخ إنشاء الحساب...
 * ------------------------------------------------------------------------- */
router.get('/me', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(PROFILE_SELECT, [req.user.sub]);
    if (rows.length === 0) {
      return fail(res, 404, 'USER_NOT_FOUND', 'المستخدم غير موجود');
    }
    res.json({ success: true, user: shapeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------------------
 * 6) تعديل البروفايل             PATCH /api/auth/me   (محمي)
 *    body (كل الحقول اختيارية): name, avatar_url, email, birth_date, gender,
 *                               village_id, lang (ar|en)
 * ------------------------------------------------------------------------- */
router.patch('/me', authRequired, form, async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [];
    const vals = [];
    const add = (col, val) => {
      vals.push(val);
      sets.push(`${col} = $${vals.length}`);
    };

    if (b.name !== undefined) {
      if (String(b.name).trim().length < 2) {
        return fail(res, 422, 'NAME_REQUIRED', 'الاسم قصير');
      }
      add('full_name', String(b.name).trim());
    }

    if (b.avatar_url !== undefined) {
      const a = cleanUrl(b.avatar_url);
      if (a === undefined) return fail(res, 422, 'INVALID_AVATAR_URL', 'رابط الصورة غير صحيح');
      add('avatar_url', a);
    }

    if (b.email !== undefined) {
      const e = cleanEmail(b.email);
      if (e === undefined) return fail(res, 422, 'INVALID_EMAIL', 'الإيميل غير صحيح');
      if (e) {
        const dupe = await db.query(
          'SELECT 1 FROM users WHERE email = $1 AND id <> $2',
          [e, req.user.sub]
        );
        if (dupe.rowCount) return fail(res, 409, 'EMAIL_TAKEN', 'الإيميل مستخدم بالفعل');
      }
      add('email', e);
    }

    if (b.birth_date !== undefined) {
      const d = cleanBirthDate(b.birth_date);
      if (d === undefined) return fail(res, 422, 'INVALID_BIRTH_DATE', 'تاريخ الميلاد غير صحيح (YYYY-MM-DD)');
      add('birth_date', d);
    }

    if (b.gender !== undefined) {
      const g = cleanGender(b.gender);
      if (g === undefined) return fail(res, 422, 'INVALID_GENDER', 'النوع لازم يكون male أو female');
      add('gender', g);
    }

    if (b.village_key !== undefined && String(b.village_key).trim() !== '') {
      const vk = await db.query(
        'SELECT id FROM villages WHERE key = $1 AND is_active = true',
        [String(b.village_key).trim()]
      );
      if (!vk.rowCount) return fail(res, 422, 'VILLAGE_NOT_FOUND', 'القرية غير موجودة');
      add('village_id', vk.rows[0].id);
    } else if (b.village_id !== undefined) {
      const vid = Number(b.village_id);
      if (!Number.isInteger(vid) || vid <= 0) {
        return fail(res, 422, 'VILLAGE_NOT_FOUND', 'قرية غير صحيحة');
      }
      const ok = await db.query(
        'SELECT 1 FROM villages WHERE id = $1 AND is_active = true',
        [vid]
      );
      if (!ok.rowCount) return fail(res, 422, 'VILLAGE_NOT_FOUND', 'القرية غير موجودة');
      add('village_id', vid);
    }

    // اللغة: من body.lang أو query ?lang=
    const langInput = b.lang !== undefined ? b.lang : req.query.lang;
    if (langInput !== undefined) {
      const lang = cleanLang(langInput);
      if (lang === undefined) return fail(res, 422, 'INVALID_LANGUAGE', 'lang لازم يكون ar أو en');
      add('preferred_language', lang);
    }

    if (sets.length === 0) {
      return fail(res, 422, 'NOTHING_TO_UPDATE', 'مفيش بيانات للتعديل');
    }

    vals.push(req.user.sub);
    await db.query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`,
      vals
    );

    const { rows } = await db.query(PROFILE_SELECT, [req.user.sub]);
    res.json({ success: true, user: shapeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
