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

-- ---------- قرى مركز قويسنا (نفس مفاتيح تطبيق العميل: key = slug ثابت) ----------
ALTER TABLE villages ADD COLUMN IF NOT EXISTS key VARCHAR(60);
-- سعر التوصيل الأساسي للقرية — الأدمن بيعدّله من لوحته (GET/PUT /api/admin/villages)
ALTER TABLE villages ADD COLUMN IF NOT EXISTS delivery_base_fee NUMERIC(10,2) NOT NULL DEFAULT 25;
-- فهرس فريد عادي: قيم NULL المتعددة مسموحة في Postgres، فالقرى القديمة (بدون key) ما بتتعارضش
CREATE UNIQUE INDEX IF NOT EXISTS uq_villages_key ON villages (key);

INSERT INTO villages (key, name, governorate) VALUES
 ('quesna',                     'مدينة قويسنا',          'المنوفية'),
 ('quesna_al_balad',            'قويسنا البلد',          'المنوفية'),
 ('abnhas',                     'أبنهس',                 'المنوفية'),
 ('shobra_bakhoum',             'شبرا بخوم',             'المنوفية'),
 ('mit_bara',                   'ميت بره',               'المنوفية'),
 ('arab_al_raml',               'عرب الرمل',             'المنوفية'),
 ('taha_shobra',                'طه شبرا',               'المنوفية'),
 ('begerm',                     'بجيرم',                 'المنوفية'),
 ('mostay',                     'مصطاى',                 'المنوفية'),
 ('ashlim',                     'أشليم',                 'المنوفية'),
 ('om_henan',                   'أم خنان',               'المنوفية'),
 ('mit_al_absy',                'ميت العبسى',            'المنوفية'),
 ('shamandeel',                 'شمنديل',                'المنوفية'),
 ('agour_al_raml',              'أجهور الرمل',           'المنوفية'),
 ('beni_ghoryan',               'بني غريان',             'المنوفية'),
 ('domhoug',                    'دمهوج',                 'المنوفية'),
 ('mit_al_ezz',                 'ميت العز',              'المنوفية'),
 ('baqsa',                      'بقسا',                  'المنوفية'),
 ('ramali',                     'الرمالي',               'المنوفية'),
 ('al_agayza',                  'العجايزة',              'المنوفية'),
 ('kafr_absheesh',              'كفر أبشيش',             'المنوفية'),
 ('mit_al_qasry',               'ميت القصرى',            'المنوفية'),
 ('kafr_whab',                  'كفر وهب',               'المنوفية'),
 ('kafr_sheikh_ibrahim',        'كفر الشيخ إبراهيم',     'المنوفية'),
 ('kofour_al_raml',             'كفور الرمل',            'المنوفية'),
 ('bara_al_agouz',              'بره العجوز',            'المنوفية'),
 ('kafr_zein_eldin',            'كفر زين الدين',         'المنوفية'),
 ('kafr_abdo',                  'كفر عبده',              'المنوفية'),
 ('kafr_mit_al_absy',           'كفر ميت العبسى',        'المنوفية'),
 ('manshaet_al_arab',           'منشأة العرب',           'المنوفية'),
 ('manshaet_abu_zikry',         'منشأة أبو ذكرى',        'المنوفية'),
 ('kafr_beni_ghoryan',          'كفر بني غريان',         'المنوفية'),
 ('kafr_abnhas',                'كفر أبنهس',             'المنوفية'),
 ('kafr_taha_shobra',           'كفر طه شبرا',           'المنوفية'),
 ('kafr_al_manshy',             'كفر المنشى',            'المنوفية'),
 ('kafr_abu_alhassan',          'كفر أبو الحسن',         'المنوفية'),
 ('kafr_al_akram',              'كفر الآكرم',            'المنوفية'),
 ('kafr_ashlim',                'كفر أشليم',             'المنوفية'),
 ('kafr_al_salamia',            'كفر السلامية',          'المنوفية'),
 ('shobra_qabala',              'شبرا قبالة',            'المنوفية'),
 ('kafr_el_arab',               'كفر العرب القبلي',      'المنوفية'),
 ('mit_serag',                  'ميت سراج',              'المنوفية'),
 ('mit_abu_shikha',             'ميت أبو شيخة',          'المنوفية'),
 ('kafr_mit_sarag',             'كفر ميت سراج',          'المنوفية'),
 ('manshaet_damlo',             'منشأة دملو',            'المنوفية'),
 ('manshaet_om_henan',          'منشأة أم خنان',         'المنوفية'),
 ('manshaet_abdelmoneim_ryad',  'منشأة عبد المنعم رياض', 'المنوفية')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, governorate = EXCLUDED.governorate, is_active = true;

