# Quesna Go — ملاحظات المشروع (لاستمرارية العمل بين الجلسات)

المرجع الكامل للمواصفات: [`BACKEND_HANDOFF.md`](./BACKEND_HANDOFF.md).

## المكوّنات
- **تطبيق Flutter (العميل)** — موجود، **ممنوع تعديله**، مرجع للدراسة فقط.
- **الـ API** (هذا الريبو) — Node/Express + PostgreSQL.
- **الداش بورد (موقع)** — لسه ما اتعملش. أدوار: admin / dispatcher / vendor_owner / vendor_staff / driver.

## قرارات متفق عليها
- الاستضافة: **VPS** (Global VPS، Ubuntu 24، 4GB) — سكربتات في `deploy/`. الدومين `quesnago.com` (هوستنجر). API على `api.quesnago.com`.
- قاعدة البيانات: PostgreSQL على نفس الـ VPS + `deploy/backup.sh` يومي.
- **صور المطاعم/المنتجات: على السيرفر نفسه** (`multer` + `sharp` + `/uploads`) — لسه ما اتعملش.
- الإيميل: **Resend** (`RESEND_API_KEY` في `.env`) — `src/mailer.js` best-effort جاهز.
- اللغة: query `?lang=ar|en` عند التسجيل + هيدر `LANG` في باقي المسارات (كتالوج/طلبات). الرد بيرجّع `user.lang`.
- **تصميم الداش بورد**: يطابق جمالية تطبيق Flutter — أبيض/كروت مدوّرة، لون أساسي أزرق، RTL، مسافات مريحة، بسيط ونضيف. (المستخدم أكّد على ده.)

## المنجز (على `main`)
| المجموعة | الحالة | الملف |
|----------|--------|------|
| Auth (OTP + بروفايل) | ✅ | `routes.auth.js` |
| Customer Catalog (vendors/products/categories/most-requested/offers) | ✅ | `catalog.js` |
| Customer Orders + addresses + notifications + devices | ✅ | `orders.js` |
| Vendor API (login/me/profile/products + **طلبات التاجر** accept/reject/preparing/ready + خصم المخزون) + **Change Requests** | ✅ | `vendor.js` + `changeRequests.js` |
| Admin API (مراجعة CR + approve/reject + إيميل + vendors + most-requested + approval-rules) | ✅ | `admin.js` |
| **Dispatch API** (طابور الجاهز + الدليفري + **rotation** + assign/auto-assign/reassign/unassign) | ✅ | `dispatch.js` |
| **Driver API** (login بالفون + online/offline + ping موقع + accept/reject + انتقالات الحالة + **إشعار العميل** + خصم رصيد + الرسيت) | ✅ | `driver.js` |
| staff auth (admin/dispatcher/driver/vendor) + `orderView.js` مشترك | ✅ | `staff-auth.js` `orderView.js` |

**دورة الطلب الكاملة تعمل end-to-end ومُختبَرة**: عميل يطلب → تاجر يقبل (خصم مخزون) → preparing → ready → مشرف auto-assign بالدور → دليفري يقبل → heading→at_vendor→picked_up (إشعار عميل) → on_the_way (إشعار) → arrived → delivered (إشعار + رسيت + رصيد الدليفري++).

حسابات تجريبية: `admin@quesnago.com/admin1234` · `owner@metro.test/metro1234` · `dispatch1@quesnago.com/disp1234` · driver: phone `+201000000030` / `driver1234`.

## 🚀 الحالة: منشور ومباشر على الإنتاج (2026-09-04)

- **مباشر على `https://api.quesnago.com`** — VPS واحد (`40.160.88.121`, Ubuntu 24) شغّال:
  Node API (PM2 `quesna-api`, port 4000) + PostgreSQL (قاعدة `quesnago`) + Nginx + شهادة Let's Encrypt (تجديد تلقائي).
  - الداش بورد على `/` · الـ API على `/api/` · `/socket.io/` · `/uploads/` — كلها من نفس الدومين بـ HTTPS.
  - كود السيرفر في `/opt/qg` (اتعمله clone من الريبو). التحديث: `cd /opt/qg && bash deploy/update.sh`.
  - `.env` الإنتاج في `/opt/qg/.env` · باسورد قاعدة البيانات في `/opt/qg/deploy/.db_password`.
  - DNS: A record `api` → `40.160.88.121` (هوستنجر).
  - اتأكد فعليًا: `curl https://api.quesnago.com/api/villages` بيرجّع JSON · الداش بورد بتفتح وتسجيل دخول الأدمن شغّال.
- **الباقي (اختياري):** `RESEND_API_KEY`+`ADMIN_EMAIL` في `.env` للإيميلات · crontab لـ `deploy/backup.sh` يوميًا ·
  push فعلي (FCM) · `openapi.yaml` لسه على auth بس · ربط تطبيق Flutter (`baseUrl = https://api.quesnago.com`).

## ✅ الحالة: الـ API + الداش بورد مكتملين ومختبَرين end-to-end

