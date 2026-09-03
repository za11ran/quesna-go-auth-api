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

## الباقي
1. **رفع الصور** (`/uploads` + sharp) — لوجو/غلاف المتجر + صورة المنتج (تظهر بعد موافقة الأدمن).
2. **Vendor** تكميلي: مواعيد العمل، الموظفين (`/vendor/staff`)، العروض CRUD، bulk-price.
3. **Realtime** (Socket.IO): `vendor_new_order` · `dispatch_needs_assignment` · `driver_new_assignment` + تتبّع `driver.location` أثناء `on_the_way`. Push عبر `user_devices`.
4. مهلة رفض عرض التوصيل (`delivery_offers.expires_at`) → auto reassign للي بعده (worker/cron).
5. **الداش بورد** (React، RTL، دخول بالدور).
6. openapi.yaml للمسارات الجديدة — لسه على auth بس.
7. `/orders/quick` (multipart) — لسه.

## اختبار محلي
`pg-mem` غير مثبت كـ dependency — تُستخدم مؤقتًا في سكربتات الاختبار.
تحذير: تجنّب المنفذ 4190 في أي test (منفذ محظور في `fetch`).
