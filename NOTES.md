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

## ✅ منطق الـ API مكتمل (كل الأدوار + Realtime + العامل الخلفي)

**الباقي غير المنطقي:**
1. **الداش بورد** — `dashboard/` (Vite + React، RTL). ✅ **كل شاشات كل الأدوار اتعملت**:
   - أدمن: نظرة عامة، طلبات التغيير (diff + موافقة/رفض)، التجّار (+إنشاء متجر)، الأقسام، البانرات، الدليفري، المشرفين، الطلبات.
   - تاجر: طلبات (لحظي)، منتجات (كمية/إخفاء فوري + سعر/أحجام/صورة → CR)، عروض، بروفايل (+لوجو/غلاف/فتح-قفل)، طلبات التغيير.
   - مشرف: طابور التوزيع (auto/manual assign + reassign + unassign، لحظي)، الدليفري + ترتيب الدور.
   - دليفري: طلباتي، online/offline، accept/reject، انتقالات الحالة.
   - `src/socket.js` (Socket.IO client + `useLive` hook).
   - **الباقي**: تجربة end-to-end مع API+DB شغّالين، ربطها بالنشر (تُقدّم من Nginx أو الـ API)، تحسينات UX.
   - تشغيل: `cd dashboard && npm install --ignore-scripts && npm run dev` (5173). البناء لازم يكون في مسار غير الـ sandbox (الـ Desktop تمام).
2. النشر على الـ VPS (السكربتات جاهزة) + Cloudinary اختياري + Resend.
3. `openapi.yaml` — لسه على auth بس؛ محتاج تحديث لكل المسارات.
4. تكميلي صغير: `/vendor/staff` CRUD، bulk-price، push فعلي عبر `user_devices` (FCM/OneSignal)، تقارير أعمق.

## تم مؤخرًا
- **رفع الصور**: `src/upload.js` (multer memory + sharp → webp، 5MB، jpg/png/webp) → `/uploads` (Nginx مباشرة). لوجو/غلاف/صورة منتج → **Change Request**. `/api/admin/categories|banners|... /image` و `/api/orders/quick` (multipart، حتى 5 صور).
- **Vendor**: `PUT /vendor/profile/working-hours` (فوري)، **عروض CRUD** كلها Change Request؛ `applyChangeRequest` يدعم `entity_type='offer'`.
- **Admin**: أقسام الهوم CRUD، البانرات CRUD، **إنشاء متجر + حساب صاحبه**، **حسابات دليفري/مشرفين**، `/admin/orders` `/admin/users` `/admin/reports`. + `GET /api/home/banners` للعميل.
- **Realtime** (`src/realtime.js`, Socket.IO على `/socket.io`، JWT في `handshake.auth.token`): غرف `customer:<id>` `staff:<id>` `vendor:<id>` `driver:<id>` `role:<role>`. أحداث: `notification:new` (كل إشعار)، `order:new` (للتاجر)، `order:update` (للعميل مع كل تغيّر حالة)، `dispatch:needs_assignment` (للمشرف)، `driver:assignment` (للدليفري). Nginx بيمرّر WebSocket.
- **العامل الخلفي** (`src/worker.js`): كل 20 ثانية يلغي عروض التوصيل اللي عدّت المهلة، يحرّر الدليفري، يرجّع الطلب `ready_for_pickup`، ويبثّ `dispatch:needs_assignment`. يتعطّل بـ `DISABLE_WORKER=1`.

## اختبار محلي
`pg-mem` غير مثبت كـ dependency — تُستخدم مؤقتًا في سكربتات الاختبار.
تحذير: تجنّب المنفذ 4190 في أي test (منفذ محظور في `fetch`).