- **اختبار حقيقي** ضد **PostgreSQL حقيقي (Neon)** = **81/81 ناجح**: auth، الكتالوج، دورة الطلب كاملة
  (عميل → تاجر يقبل ويخصم مخزون → جاهز → المشرف auto-assign بالدور → الدليفري يستلم ويعدّي كل الحالات →
  تم التسليم → إشعارات العميل + الرسيت + رصيد الدليفري)، Change Requests (تاجر→أدمن موافقة/رفض)،
  Admin CRUD (أقسام/بانرات/تجّار/دليفري/مشرفين)، رفع صور (sharp→webp)، Realtime (Socket.IO)، quick-order multipart.
- **الداش بورد** اتجرّب في المتصفح ضد الـ API الحقيقي: دخول ناجح للأدوار الأربعة، التوجيه بالدور، الشاشات بتحمّل بيانات حية.
- **db.sql** صحيح على Postgres حقيقي (اتصلح باگ تكرار الأقسام: dedup + قيد فريد `uq_categories_key`).
- `npm run reset-demo` → يرجّع البيانات التجريبية نظيفة (تجّار 2، منتجات 6، حسابات لوحة 4).
- **النشر**: `deploy/setup-server.sh` بيبني الداش بورد؛ Nginx بيقدّمه على `/` ويمرّر `/api` و `/socket.io` و `/uploads`.
  الداش بورد يستخدم نفس الأصل في الإنتاج (`VITE_API_URL` فاضي).

**الباقي:** ✅ اتنشر على الـ VPS (شوف فوق) · `openapi.yaml` لسه على auth بس (توثيق فقط) · ربط تطبيق Flutter بالـ API.

## منطق الـ API (مكتمل — كل الأدوار + Realtime + العامل الخلفي)

**تفصيل غير المنطقي:**
1. **الداش بورد** — `dashboard/` (Vite + React، RTL). ✅ **كل شاشات كل الأدوار اتعملت**:
   - أدمن: نظرة عامة، طلبات التغيير (diff + موافقة/رفض)، التجّار (+إنشاء متجر)، الأقسام، البانرات، الدليفري، المشرفين، الطلبات.
   - تاجر: طلبات (لحظي)، منتجات (كمية/إخفاء فوري + سعر/أحجام/صورة → CR)، عروض، بروفايل (+لوجو/غلاف/فتح-قفل)، طلبات التغيير.
   - مشرف: طابور التوزيع (auto/manual assign + reassign + unassign، لحظي)، الدليفري + ترتيب الدور.
   - دليفري: طلباتي، online/offline، accept/reject، انتقالات الحالة.
   - `src/socket.js` (Socket.IO client + `useLive` hook).
   - **الباقي**: تجربة end-to-end مع API+DB شغّالين، ربطها بالنشر (تُقدّم من Nginx أو الـ API)، تحسينات UX.
   - تشغيل: `cd dashboard && npm install --ignore-scripts && npm run dev` (5173). البناء لازم يكون في مسار غير الـ sandbox (الـ Desktop تمام).
2. النشر على الـ VPS (السكربتات جاهزة) + Cloudinary اختياري + Resend.
3. ~~`openapi.yaml` — لسه على auth بس~~ ✅ **اتغطّى كل مسارات تطبيق العميل** (auth + كتالوج + طلبات + عناوين/إشعارات/أجهزة) — 27 operationId. مسارات اللوحات (vendor/admin/dispatch/driver) مقصود إنها مش فيه (مش بيستخدمها التطبيق).
4. تكميلي صغير: `/vendor/staff` CRUD، bulk-price، push فعلي عبر `user_devices` (FCM/OneSignal)، تقارير أعمق.

## تم مؤخرًا
- **تسعير التوصيل حقيقي من لوحة الأدمن** (بدل مجموع رسوم كل متجر) — `src/deliveryPricing.js`:
  إجمالي توصيل الطلب = `villages.delivery_base_fee` (سعر أساسي حسب قرية العميل، عمود جديد) +
  `app_settings['delivery_pricing'].extra_vendor_fee` (رسوم ثابتة لكل متجر إضافي في نفس الطلب،
  كانت 15 ج.م مضروبة في تطبيق Flutter، دلوقتي من السيرفر). `POST /api/orders` بيحسبها فعليًا كده.
  لوحة الأدمن: صفحة **«أسعار التوصيل»** (`/admin/delivery-pricing`) — تعديل الرسوم العامة
  (`GET/POST /api/admin/settings/delivery-pricing`) + تعديل سعر كل قرية على حدة
  (`GET /api/admin/villages`, `PUT /api/admin/villages/:id`). `GET /api/villages` العام
  بقى بيرجّع `delivery_base_fee` لكل قرية و`extra_vendor_fee` عام — التطبيق لازم يستخدمهم
  بدل القيم الثابتة المحلية في `ShippingPricing` عشان معاينة السلة تطابق فعليًا اللي هيتحسب وقت الطلب.
  عمود `vendors.delivery_fee` القديم فاضل في الجدول بس مش بيُستخدم في حساب إجمالي العميل تاني.
