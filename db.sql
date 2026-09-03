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

-- ============================================================================
--  الكتالوج: التجّار + المنتجات + الأحجام + الأقسام + العروض  (Customer API)
--  متوافق مع BACKEND_HANDOFF.md §10-11. الحقول النصية ثنائية اللغة (ar/en).
-- ============================================================================

CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name_ar     VARCHAR(120) NOT NULL,
    name_en     VARCHAR(120) NOT NULL,
    image       TEXT,
    type        VARCHAR(20)  NOT NULL DEFAULT 'vendors',
    action      VARCHAR(60),
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS vendors (
    id                    VARCHAR(60) PRIMARY KEY,
    name_ar               VARCHAR(180) NOT NULL,
    name_en               VARCHAR(180) NOT NULL,
    type                  VARCHAR(20)  NOT NULL DEFAULT 'restaurant',
    description_ar         TEXT NOT NULL DEFAULT '',
    description_en         TEXT NOT NULL DEFAULT '',
    logo                  TEXT,
    cover_image           TEXT,
    phone                 VARCHAR(20),
    rating                NUMERIC(3,2) NOT NULL DEFAULT 0,
    reviews_count         INTEGER      NOT NULL DEFAULT 0,
    is_open               BOOLEAN      NOT NULL DEFAULT true,
    is_active             BOOLEAN      NOT NULL DEFAULT true,
    status                VARCHAR(20)  NOT NULL DEFAULT 'approved',
    working_hours         JSONB,
    working_hours_text_ar VARCHAR(120),
    working_hours_text_en VARCHAR(120),
    delivery_fee          NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_order             NUMERIC(10,2) NOT NULL DEFAULT 0,
    avg_prep_time_minutes SMALLINT      NOT NULL DEFAULT 20,
    address_ar            VARCHAR(255),
    address_en            VARCHAR(255),
    lat                   NUMERIC(9,6),
    lng                   NUMERIC(9,6),
    delivery_zones        JSONB        NOT NULL DEFAULT '[]',
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vendors_type   ON vendors(type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);

CREATE TABLE IF NOT EXISTS products (
    id                VARCHAR(60) PRIMARY KEY,
    vendor_id         VARCHAR(60) NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name_ar           VARCHAR(180) NOT NULL,
    name_en           VARCHAR(180) NOT NULL,
    brand             VARCHAR(120) NOT NULL DEFAULT '',
    description_ar     TEXT NOT NULL DEFAULT '',
    description_en     TEXT NOT NULL DEFAULT '',
    price             NUMERIC(10,2) NOT NULL DEFAULT 0,
    image             TEXT,
    category          VARCHAR(40),
    stock             INTEGER,
    is_available      BOOLEAN NOT NULL DEFAULT true,
    has_options       BOOLEAN NOT NULL DEFAULT false,
    sort_order        SMALLINT NOT NULL DEFAULT 0,
    is_most_requested BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_products_vendor   ON products(vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_most_req ON products(is_most_requested) WHERE is_most_requested;

CREATE TABLE IF NOT EXISTS product_options (
    id            VARCHAR(60) NOT NULL,
    product_id    VARCHAR(60) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name_ar       VARCHAR(120) NOT NULL,
    name_en       VARCHAR(120) NOT NULL,
    price         NUMERIC(10,2) NOT NULL,
    stock         INTEGER,
    is_available  BOOLEAN NOT NULL DEFAULT true,
    sort_order    SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, id)
);

CREATE TABLE IF NOT EXISTS offers (
    id             VARCHAR(60) PRIMARY KEY,
    vendor_id      VARCHAR(60) NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    title_ar       VARCHAR(180) NOT NULL,
    title_en       VARCHAR(180) NOT NULL,
    description_ar  TEXT NOT NULL DEFAULT '',
    description_en  TEXT NOT NULL DEFAULT '',
    banner_image   TEXT,
    scope          VARCHAR(20) NOT NULL DEFAULT 'store',
    target_id      VARCHAR(60),
    discount_type  VARCHAR(20) NOT NULL DEFAULT 'percent',
    discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
    starts_at      TIMESTAMPTZ,
    ends_at        TIMESTAMPTZ,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offers_vendor ON offers(vendor_id);

-- ---------- بيانات تجريبية ----------
INSERT INTO categories (name_ar, name_en, type, action, sort_order) VALUES
 ('مطاعم',      'Restaurants',  'vendors', 'restaurants',  1),
 ('سوبر ماركت', 'Supermarkets', 'vendors', 'supermarkets', 2),
 ('صيدليات',    'Pharmacies',   'vendors', 'pharmacies',   3),
 ('مخابز',      'Bakeries',     'vendors', 'bakeries',     4)
ON CONFLICT DO NOTHING;

INSERT INTO vendors (id, name_ar, name_en, type, description_ar, description_en, phone,
                     rating, reviews_count, is_open, status, delivery_fee, min_order,
                     avg_prep_time_minutes, address_ar, address_en, lat, lng, delivery_zones,
                     working_hours, working_hours_text_ar, working_hours_text_en)
VALUES
 ('metro', 'مترو ماركت', 'Metro Market', 'supermarket',
  'سوبر ماركت لكل احتياجات البيت', 'Everything for your home', '+201000000020',
  4.6, 128, true, 'approved', 15, 50, 25, 'شارع مكرم عبيد، القاهرة', 'Makram Ebeid St, Cairo',
  30.0605, 31.3450, '["مدينة نصر","مصر الجديدة"]'::jsonb,
  '{"sat":{"open":"10:00","close":"23:59","closed":false},"sun":{"open":"10:00","close":"23:59","closed":false}}'::jsonb,
  '10:00 ص - 12:00 م', '10:00 AM - 12:00 AM'),
 ('koshari-abbas', 'كشري عباس', 'Abbas Koshari', 'restaurant',
  'اشهر كشري في المنطقة', 'The favorite koshari in town', '+201000000021',
  4.4, 210, true, 'approved', 12, 40, 20, 'شارع عباس العقاد، القاهرة', 'Abbas El Akkad St, Cairo',
  30.0626, 31.3489, '["مدينة نصر"]'::jsonb,
  '{"sat":{"open":"11:00","close":"02:00","closed":false}}'::jsonb,
  '11:00 ص - 2:00 ص', '11:00 AM - 2:00 AM')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, vendor_id, name_ar, name_en, brand, description_ar, description_en,
                      price, category, stock, is_available, has_options, sort_order, is_most_requested)
VALUES
 ('metro_1', 'metro', 'شيبسي بالجبنة', 'Cheese Chips', 'مترو ماركت',
  'شيبسي مقرمش بطعم الجبنة', 'Crunchy cheese chips', 10, 'snacks', 40, true, true, 1, true),
 ('metro_2', 'metro', 'مياه معدنية 1.5 لتر', 'Mineral Water 1.5L', 'حياة',
  'عبوة 1.5 لتر', '1.5L bottle', 8, 'beverages', 200, true, false, 2, true),
 ('metro_3', 'metro', 'جبنة بيضاء 250 جم', 'White Cheese 250g', 'المراعي',
  'جبنة بيضاء طرية', 'Soft white cheese', 45, 'dairyAndCheese', 15, true, false, 3, false),
 ('metro_4', 'metro', 'مكرونة 400 جم', 'Pasta 400g', 'الملكة',
  'مكرونة ايطالي', 'Italian pasta', 18, 'grocery', 0, true, false, 4, false),
 ('koshari-abbas_1', 'koshari-abbas', 'كشري', 'Koshari', 'كشري عباس',
  'طبق كشري', 'Koshari plate', 25, 'other', NULL, true, true, 1, true),
 ('koshari-abbas_2', 'koshari-abbas', 'كولا', 'Cola', 'كوكاكولا',
  'علبة 330 مل', '330ml can', 15, 'other', 60, true, false, 2, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_options (product_id, id, name_ar, name_en, price, stock, is_available, sort_order) VALUES
 ('metro_1', 'cheese', 'طعم الجبنة', 'Cheese', 10, 20, true, 1),
 ('metro_1', 'bbq',    'باربكيو',    'BBQ',    12, 0,  false, 2),
 ('koshari-abbas_1', 'small',  'صغير', 'Small',  20, NULL, true, 1),
 ('koshari-abbas_1', 'medium', 'وسط',  'Medium', 25, NULL, true, 2),
 ('koshari-abbas_1', 'large',  'كبير', 'Large',  35, NULL, true, 3)
ON CONFLICT DO NOTHING;

INSERT INTO offers (id, vendor_id, title_ar, title_en, scope, target_id, discount_type, discount_value,
                    starts_at, ends_at, is_active)
VALUES
 ('off_snacks', 'metro', 'خصم 15% على السناكس', '15% off snacks', 'category', 'snacks',
  'percent', 15, now() - interval '1 day', now() + interval '30 days', true),
 ('off_koshari', 'koshari-abbas', 'خصم 10 جنيه على الطلب', 'EGP 10 off', 'store', NULL,
  'amount', 10, now() - interval '1 day', now() + interval '30 days', true)
ON CONFLICT (id) DO NOTHING;
