-- ============================================================================
--  إعداد قاعدة البيانات لخدمة تسجيل الدخول
--  آمن للتشغيل أكثر من مرة، ومتوافق مع schema.sql الكبير لو كنت شغّلته.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- لدالة gen_random_uuid()

-- ---------- جدول القرى (الاختيار الثالث في شاشة التسجيل) ----------
CREATE TABLE IF NOT EXISTS villages (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(120) NOT NULL UNIQUE,
    governorate  VARCHAR(120),
    is_active    BOOLEAN NOT NULL DEFAULT true
);

-- ---------- جدول المستخدمين ----------
-- لو schema.sql الكبير اتشغّل قبل كده، الجدول موجود وهذا الأمر يتخطاه.
CREATE TABLE IF NOT EXISTS users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name          VARCHAR(150) NOT NULL,
    email              VARCHAR(150) UNIQUE,
    phone              VARCHAR(20)  NOT NULL UNIQUE,
    password_hash      TEXT,
    role               VARCHAR(20)  NOT NULL DEFAULT 'customer',
    status             VARCHAR(30)  NOT NULL DEFAULT 'pending_verification',
    preferred_language VARCHAR(5)   NOT NULL DEFAULT 'ar',
    phone_verified_at  TIMESTAMPTZ,
    email_verified_at  TIMESTAMPTZ,
    last_login_at      TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- أعمدة إضافية للحساب/البروفايل (تُضاف سواء الجدول جديد أو قديم)
ALTER TABLE users ADD COLUMN IF NOT EXISTS village_id  INTEGER REFERENCES villages(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url  TEXT;          -- صورة البروفايل (رابط من النت)
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date  DATE;          -- تاريخ الميلاد (اختياري)
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender      VARCHAR(10);   -- 'male' | 'female' (اختياري)

-- ---------- جدول أكواد التحقق OTP ----------
CREATE TABLE IF NOT EXISTS auth_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose     VARCHAR(30) NOT NULL,          -- 'phone_verify' | 'otp_login'
    token_hash  TEXT NOT NULL,
    attempts    SMALLINT NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS attempts SMALLINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, purpose);

-- ---------- إدخال 30 قرية للاختيار منها ----------
INSERT INTO villages (name, governorate) VALUES
 ('كفر داود',        'المنوفية'),
 ('ميت أبو الكوم',   'المنوفية'),
 ('البتانون',        'المنوفية'),
 ('الخطاطبة',        'المنوفية'),
 ('أبو رقبة',        'القليوبية'),
 ('سندبيس',          'القليوبية'),
 ('كفر شكر',         'القليوبية'),
 ('طملاي',           'الغربية'),
 ('محلة أبو علي',    'الغربية'),
 ('أبيار',           'الغربية'),
 ('زاوية غزال',      'الغربية'),
 ('شبراخيت',         'البحيرة'),
 ('كوم حمادة',       'البحيرة'),
 ('الدلنجات',        'البحيرة'),
 ('نكلا',            'البحيرة'),
 ('صفط اللبن',       'الجيزة'),
 ('كفر حكيم',        'الجيزة'),
 ('منشأة القناطر',   'الجيزة'),
 ('أوسيم',           'الجيزة'),
 ('البراجيل',        'الجيزة'),
 ('كرداسة',          'الجيزة'),
 ('ميت بدر خميس',    'الدقهلية'),
 ('بلقاس',           'الدقهلية'),
 ('شها',             'الدقهلية'),
 ('دميرة',           'الدقهلية'),
 ('نبروه',           'الدقهلية'),
 ('جمصة',            'الدقهلية'),
 ('الستامونى',       'الدقهلية'),
 ('كفر سعد',         'دمياط'),
 ('الروضة',          'المنيا')
ON CONFLICT (name) DO NOTHING;