- **رفع صورة البروفايل للعميل** — `POST /api/auth/me/avatar` (multipart، حقل `image`) فوري بدون Change
  Request (صورة العميل نفسه مش صورة متجر). `PATCH /api/auth/me` أصلاً بيدعم `email`/`birth_date`/`gender`.

- **أكواد الخصم (Coupons) حقيقية** — جدول `coupons` (الأدمن هو اللي بيكتب الكود من لوحته). عام: `POST /api/coupons/validate` (معاينة الخصم في السلة قبل الطلب). `POST /api/orders` بيقبل `coupon_code` اختياري، بيتحقق منه تاني، بيطبّق الخصم على `discount_total`/`total`، وبيزوّد `used_count` — كله جوه نفس الـ transaction. لوحة الأدمن: صفحة «أكواد الخصم» (CRUD كامل: نسبة/مبلغ ثابت، حد أدنى للطلب، أقصى عدد استخدام، فترة صلاحية).

- **أقسام قائمة المطعم (Menu Sections)** — كانت ناقصة (اكتشفناها من مراجعة كود تطبيق Flutter اللي كان مستنيها). جدول `menu_sections` (لكل تاجر) + `products.menu_section_id`. عام: `GET /api/vendors/:id/menu-sections`. لوحة التاجر: `GET/POST/PUT/DELETE /api/vendor/menu-sections[/:id]` (فوري، بدون Change Request) + تعديل فوري لقسم أي منتج عبر `PATCH /vendor/products/:id { menu_section_id }`. الداش بورد: صفحة `MenuSections.jsx` تظهر لصاحب مطعم بس (زر من صفحة المنتجات).

- **مراجعة اللغة (ar/en) في كل مسارات العميل**: `src/lang.js` موحّد — `langOf(req)` بيقرأ هيدر `LANG` ثم `?lang=` ثم `body.lang` ثم `ar`. الكتالوج والطلبات بيستخدموه (الطلبات كانت بتقرأ الهيدر بس، دلوقتي بتقرأ الباراميتر كمان). إشعارات العميل بقت ثنائية اللغة `{ ar, en }` و`notify()` بيختار حسب `users.preferred_language` للعميل (مش لغة طلب الدليفري/التاجر). أُضيف إشعار **«طلبك جاهز»** عند `ready_for_pickup`. أخطاء الـ API عربي فقط **بالتصميم** — التطبيق بيترجم `error_code` بنفسه.
- **الداش بورد**: صفحة **«الأكثر طلبًا»** للأدمن (`/admin/most-requested`) — تحديد منتجات قسم الأكثر طلبًا في التطبيق. مدعومة بـ `GET /api/admin/products` (قائمة كل المنتجات + اسم المتجر + `is_most_requested`).
- **`API_GUIDE.md`**: دليل ربط تطبيق Flutter بالـ API (Base URL، التوكن، هيدر LANG، كل مسارات العميل، Socket.IO، أمثلة Dart).
- **رفع الصور**: `src/upload.js` (multer memory + sharp → webp، 5MB، jpg/png/webp) → `/uploads` (Nginx مباشرة). لوجو/غلاف/صورة منتج → **Change Request**. `/api/admin/categories|banners|... /image` و `/api/orders/quick` (multipart، حتى 5 صور).
- **Vendor**: `PUT /vendor/profile/working-hours` (فوري)، **عروض CRUD** كلها Change Request؛ `applyChangeRequest` يدعم `entity_type='offer'`.
- **Admin**: أقسام الهوم CRUD، البانرات CRUD، **إنشاء متجر + حساب صاحبه**، **حسابات دليفري/مشرفين**، `/admin/orders` `/admin/users` `/admin/reports`. + `GET /api/home/banners` للعميل.
- **Realtime** (`src/realtime.js`, Socket.IO على `/socket.io`، JWT في `handshake.auth.token`): غرف `customer:<id>` `staff:<id>` `vendor:<id>` `driver:<id>` `role:<role>`. أحداث: `notification:new` (كل إشعار)، `order:new` (للتاجر)، `order:update` (للعميل مع كل تغيّر حالة)، `dispatch:needs_assignment` (للمشرف)، `driver:assignment` (للدليفري). Nginx بيمرّر WebSocket.
- **العامل الخلفي** (`src/worker.js`): كل 20 ثانية يلغي عروض التوصيل اللي عدّت المهلة، يحرّر الدليفري، يرجّع الطلب `ready_for_pickup`، ويبثّ `dispatch:needs_assignment`. يتعطّل بـ `DISABLE_WORKER=1`.

## اختبار محلي
`pg-mem` غير مثبت كـ dependency — تُستخدم مؤقتًا في سكربتات الاختبار.
تحذير: تجنّب المنفذ 4190 في أي test (منفذ محظور في `fetch`).