-- نظافة: أي قرية قديمة اتشالت من القائمة (بدون key أو key قديم مش موجود دلوقتي) —
-- انقل مستخدميها لـ"مدينة قويسنا" ثم احذفها.
UPDATE users SET village_id = (SELECT id FROM villages WHERE key = 'quesna')
 WHERE village_id IN (
   SELECT id FROM villages
    WHERE key IS NULL
       OR key IN ('tokh_tanbasha', 'sharanis', 'el_halamsha', 'damlo', 'shabraqas')
 );
DELETE FROM villages
 WHERE key IS NULL
    OR key IN ('tokh_tanbasha', 'sharanis', 'el_halamsha', 'damlo', 'shabraqas');

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
-- 'app'    = الطلب يوصل لتطبيق التاجر، هو اللي بيقبله/يجهّزه بنفسه (الافتراضي).
-- 'manual' = المتجر مالوش تطبيق بيستخدمه؛ الطلب يتخصم مخزونه فورًا ويروح على طول
--            لطابور التوزيع، والمشرف هو اللي بيتصل بالمطعم تليفونيًا ويبعت الدليفري.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS order_mode VARCHAR(10) NOT NULL DEFAULT 'app';
-- التاجر ده "موثوق" — كل تعديلاته (اسم/وصف/صور/منتجات جديدة/حذف/أحجام) بتتطبّق فورًا
-- من غير ما تحتاج موافقة الأدمن على Change Request. الأدمن بيتحكم فيها في أي وقت من
-- لوحة «التجّار». السعر والكمية ومواعيد الفتح/الغلق والعروض فورية لكل التجّار بغض
-- النظر عن العلامة دي (شوف src/vendor.js).
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS full_permissions BOOLEAN NOT NULL DEFAULT false;
-- الحد الأدنى للطلب اتشال من التاجر خالص (مفيش UI/API تقدر تغيّره تاني) — نصفّر أي
-- قيمة قديمة عشان الطلبات ما تتمنعش بحد أدنى قديم. delivery_fee فاضل كعمود غير
-- مستخدم في حساب إجمالي العميل (شوف ملاحظة أسعار التوصيل تحت)، معمول له UPDATE هنا كمان
-- عشان النسخ القديمة اللي كانت متسجّلة برسوم مختلفة تفضل واضحة إنها مش بتُستخدم.
UPDATE vendors SET min_order = 0 WHERE min_order <> 0;
CREATE INDEX IF NOT EXISTS idx_vendors_type   ON vendors(type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);

-- تقييم عميل واحد لكل متجر — تحديث التقييم بيستبدل القديم (مش تقييم جديد
-- منفصل)، فـ vendors.rating/reviews_count دايمًا متطابقين مع متوسط/عدد صفوف
-- الجدول ده. الأدمن يقدر يغلب الرقم ده يدويًا من لوحته (PUT /admin/vendors/:id)،
-- وده هيتغلب تاني أول ما حد يقيّم من التطبيق (شوف src/catalog.js).
CREATE TABLE IF NOT EXISTS vendor_ratings (
    vendor_id   VARCHAR(60) NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (vendor_id, customer_id)
);

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

