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
| Vendor API (login/me/profile/products) + **Change Requests** | ✅ | `vendor.js` + `changeRequests.js` |
| Admin API (مراجعة CR + approve/reject + إيميل + vendors + most-requested + approval-rules) | ✅ | `admin.js` |
| staff auth (admin/dispatcher/driver/vendor) | ✅ | `staff-auth.js` |

حسابات تجريبية: `admin@quesnago.com / admin1234` · `owner@metro.test / metro1234`.

## الباقي
1. **رفع الصور** (`/uploads` + sharp) — لوجو/غلاف المتجر + صورة المنتج (تظهر بعد موافقة الأدمن).
2. **Vendor**: مواعيد العمل، الموظفين (`/vendor/staff`)، العروض CRUD، طلبات التاجر (`/vendor/orders` accept/reject/preparing/ready).
3. **Dispatch API** (`/dispatch/*`): طابور الجاهز، الدليفري وحالتهم، **rotation/round-robin**، assign/reassign/unassign.
4. **Driver API** (`/driver/*`): login، online/offline، ping موقع، accept/reject، انتقالات الحالة → **إشعار العميل** عند `picked_up`/`on_the_way` + الرسيت عند `delivered`. decrement المخزون عند قبول التاجر.
5. **Realtime** (Socket.IO) + Push عبر `user_devices`.
6. **الداش بورد** (React، RTL، دخول بالدور).
7. openapi.yaml للمسارات الجديدة (كتالوج/طلبات/vendor/admin) — لسه على auth بس.

## اختبار محلي
`pg-mem` غير مثبت كـ dependency — تُستخدم مؤقتًا في سكربتات الاختبار.
تحذير: تجنّب المنفذ 4190 في أي test (منفذ محظور في `fetch`).