-- ---------- أقسام قائمة المطعم (لكل تاجر، يديرها من لوحته) ----------
CREATE TABLE IF NOT EXISTS menu_sections (
    id          SERIAL PRIMARY KEY,
    vendor_id   VARCHAR(60) NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name_ar     VARCHAR(80) NOT NULL,
    name_en     VARCHAR(80) NOT NULL DEFAULT '',
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_menu_sections_vendor ON menu_sections(vendor_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS menu_section_id INTEGER REFERENCES menu_sections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_menu_section ON products(menu_section_id);

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
-- إزالة أي تكرار سابق (لو db:setup اتشغّل قبل إضافة القيد) ثم قيد فريد
DELETE FROM categories a USING categories b
  WHERE a.id > b.id AND a.name_ar = b.name_ar AND COALESCE(a.action,'') = COALESCE(b.action,'');
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_key ON categories (name_ar, (COALESCE(action, '')));

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
  4.6, 128, true, 'approved', 0, 0, 25, 'شارع مكرم عبيد، القاهرة', 'Makram Ebeid St, Cairo',
  30.0605, 31.3450, '["مدينة نصر","مصر الجديدة"]'::jsonb,
  '{"sat":{"open":"10:00","close":"23:59","closed":false},"sun":{"open":"10:00","close":"23:59","closed":false}}'::jsonb,
  '10:00 ص - 12:00 م', '10:00 AM - 12:00 AM'),
 ('koshari-abbas', 'كشري عباس', 'Abbas Koshari', 'restaurant',
  'اشهر كشري في المنطقة', 'The favorite koshari in town', '+201000000021',
  4.4, 210, true, 'approved', 0, 0, 20, 'شارع عباس العقاد، القاهرة', 'Abbas El Akkad St, Cairo',
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

-- ============================================================================
--  الطلبات + العناوين + الإشعارات + أجهزة الـ push  (Customer API §7 / §10.7-10.9)
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS order_seq START 1001;

CREATE TABLE IF NOT EXISTS user_addresses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       VARCHAR(60),
    details     TEXT NOT NULL,
    lat         NUMERIC(9,6),
    lng         NUMERIC(9,6),
    is_default  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id);

CREATE TABLE IF NOT EXISTS orders (
    id             VARCHAR(30) PRIMARY KEY,
    customer_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status         VARCHAR(20) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(10) NOT NULL DEFAULT 'cash',
    payment_status VARCHAR(10) NOT NULL DEFAULT 'pending',
    address_id     UUID,
    address_text   TEXT,
    address_lat    NUMERIC(9,6),
    address_lng    NUMERIC(9,6),
    notes          TEXT,
    subtotal       NUMERIC(10,2) NOT NULL DEFAULT 0,
    delivery_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    total          NUMERIC(10,2) NOT NULL DEFAULT 0,
    driver_id      VARCHAR(60),
    dispatcher_id  UUID,
    accepted_at    TIMESTAMPTZ,
    ready_at        TIMESTAMPTZ,
    assigned_at     TIMESTAMPTZ,
    picked_up_at    TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT,
    placed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_driver   ON orders(driver_id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code     VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ---------- أكواد الخصم (يديرها الأدمن من لوحته) ----------
CREATE TABLE IF NOT EXISTS coupons (
    id                SERIAL PRIMARY KEY,
    code              VARCHAR(40) NOT NULL UNIQUE,
    discount_type     VARCHAR(20) NOT NULL DEFAULT 'percent',  -- percent | amount
    discount_value    NUMERIC(10,2) NOT NULL,
    min_order_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
    max_uses          INTEGER,                -- NULL = بلا حد
    used_count        INTEGER NOT NULL DEFAULT 0,
    starts_at         TIMESTAMPTZ,
    ends_at           TIMESTAMPTZ,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_code ON coupons ((UPPER(code)));

CREATE TABLE IF NOT EXISTS order_vendors (
    order_id     VARCHAR(30) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    vendor_id    VARCHAR(60) NOT NULL,
    vendor_name  VARCHAR(180) NOT NULL,
    subtotal     NUMERIC(10,2) NOT NULL DEFAULT 0,
    delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (order_id, vendor_id)
);
-- لقطة من vendors.order_mode/phone وقت الطلب — يستخدمها المشرف في طابور
-- التوزيع لمعرفة إن كان لازم يتصل بالمطعم تليفونيًا (متجر 'manual').
ALTER TABLE order_vendors ADD COLUMN IF NOT EXISTS order_mode   VARCHAR(10) NOT NULL DEFAULT 'app';
ALTER TABLE order_vendors ADD COLUMN IF NOT EXISTS vendor_phone VARCHAR(20);

CREATE TABLE IF NOT EXISTS order_items (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    VARCHAR(30) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    vendor_id   VARCHAR(60) NOT NULL,
    product_id  VARCHAR(60),
    name        VARCHAR(180) NOT NULL,
    option_id   VARCHAR(60),
    option_name VARCHAR(120),
    unit_price  NUMERIC(10,2) NOT NULL,
    base_price  NUMERIC(10,2) NOT NULL,
    quantity    SMALLINT NOT NULL,
    line_total  NUMERIC(10,2) NOT NULL,
    note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_status_history (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id  VARCHAR(30) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status    VARCHAR(20) NOT NULL,
    by_role   VARCHAR(20),
    at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_status_hist ON order_status_history(order_id, at);

-- user_id يشير لعميل (users) أو موظف لوحة (staff_users) حسب recipient_type — بدون FK
CREATE TABLE IF NOT EXISTS notifications (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL,
    recipient_type VARCHAR(10) NOT NULL DEFAULT 'customer',   -- customer | staff
    title          VARCHAR(180) NOT NULL,
    body           TEXT NOT NULL DEFAULT '',
    type           VARCHAR(40) NOT NULL,
    order_id       VARCHAR(30),
    data           JSONB,
    is_read        BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ترحيل للنسخ القديمة اللي كان فيها FK
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fk;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_type VARCHAR(10) NOT NULL DEFAULT 'customer';
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, recipient_type, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS user_devices (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL,
    platform   VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, token)
);

-- ============================================================================
--  حسابات لوحة التحكم (أدمن/مشرف/دليفري/صاحب مكان) + طلبات التغيير (Change Requests)
--  BACKEND_HANDOFF.md §5, §8, §9, §10.11
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(150) NOT NULL,
    email         VARCHAR(150) UNIQUE,
    phone         VARCHAR(20)  UNIQUE,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20)  NOT NULL,   -- admin | dispatcher | driver | vendor_owner | vendor_staff
    vendor_id     VARCHAR(60) REFERENCES vendors(id) ON DELETE CASCADE,
    driver_id     VARCHAR(60),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_role   ON staff_users(role);
CREATE INDEX IF NOT EXISTS idx_staff_vendor ON staff_users(vendor_id);

CREATE TABLE IF NOT EXISTS change_requests (
    id             VARCHAR(30) PRIMARY KEY,
    vendor_id      VARCHAR(60) NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    submitted_by   UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    entity_type    VARCHAR(20) NOT NULL,   -- vendor | product | product_option | offer
    entity_id      VARCHAR(60),
    action         VARCHAR(10) NOT NULL,   -- create | update | delete
    current_values JSONB NOT NULL DEFAULT '{}',
    new_values     JSONB NOT NULL DEFAULT '{}',
    status         VARCHAR(15) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | cancelled
    reviewed_by    UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    review_note    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cr_status ON change_requests(status);
CREATE INDEX IF NOT EXISTS idx_cr_vendor ON change_requests(vendor_id);
CREATE SEQUENCE IF NOT EXISTS change_request_seq START 1;

-- has_pending_change flag على المنتجات
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_pending_change BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vendors  ADD COLUMN IF NOT EXISTS has_pending_change BOOLEAN NOT NULL DEFAULT false;

-- إعدادات عامة (منها approval-rules)
CREATE TABLE IF NOT EXISTS app_settings (
    key        VARCHAR(60) PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_settings (key, value) VALUES
 ('approval_rules', '{"vendor_fields":["description_ar","description_en"],"product_create":true,"product_update_fields":["name_ar","name_en","category","description_ar","description_en"],"product_delete":true,"product_options":true,"offers":true,"instant":["stock","is_available","is_open","price","working_hours"]}'),
 ('delivery_pricing', '{"extra_vendor_fee": 15}')
ON CONFLICT (key) DO NOTHING;

-- ---------- حسابات تجريبية ----------
-- كلمة السر: admin1234 / metro1234
INSERT INTO staff_users (name, email, password_hash, role) VALUES
 ('آدمن المنصة', 'admin@quesnago.com', '$2a$10$0wtHlVJfSpsWV3qM6PAU4ewIVRP9sDwNCUlV4WCL7iNYKylp3fkxS', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff_users (name, email, password_hash, role, vendor_id) VALUES
 ('صاحب مترو ماركت', 'owner@metro.test', '$2a$10$57UP2ntlwmC0n0sEBq5a8OQD1ijdkki759kAIYORznsdpHGvDqRCG', 'vendor_owner', 'metro')
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
--  الدليفري + التوزيع (Dispatch/Driver) — BACKEND_HANDOFF.md §3-4, §10.10, §11
-- ============================================================================

CREATE TABLE IF NOT EXISTS drivers (
    id                  VARCHAR(60) PRIMARY KEY,
    staff_user_id       UUID REFERENCES staff_users(id) ON DELETE SET NULL,
    name                VARCHAR(150) NOT NULL,
    phone               VARCHAR(20),
    photo               TEXT,
    vehicle_type        VARCHAR(20) NOT NULL DEFAULT 'motorcycle',
    status              VARCHAR(10) NOT NULL DEFAULT 'offline',   -- available | busy | offline
    is_online           BOOLEAN NOT NULL DEFAULT false,
    current_order_id    VARCHAR(30),
    lat                 NUMERIC(9,6),
    lng                 NUMERIC(9,6),
    location_updated_at TIMESTAMPTZ,
    zone                VARCHAR(120),
    rating              NUMERIC(3,2) NOT NULL DEFAULT 0,
    deliveries_count    INTEGER NOT NULL DEFAULT 0,
    last_assigned_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status, is_online);
-- الأدمن بيفعّلها لكل دليفري لوحده — تحكّم في دخول الدليفري من تطبيق العميل
-- (زرار "دخول كدليفري" في صفحة البروفايل)، منفصل عن دخوله للوحة التحكم على الويب.
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS app_access_enabled BOOLEAN NOT NULL DEFAULT false;

-- توكنات push بتاعة الدليفري (وضع الدليفري جوه تطبيق العميل) — منفصلة عن
-- user_devices لأن الدليفري حساب drivers/staff_users مش users.
CREATE TABLE IF NOT EXISTS driver_devices (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id  VARCHAR(60) NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    token      TEXT NOT NULL,
    platform   VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (driver_id, token)
);

-- حالة الدليفري الفرعية داخل التوصيل
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_sub_status VARCHAR(20);
-- تخفيض المخزون عند قبول التاجر — علم إن الطلب اتخصم مخزونه
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- سجل عروض التوصيل للدليفري (rotation + مهلة رفض)
CREATE TABLE IF NOT EXISTS delivery_offers (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    VARCHAR(30) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id   VARCHAR(60) NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    offered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ,
    response    VARCHAR(10),    -- accepted | rejected | timeout
    responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_delivery_offers_order ON delivery_offers(order_id);

-- ---------- حسابات + بيانات تجريبية ----------
-- driver1@quesnago.com / driver1234   ·   dispatch1@quesnago.com / disp1234
INSERT INTO staff_users (id, name, email, phone, password_hash, role, driver_id) VALUES
 ('d0000000-0000-4000-8000-000000000001', 'محمود الدليفري', 'driver1@quesnago.com', '+201000000030',
  '$2a$10$J0L78m889Bd2ls7Q49ddfeNBPM1sB91Uvk4yxRUrMj9TuiI/cURNO', 'driver', 'drv_1'),
 ('c0000000-0000-4000-8000-000000000001', 'المشرف سامي', 'dispatch1@quesnago.com', '+201000000040',
  '$2a$10$b0RRbt6QzR8xLUk4O8822.XWe0ACg/QSVPstU7f8oNh5xLmM3JdVO', 'dispatcher', NULL)
-- لازم الـ arbiter يكون على id (المفتاح الأساسي) مش email — دول صفوف بـ id
-- ثابت، فلو الـ arbiter email بس، تكرار تشغيل db.sql هيلاقي id متكرر (pkey) وده
-- constraint مختلف عن email فمش بيتغطى بـ "ON CONFLICT (email)" ويطلع خطأ.
ON CONFLICT (id) DO NOTHING;

INSERT INTO drivers (id, staff_user_id, name, phone, vehicle_type, status, is_online, zone) VALUES
 ('drv_1', 'd0000000-0000-4000-8000-000000000001', 'محمود الدليفري', '+201000000030', 'motorcycle', 'available', true, 'مدينة نصر'),
 ('drv_2', NULL, 'كريم الدليفري', '+201000000031', 'car', 'available', true, 'مدينة نصر')
ON CONFLICT (id) DO NOTHING;

UPDATE staff_users SET driver_id = 'drv_1' WHERE id = 'd0000000-0000-4000-8000-000000000001' AND driver_id IS NULL;

-- ============================================================================
--  بانرات الهوم + طلبات سريعة (Admin/Home)
-- ============================================================================
CREATE TABLE IF NOT EXISTS banners (
    id          SERIAL PRIMARY KEY,
    title_ar    VARCHAR(150),
    title_en    VARCHAR(150),
    image       TEXT NOT NULL,
    target_type VARCHAR(20),    -- vendor | category | url
    target_ref  TEXT,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quick_orders (
    id           VARCHAR(30) PRIMARY KEY,
    customer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    details      TEXT NOT NULL,
    price        NUMERIC(10,2),
    images       JSONB NOT NULL DEFAULT '[]',
    status       VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quick_orders_customer ON quick_orders(customer_id, created_at DESC);
CREATE SEQUENCE IF NOT EXISTS quick_order_seq START 1;

-- الطلب السريع كان بيتسجّل ويسيبوه كده — مفيش مشرف بيتبلّغ ومفيش تتبّع للعميل.
-- الأعمدة دي بتخلّيه يتابع نفس دورة حياة الطلب العادي (pending/accepted/
-- assigned/picked_up/on_the_way/delivered/cancelled) عشان يظهر في نفس طابور
-- التوزيع وشاشة تتبّع الطلب بالظبط زي أي طلب تاني (src/quickOrderView.js).
ALTER TABLE quick_orders ADD COLUMN IF NOT EXISTS dispatcher_id     UUID;
ALTER TABLE quick_orders ADD COLUMN IF NOT EXISTS driver_id         VARCHAR(60);
ALTER TABLE quick_orders ADD COLUMN IF NOT EXISTS driver_sub_status VARCHAR(20);
ALTER TABLE quick_orders ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE categories ADD COLUMN IF NOT EXISTS image TEXT;
