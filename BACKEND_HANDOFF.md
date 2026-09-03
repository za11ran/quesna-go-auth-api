# quesna_go — Backend Handoff / مواصفات النظام الكاملة

> الهدف: أي حد يبني الـ backend + لوحات التحكم يعرف بالظبط المطلوب من غير ما يفتح كود الفرونت.
> الفرونت (Flutter) جاهز ومبني على mock data — محتاج توصيل بـ API بس.
>
> **المكوّنات:** تطبيق العميل (Flutter، موجود) · API التطبيق · لوحة تحكم التاجر · لوحة تحكم المشرف/الدسباتش ·
> تطبيق/لوحة الدليفري · لوحة تحكم الأدمن (فيها **موافقة على تغييرات التجّار**).

---

## 1. نبذة عن النظام

منصة **توصيل** في مصر (سوبر ماركت + مطاعم + أي تاجر). العملة جنيه مصري (EGP). التطبيق **ثنائي اللغة (ar/en)**
عبر header `LANG`. **مفيش Firebase**؛ الـ auth حالياً stub في الفرونت.

### تدفّق الطلب الكامل
```
العميل يطلب
   → التاجر يستقبل الطلب على لوحته → يقبل / يرفض
   → التاجر يجهّز → "جاهز للاستلام"
   → المشرف (Dispatcher) يشوف الطلب الجاهز → يبعته للدليفري اللي عليه الدور (rotation) — يدوي أو تلقائي
   → الدليفري يستلم من التاجر → "اتحرك / جاري التوصيل"  ← إشعار للعميل
   → الدليفري يسلّم → "تم التوصيل" ← إشعار للعميل + الرسيت (receipt)
```

### موافقة الأدمن على تغييرات التاجر
أي تغيير من التاجر في **بيانات حسّاسة** (اسم المتجر، سعر منتج، إضافة/تعديل منتج، أحجام/أطعمة، عروض)
**مايتطبّقش على طول** — يتحوّل لـ **Change Request** يوصل للأدمن (على لوحته + **إيميل الأدمن**)، والأدمن **يوافق أو يرفض**.
تغييرات تشغيلية سريعة (الكمية `stock`، إخفاء منتج `is_available`، فتح/قفل المتجر `is_open`) **فورية بدون موافقة**
(قابل للضبط من إعدادات الأدمن).

---

## 2. التقنيات (Front-end app)

| | |
|---|---|
| Framework | Flutter (Dart, SDK ^3.12) |
| State | `flutter_bloc` (Cubit) · DI: `get_it` · Routing: `go_router` |
| HTTP | `dio` خلف abstraction `ApiConsumer` (get/post/delete/patch) |
| Errors | `dartz` — `Either<Failure, T>` |
| تخزين محلي | `shared_preferences` |

## 3. المعمارية (Front-end)

Clean Architecture، feature-first:
`presentation (Cubit/State/View) → domain (Entity/Repo abstract/UseCase) → data (Model/DataSource/RepoImpl) → ApiConsumer → API`.
الـ Presentation مابتكلمش الـ API مباشرة.

## 4. هيكل المجلدات (Front-end)

```
lib/
├── main.dart
├── l10n/app_localizations.dart          # يقرأ assets/lang/{ar,en}.json
├── core/
│   ├── api/  (api_consumer, dio_consumer, api_interceptors, endpoints)
│   ├── error/ (error_model, exceptions, failures, dio_exception_handler)
│   ├── enums/ (vendor_type, supermarket_category)
│   ├── usecases/usecase.dart
│   ├── di/service_locator.dart
│   ├── services/local_storage_service.dart
│   ├── routing/app_router.dart
│   ├── utils/ (app_colors, app_styles, app_assets, app_constants)
│   └── widgets/
└── features/
    ├── auth/  home/  vendor/  product/  cart/  orders/  quick_order/
    ├── favorites/  addresses/  notifications/  profile/
    (auth/orders/notifications: backend مطلوب — الباقي شغّال على mock أو محلي)
```

---

## 5. الأطراف والصلاحيات (Actors & Roles)

| Role | يدخل من | يقدر يعمل |
|---|---|---|
| `customer` | تطبيق العميل | يتصفّح، يطلب، يتتبّع، يقيّم، يدير عناوينه/مفضلته/بروفايله |
| `vendor_owner` | لوحة التاجر | كل حاجة تخص تاجره؛ التغييرات الحسّاسة تروح Change Request |
| `vendor_staff` | لوحة التاجر | يدير الطلبات + توفّر المنتجات فقط (من غير أسعار/حذف/بيانات المتجر) |
| `dispatcher` (مشرف) | لوحة الدسباتش | يستقبل الطلبات الجاهزة، يوزّعها على الدليفري بالدور، يعيد التوزيع، يتابع |
| `driver` (كابتن دليفري) | تطبيق/لوحة الدليفري | يستقبل تعيين، يستلم من التاجر، يحدّث الحالة، يسلّم |
| `admin` | لوحة الأدمن | يوافق/يرفض تغييرات التجّار، يوافق على التجّار، يدير الكاتيجوريز/البانرات/المستخدمين، يشوف كل حاجة |

- كل تاجر ≥ أكونت `vendor_owner` مربوط بـ `vendor_id`. الـ token يحدّد الـ role و(للتاجر/الدليفري) الـ id المرتبط.
- أي endpoint في `/vendor/*` أو `/driver/*` **لازم يتأكد إن المورد تابع لنفس الـ id بتاع التوكن**.

---

## 6. قواعد عامة للـ API

### Base URL
`lib/core/api/endpoints.dart` → `Endpoints.baseUrl` (حالياً placeholder `https://azhala.codlop.sa/api`).

### Headers (الفرونت يبعتهم تلقائياً — `api_interceptors.dart`)
| Header | القيمة |
|---|---|
| `LANG` | `ar` \| `en` |
| `Authorization` | `Bearer <token>` لو متخزّن في `SharedPreferences["token"]` |
| `Content-Type` | `application/json` أو `multipart/form-data` للرفع |

### شكل الردود
- **قوائم**: الفرونت يقبل `{ "data": [ ... ] }` أو array مباشرة. يفضّل `{ "data": [...], "meta": {page,per_page,total,last_page} }`.
- **عنصر**: object مباشرة أو `{ "data": {...} }`.
- **نجاح**: أي 2xx.

### شكل الخطأ (`error_model.dart`) — أي status مش 2xx
```json
{ "success": false, "message": "رسالة للمستخدم بلغة LANG", "timestamp": "2026-01-01T12:00:00Z" }
```
الفرونت يعرض `message` مباشرة.

### ملاحظات parser (`Product.fromJson`)
متسامح: يقبل `snake_case`/`camelCase` وأكتر من اسم للحقل، و`price` كـ string أو number. **ابعت `snake_case`.**

### عام
- Pagination + `?search=` + `?sort=` لكل القوائم.
- Timezone موحّد **Africa/Cairo** لكل المواعيد/العروض.
- rate-limit على `POST /auth/send-otp`.
- soft delete (مش hard) للتجّار/المنتجات/المستخدمين.

---

# API #1 — Customer API (تطبيق العميل)

## 7.1 Endpoints

| Method | Path | الوصف | حالة الفرونت |
|---|---|---|---|
| `POST` | `/auth/send-otp` | إرسال كود | مطلوب |
| `POST` | `/auth/verify-otp` | تحقّق + `token` + user | مطلوب |
| `POST` | `/auth/register` | (اختياري) اسم+موبايل+عنوان قبل OTP | مطلوب |
| `POST` | `/devices` | تسجيل توكن الجهاز للـ push `{token, platform}` | مطلوب |
| `GET` | `/vendors?type=restaurant\|supermarket&search=` | قايمة التجّار | مطلوب |
| `GET` | `/vendors/{vendorId}` | تفاصيل تاجر | معرّف، مش مستخدم |
| `GET` | `/vendors/{vendorId}/products?category=&search=` | منتجات تاجر | **معرّف** |
| `GET` | `/vendors/{vendorId}/products/{productId}` | تفاصيل منتج | مطلوب |
| `GET` | `/home/categories` | كاتيجوريز الهوم | مطلوب |
| `GET` | `/products/most-requested` | الأكثر طلباً | مطلوب |
| `GET` | `/offers` | العروض الفعّالة | مطلوب |
| `POST` | `/orders` | إنشاء طلب من السلة | مطلوب |
| `GET` | `/orders` | طلباتي | مطلوب |
| `GET` | `/orders/{id}` | تفاصيل + `status_history` | مطلوب |
| `GET` | `/orders/{id}/receipt` | **الرسيت** (يتبعت للعميل عند التسليم) | مطلوب |
| `POST` | `/orders/{id}/cancel` | إلغاء (قبل القبول) | مطلوب |
| `POST` | `/orders/quick` | طلب سريع (multipart) | **معرّف + contract جاهز** |
| `GET/POST/DELETE` | `/addresses`, `/addresses/{id}` | عناوين المستخدم | مطلوب |
| `GET/PUT` | `/profile` + `POST /profile/avatar` | المستخدم + الصورة | مطلوب |
| `GET/POST/DELETE` | `/favorites`, `/favorites/{productId}` | المفضلة | مطلوب |
| `GET` | `/notifications` + `POST /notifications/{id}/read` | إشعارات المستخدم | مطلوب |
| `GET/POST` | `/vendors/{id}/reviews` | تقييمات | مطلوب (اختياري) |

> الفرونت معرّف حالياً `/vendors/restaurants` و `/vendors/supermarkets` بيرجّعوا **منتجات** (تصميم غير مكتمل).
> المقترح أعلاه: `/vendors?type=` للتجّار، والمنتجات من `/vendors/{id}/products`. الفرونت هيتظبط عليه.

## 7.2 Auth (تفصيل)

Sign In = موبايل. Sign Up = اسم + موبايل + عنوان + موافقة شروط.

### `POST /auth/send-otp`
```json
// req
{ "phone": "+201012345678", "flow": "sign_in", "name": "أحمد", "address": "..." }
// res 200
{ "success": true, "message": "تم إرسال الكود", "expires_in": 90 }
```

### `POST /auth/verify-otp`
```json
// req
{ "phone": "+201012345678", "code": "1234", "flow": "sign_in" }
// res 200 — لازم token
{ "token": "eyJ...", "user": { "id": "u_123", "name": "أحمد", "phone": "+201012345678", "avatar": "https://..." } }
```
الفرونت يخزّن `token` في `SharedPreferences["token"]`. أخطاء متوقعة: رقم غلط، كود غلط/منتهي، محاولات كتير،
الرقم مسجّل (sign_up)، الرقم مش مسجّل (sign_in) — كلها `{success:false,message}`.

---

# API #2 — Vendor Dashboard API (لوحة تحكم التاجر)  `/vendor/*`

الصلاحية بالـ token (`role in [vendor_owner, vendor_staff]`).

## 8.1 دخول التاجر
| Method | Path | |
|---|---|---|
| `POST` | `/vendor/auth/login` | email/phone + password → `token` + `vendor` + `role` |
| `POST` | `/vendor/auth/forgot-password` | |
| `GET` | `/vendor/me` | التاجر الحالي + الصلاحيات + عدّاد Change Requests المعلّقة |
| `GET` | `/vendor/staff` · `POST` · `DELETE /vendor/staff/{id}` | إدارة موظفي المتجر (`vendor_staff`) |

## 8.2 إدارة بيانات المتجر
| Method | Path | الوصف | يحتاج موافقة أدمن؟ |
|---|---|---|---|
| `GET` | `/vendor/profile` | كل بيانات المتجر | — |
| `PUT` | `/vendor/profile` | **الاسم**، الوصف/المواصفات، التليفون، الحد الأدنى للطلب، رسوم التوصيل، وقت التحضير | ✅ (الاسم + رسوم التوصيل + الحد الأدنى) |
| `POST` | `/vendor/profile/logo` \| `/cover` | رفع صورة (multipart `image`) → `{url}` | ✅ |
| `PUT` | `/vendor/profile/working-hours` | **مواعيد العمل** (من/إلى لكل يوم — 10.6) | ⚙️ قابل للضبط (افتراضي: لا) |
| `PUT` | `/vendor/profile/status` | فتح/قفل يدوي `{ "is_open": true }` | ❌ فوري |
| `PUT` | `/vendor/profile/location` | العنوان + `lat`/`lng` + مناطق التوصيل | ✅ |

## 8.3 إدارة المنتجات
| Method | Path | الوصف | موافقة؟ |
|---|---|---|---|
| `GET` | `/vendor/products?category=&search=&page=` | كل منتجات التاجر (وبيوضّح المعلّق للموافقة) | — |
| `POST` | `/vendor/products` | **إضافة منتج**: الاسم، الوصف، الكاتيجوري، **السعر الأساسي**، `stock`، `has_options`، `options[]` | ✅ |
| `PUT` | `/vendor/products/{id}` | تعديل أي حاجة **بما فيها السعر** | ✅ (السعر/الاسم/الأحجام) |
| `PATCH` | `/vendor/products/{id}` | تعديل تشغيلي سريع: `{stock}` / `{is_available}` | ❌ فوري |
| `DELETE` | `/vendor/products/{id}` | حذف (soft) | ✅ |
| `POST` | `/vendor/products/{id}/image` | **رفع صورة المنتج** (multipart `image`) → `{url}` | ✅ (تظهر بعد الموافقة) |
| `PUT` | `/vendor/products/{id}/options` | **تفعيل/تعديل الأحجام/الأطعمة** (10.3) | ✅ |
| `POST` | `/vendor/products/bulk-price` | تعديل أسعار جماعي (اختياري) | ✅ |

**تفعيل الأحجام/الأطعمة (السيناريو المطلوب):**
التاجر يعمل toggle لـ `has_options` ويضيف صفوف، كل صف = **اسم** ("كبير" / "طعم الجبنة") + **سعر الحجم نفسه** + **كمية متوفرة** لهذا الحجم (اختياري) + `is_available`.
> ⚠️ الفرونت حالياً يستخدم `additional_price` (زيادة). **الجديد المتفق عليه**: كل option ترجع بـ **`price` (السعر النهائي)**،
> والباك اند يرجّع كمان `additional_price = option.price - product.price` للتوافق المؤقت. الفرونت هيتحوّل لـ `price`.

## 8.4 العروض (Offers)
| Method | Path | | موافقة؟ |
|---|---|---|---|
| `GET` | `/vendor/offers` | عروض التاجر | — |
| `POST` `PUT` `DELETE` | `/vendor/offers[/{id}]` | إنشاء/تعديل/حذف عرض | ✅ |

عرض = خصم % أو مبلغ، على منتج/كاتيجوري/المتجر كله، بمدة `starts_at`/`ends_at`، + بانر ونص اختياري (10.5).

## 8.5 طلبات التاجر
| Method | Path | الوصف |
|---|---|---|
| `GET` | `/vendor/orders?status=&date=` | طلبات المتجر |
| `GET` | `/vendor/orders/{id}` | تفاصيل + بيانات العميل + العنوان |
| `PATCH` | `/vendor/orders/{id}/status` | `accepted` / `rejected` (+`reason`) / `preparing` / `ready_for_pickup` |
| Realtime | socket / push / webhook | إشعار التاجر بطلب جديد فوراً |

## 8.6 Change Requests (من جهة التاجر)
| Method | Path | |
|---|---|---|
| `GET` | `/vendor/change-requests?status=pending\|approved\|rejected` | متابعة طلبات التغيير بتاعته |
| `POST` | `/vendor/change-requests/{id}/cancel` | سحب طلب معلّق قبل مراجعته |

أي `PUT/POST/DELETE` حسّاس فوق **بينشئ Change Request تلقائياً** بدل ما يطبّق مباشرة، والرد بيكون:
```json
{ "status": "pending_approval", "change_request_id": "cr_1", "message": "تم إرسال التعديل لمراجعة الإدارة" }
```

---

# API #3 — Dispatch Dashboard API (لوحة المشرف)  `/dispatch/*`

الصلاحية `role in [dispatcher, admin]`.

| Method | Path | الوصف |
|---|---|---|
| `GET` | `/dispatch/orders?status=ready_for_pickup\|assigned\|on_the_way` | طابور الطلبات المحتاجة/تحت التوصيل |
| `GET` | `/dispatch/orders/{id}` | تفاصيل الطلب + التاجر + العميل + العنوان + الدليفري الحالي |
| `GET` | `/dispatch/drivers` | كل الدليفري + حالتهم (`available/busy/offline`) + مكانهم + ترتيبهم في الطابور |
| `GET` | `/dispatch/queue` | **ترتيب الدور الحالي** (rotation) — مين عليه الدور الجاي |
| `POST` | `/dispatch/orders/{id}/assign` | تعيين يدوي `{ "driver_id": "d_5" }` |
| `POST` | `/dispatch/orders/{id}/auto-assign` | تعيين تلقائي **للي عليه الدور** (round-robin على الـ `available` في نفس المنطقة) |
| `POST` | `/dispatch/orders/{id}/reassign` | إعادة تعيين `{ "driver_id": "d_7", "reason": "..." }` |
| `POST` | `/dispatch/orders/{id}/unassign` | سحب من الدليفري ورجوعه للطابور |
| Realtime | socket / push | إشعار المشرف بطلب جديد "جاهز للاستلام" محتاج تعيين |

### منطق "اللي عليه الدور" (Rotation)
- قايمة الدليفري `available` (online + مش مشغول) مرتّبة حسب **آخر مرة اتعيّن له طلب** (الأقدم = عليه الدور).
- `auto-assign` بياخد الأول في الطابور، ولو رفض/انتهت المهلة (مثلاً 60 ثانية) → التالي.
- قابل للفلترة بالمنطقة (`zone`) وبالمسافة من التاجر (لو فيه `location` للدليفري).
- المشرف يقدر يتجاوز الترتيب بتعيين يدوي.

---

# API #4 — Driver App/Portal API (الدليفري)  `/driver/*`

الصلاحية `role = driver`.

| Method | Path | الوصف |
|---|---|---|
| `POST` | `/driver/auth/login` | phone + password → `token` + `driver` |
| `GET` | `/driver/me` | بيانات الدليفري + حالته |
| `PUT` | `/driver/status` | `{ "status": "available" \| "offline" }` (online/offline) |
| `POST` | `/driver/location` | ping بالموقع `{ lat, lng }` (كل X ثانية) لتتبّع العميل |
| `GET` | `/driver/orders` | الطلبات المعيّنة له (الحالية + السجل) |
| `GET` | `/driver/orders/{id}` | تفاصيل + عنوان التاجر + عنوان العميل + أرقامهم |
| `POST` | `/driver/orders/{id}/accept` \| `/reject` | قبول/رفض التعيين (خلال المهلة) |
| `PATCH` | `/driver/orders/{id}/status` | `heading_to_vendor` → `at_vendor` → `picked_up` → `on_the_way` → `arrived` → `delivered` |
| `POST` | `/driver/orders/{id}/proof` | (اختياري) إثبات تسليم: صورة / توقيع / كود |
| Realtime | socket / push | إشعار الدليفري بتعيين جديد |

**نقطة مهمة (طلب العميل):**
- لما الدليفري يعمل `picked_up` / `on_the_way` → **إشعار فوري للعميل**: «طلبك اتحرك وجاري التوصيل» + تتبّع مباشر لو متاح.
- لما يعمل `delivered` → **إشعار للعميل + الرسيت** (`Receipt` — 10.8) + (اختياري) إيميل/PDF.

---

# API #5 — Admin Dashboard API (الأدمن)  `/admin/*`

| Method | Path | الوصف |
|---|---|---|
| `GET` | `/admin/change-requests?status=pending&type=&vendor_id=` | **كل تغييرات التجّار المعلّقة** |
| `GET` | `/admin/change-requests/{id}` | تفاصيل: القيم القديمة vs الجديدة (diff) |
| `POST` | `/admin/change-requests/{id}/approve` | **موافقة** → التغيير يتطبّق فوراً + إشعار التاجر |
| `POST` | `/admin/change-requests/{id}/reject` | **رفض** `{ "note": "السبب" }` → يتلغى + إشعار التاجر |
| `POST` | `/admin/settings/approval-rules` | ضبط أنهي أنواع تغييرات تحتاج موافقة |
| `GET/POST` | `/admin/vendors` … `/approve` `/suspend` | موافقة/تعليق التجّار (`status: pending→approved→suspended`) |
| `GET/POST/PUT/DELETE` | `/admin/categories` · `/admin/banners` | كاتيجوريز وبانرات الهوم |
| `GET/POST` | `/admin/drivers` · `/admin/dispatchers` | إنشاء وإدارة حسابات الدليفري والمشرفين |
| `GET` | `/admin/orders` · `/admin/users` · `/admin/reports` | نظرة شاملة |

### إشعار الأدمن بأي Change Request جديد
- **على اللوحة** (badge + قائمة) **+ إيميل لإيميل الأدمن** (SMTP / خدمة إيميل) بموضوع فيه اسم التاجر ونوع التغيير ورابط المراجعة.
- (اختياري) إشعار Slack/Webhook.

---

## 9. Change Request — سير العمل بالتفصيل

1. التاجر يبعت تعديل حسّاس (اسم/سعر/منتج/أحجام/عرض/لوجو…).
2. الباك اند **مايطبّقش**، ينشئ `ChangeRequest` بحالة `pending`، ويحفظ **snapshot للقيم الحالية** و**القيم الجديدة (payload)**.
3. المنتج/الحقل الأصلي يفضل بقيمته القديمة، ويتعلّم عليه `has_pending_change: true` في رد لوحة التاجر.
4. إشعار للأدمن (لوحة + إيميل).
5. الأدمن يفتح المراجعة (diff)، ويعمل `approve` أو `reject(note)`.
   - `approve` → الباك اند يطبّق الـ payload على المورد + `ChangeRequest.status=approved` + إشعار التاجر «تمت الموافقة».
   - `reject` → `status=rejected` + `review_note` + إشعار التاجر «مرفوض: <السبب>».
6. التاجر يقدر يسحب الطلب المعلّق (`/vendor/change-requests/{id}/cancel`).

**أنواع قابلة للضبط (approval-rules):** الافتراضي أن اللي محتاج موافقة =
`vendor.name`, `vendor.delivery_fee`, `vendor.min_order`, `vendor.logo/cover`, `product create/update(price,name,options)`,
`product delete`, `offers`. واللي **فوري بدون موافقة** = `stock`, `is_available`, `is_open`, قبول/رفض الطلبات.

---

## 10. عقود الـ JSON (Models)

> ✏️ = حقل تعدّله لوحة التاجر. (بعضها عبر Change Request.)

### 10.1 `Vendor`
```json
{
  "id": "metro",
  "name": "مترو ماركت",                     
  "type": "supermarket",
  "description": "مواصفات المتجر...",         
  "logo": "https://.../logo.png",           
  "cover_image": "https://.../cover.jpg",   
  "phone": "+2010...",                      
  "category_label": "سوبر ماركت",
  "rating": 4.6, "reviews_count": 128,
  "is_open": true,                          
  "is_active": true,
  "status": "approved",                     
  "working_hours": { "...": "10.6" },        
  "working_hours_text": "10:00 ص - 1:00 ص",
  "delivery_fee": 15,                       
  "min_order": 50,                          
  "avg_prep_time_minutes": 25,              
  "address": "شارع ...، القاهرة",           
  "location": { "lat": 30.04, "lng": 31.23 },
  "delivery_zones": ["مدينة نصر", "مصر الجديدة"],
  "has_pending_change": false
}
```
`VendorModel` في الفرونت **مفيهوش `fromJson`** — لازم يتكتب على الأسماء دي.
`delivery_fee` **يستبدل** الرقم الثابت `15` في `CartCubit.shippingPerVendor`.

### 10.2 `Product`
```json
{
  "id": "metro_9", "vendor_id": "metro",
  "product_name": "شيبسي بالجبنة",           
  "brand": "مترو ماركت",                     
  "description": "شيبسي مقرمش.",              
  "price": 10,                              
  "image": "https://.../chips.jpg",         
  "category": "snacks",                     
  "stock": 40,                             
  "is_available": true,                    
  "has_options": true,                     
  "sort_order": 3,                          
  "discount": { "type": "percent", "value": 15, "price_after": 8.5 },
  "has_pending_change": false,
  "options": [
    { "id": "cheese", "name": "طعم الجبنة", "price": 10, "additional_price": 0, "stock": 20, "is_available": true },
    { "id": "bbq",    "name": "باربكيو",    "price": 12, "additional_price": 2, "stock": 0,  "is_available": false }
  ]
}
```
| حقل | نوع | ✏️ | ملاحظات / أسماء بديلة |
|---|---|---|---|
| `id` | string/number | | |
| `vendor_id` | string | | أو `vendorId` |
| `product_name` | string | ✏️ | أو `name` / `title` |
| `brand`, `description` | string | ✏️ | default `""` |
| `price` | number/string | ✏️ **في أي وقت (بموافقة)** | السعر الأساسي |
| `image` | URL | ✏️ (رفع) | أو `logo` |
| `category` | string | ✏️ | قيم 11 (سوبرماركت) |
| `stock` | number | ✏️ **فوري** | الكمية المتوفرة؛ `0` = نافد. أو `quantity_available` |
| `is_available` | bool | ✏️ **فوري** | إخفاء/إظهار |
| `has_options` | bool | ✏️ (toggle، بموافقة) | لو true → `options[]` مش فاضية |
| `discount` | object\|null | (من العروض) | `{type:"percent"\|"amount", value, price_after}` |
| `options` | array\|null | ✏️ | 10.3 |

### 10.3 `ProductOption`
```json
{ "id": "large", "name": "كبير", "price": 130, "additional_price": 30, "stock": 12, "is_available": true }
```
`id` فريد داخل المنتج · `name` مترجم · **`price` = السعر النهائي للحجم/النوع** ·
`additional_price` = `price - product.price` (توافق) · `stock` اختياري لكل حجم · `is_available` bool.
الفرونت يختار **option واحدة**، وكل option سطر منفصل في السلة (`key = productId_optionId`).

### 10.4 `Category` (هوم)
`{ "id":1, "name":"مطاعم", "image":"URL", "type":"vendors", "action":"restaurants" }` — يديرها الأدمن.

### 10.5 `Offer`
```json
{
  "id":"off_1", "vendor_id":"metro", "title":"خصم 15% على السناكس", "description":"...",
  "banner_image":"URL", "scope":"category", "target_id":"snacks",
  "discount_type":"percent", "discount_value":15,
  "starts_at":"...", "ends_at":"...", "is_active":true
}
```
`scope`: `store` | `category` | `product` · `discount_type`: `percent` | `amount`.
الباك اند يحسب `product.discount.price_after` ويحطه جوّه المنتج.

### 10.6 `WorkingHours`
```json
{
  "sat": { "open":"10:00", "close":"23:59", "closed":false },
  "sun": { "open":"10:00", "close":"23:59", "closed":false },
  "fri": { "open":"13:00", "close":"23:59", "closed":false }
}
```
أو مبسّط `{ "from":"10:00", "to":"01:00", "days":["sat","sun",...] }`. ابعت كمان `working_hours_text` جاهز للعرض.
خارج المواعيد أو `is_open=false` → يمنع الطلب.

### 10.7 `Order`
**POST** `/orders`:
```json
// req
{
  "items": [ { "product_id":"metro_9", "option_id":"large", "quantity":2, "note":"بدون شطة" } ],
  "address_id": "addr_1", "address_text": "شارع ...",
  "notes": "الدور الرابع", "payment_method": "cash"
}
// res 201
{
  "id": "ord_1001", "status": "pending", "created_at": "...",
  "customer": { "id":"u_1", "name":"...", "phone":"..." },
  "vendors": [ { "vendor_id":"metro", "vendor_name":"مترو ماركت", "subtotal":250, "delivery_fee":15 } ],
  "driver": null,
  "dispatcher_id": null,
  "subtotal":250, "delivery_total":15, "discount_total":0, "total":265,
  "items": [ { "product_id":"...", "name":"...", "option_name":"كبير", "unit_price":130, "quantity":2, "line_total":260 } ],
  "timestamps": {
    "placed_at":"...", "accepted_at":null, "ready_at":null,
    "assigned_at":null, "picked_up_at":null, "delivered_at":null
  },
  "status_history": [ { "status":"pending", "at":"...", "by":"customer" } ]
}
```
- `payment_method`: `cash` | `card` | `wallet`.
- السلة ممكن تكون من **أكتر من تاجر** → قسّم `delivery_fee` لكل تاجر (الفرونت حالياً: عدد التجّار × 15).
- بعد التعيين يتضاف: `driver: { id, name, phone, photo, location, vehicle_type }`, `dispatcher_id`.
- `GET /orders/{id}` يرجّع نفس الشكل + `status_history` كامل. الفرونت يتتبّع الطلب من `status` و `driver.location`.

### 10.8 `Receipt` — الرسيت (يتبعت للعميل عند التسليم)
**GET** `/orders/{id}/receipt`:
```json
{
  "order_id": "ord_1001",
  "issued_at": "2026-01-01T13:20:00Z",
  "customer": { "name":"أحمد", "phone":"+2010...", "address":"شارع ..." },
  "vendor": { "name":"مترو ماركت", "phone":"+2010..." },
  "driver": { "name":"محمد", "phone":"+2010..." },
  "items": [ { "name":"شيبسي بالجبنة - كبير", "unit_price":130, "quantity":2, "line_total":260 } ],
  "subtotal": 260, "delivery_fee": 15, "discount": 0, "total": 275,
  "payment_method": "cash", "payment_status": "paid",
  "delivered_at": "2026-01-01T13:18:00Z",
  "pdf_url": "https://.../receipts/ord_1001.pdf"
}
```
عند `delivered` → إشعار للعميل type `order_delivered` وفيه `receipt` (أو رابطه).

### 10.9 `Address`
`{ "id":"addr_1", "label":"المنزل", "details":"شارع ...، الدور 4", "lat":30.0, "lng":31.2, "is_default":true }`

### 10.10 `Driver`
```json
{
  "id":"d_5", "name":"محمد علي", "phone":"+2010...", "photo":"URL",
  "vehicle_type":"motorcycle", "status":"available",
  "is_online":true, "current_order_id":null,
  "location":{ "lat":30.05, "lng":31.24, "updated_at":"..." },
  "zone":"مدينة نصر", "rating":4.8, "deliveries_count":320,
  "last_assigned_at":"2026-01-01T12:40:00Z"
}
```
`status`: `available` | `busy` | `offline`. `last_assigned_at` = أساس ترتيب الدور.

### 10.11 `ChangeRequest`
```json
{
  "id": "cr_1",
  "vendor_id": "metro",
  "submitted_by": "vs_2",
  "entity_type": "product",              
  "entity_id": "metro_9",
  "action": "update",                    
  "current_values": { "price": 10 },
  "new_values": { "price": 12, "options": [ ... ] },
  "status": "pending",                   
  "reviewed_by": null,
  "review_note": null,
  "created_at": "...", "reviewed_at": null
}
```
`entity_type`: `vendor` | `product` | `product_option` | `offer`. `action`: `create` | `update` | `delete`.

### 10.12 `Notification`
```json
{ "id":"n_1", "title":"طلبك في الطريق", "body":"...", "type":"order_on_the_way", "order_id":"ord_1001", "is_read":false, "created_at":"..." }
```

### 10.13 `QuickOrder` (multipart)
**POST** `/orders/quick` — `multipart/form-data`: `details` (string) · `price` (number) · `images` (file[] 0..5). الرد: أي 2xx = نجاح.

---

## 11. قيم الـ Enums

### `vendor.type`
`restaurant` , `supermarket` , `pharmacy` , `bakery` , `cafe` , `other`

### `vendor.status`
`pending` , `approved` , `suspended` , `rejected`

### `product.category` (سوبرماركت)
القياسي: `grocery` , `dairyAndCheese` , `cleaning` , `beverages` , `snacks` , `frozen` , `other`
الفرونت يقبل aliases (case-insensitive): `dairy`/`dairy_cheese`, `drinks`→beverages، وعربي (`بقالة`,`ألبان وجبن`,`منظفات`,`مشروبات`,`سناكس`,`مجمدات`,`أخرى`). **الأفضل ابعت القياسي الإنجليزي.**

### `order.status` (كامل)
`pending` → `accepted` → `preparing` → `ready_for_pickup` → `assigned` → `picked_up` → `on_the_way` → `arrived` → `delivered`
\+ `rejected` , `cancelled` , `unassigned`

### `driver_order` sub-status (داخل التوصيل)
`heading_to_vendor` , `at_vendor` , `picked_up` , `on_the_way` , `arrived` , `delivered`

### `payment_method` / `payment_status`
`cash` | `card` | `wallet`  /  `pending` | `paid` | `failed`

### `notification.type`
`order_placed` (تاجر) · `order_accepted` / `order_rejected` (عميل) · `order_ready` (مشرف) ·
`order_assigned` (دليفري) · `order_on_the_way` (**عميل — «اتحرك وجاري التوصيل»**) ·
`order_delivered` (**عميل — + الرسيت**) · `change_request_submitted` (أدمن + إيميل) ·
`change_request_approved` / `change_request_rejected` (تاجر) · `vendor_new_order` (تاجر realtime) ·
`dispatch_needs_assignment` (مشرف realtime) · `driver_new_assignment` (دليفري realtime)

---

## 12. الإشعارات — مين ياخد إيه

| الحدث | العميل | التاجر | المشرف | الدليفري | الأدمن |
|---|---|---|---|---|---|
| طلب جديد اتعمل | «تم استلام طلبك» | **realtime + push** | | | |
| التاجر قبل | «تم قبول طلبك» | | | | |
| التاجر رفض | «اعتذر التاجر: <سبب>» | | | | |
| جاهز للاستلام | | | **realtime — محتاج تعيين** | | |
| تعيين دليفري | | | | **realtime + push** | |
| الدليفري استلم / اتحرك | **push — «طلبك اتحرك وجاري التوصيل»** + تتبّع | | | | |
| تم التسليم | **push + الرسيت (10.8)** | يظهر مكتمل | يظهر مكتمل | يظهر مكتمل | |
| التاجر عدّل حاجة حسّاسة | | «تم إرسال التعديل للمراجعة» | | | **لوحة + إيميل** |
| الأدمن وافق/رفض التعديل | | «تمت الموافقة» / «مرفوض: <سبب>» | | | |

كل الإشعارات كمان بتتسجّل في `/notifications` بالـ `type` المناسب.
تسجيل جهاز الـ push: `POST /devices { token, platform }` لكل الأدوار.

---

## 13. اللغة (Localization)

كل request فيه `LANG: ar|en`. المطلوب (اتفقوا على واحد):
- **(الأفضل)** ترجع الحقول النصية مترجمة حسب `LANG`: `name`, `product_name`, `description`, `option.name`,
  `category_label`, `offer.title`, `error.message`, `working_hours_text`, `notification.title/body`.
- أو ترجع لكل لغة: `{ "name": { "ar":"...", "en":"..." } }` (والفرونت يتعدّل).

## 14. رفع الصور

`multipart/form-data`، field `image` (أو `images` للمتعدد)، الرد `{ "url": "https://..." }`.
حدود مقترحة: 5MB، `jpg/png/webp`، السيرفر يعمل resize + CDN.
صور المنتج/اللوجو من التاجر: تتحفظ لكن **تظهر بعد موافقة الأدمن** (change request).

---

## 15. حاجات مهمة سهل تُنسى (Checklist)

- [ ] **موافقة الأدمن على التجّار** قبل ظهورهم (`vendor.status`).
- [ ] **موافقة الأدمن على تغييرات التجّار الحسّاسة** (Change Requests) + **إيميل للأدمن** بكل طلب.
- [ ] **approval-rules قابلة للضبط**: أنهي تغييرات فورية وأنهي محتاجة موافقة.
- [ ] **حسابات مشرفين (dispatcher)** تستقبل الطلبات الجاهزة وتوزّعها.
- [ ] **rotation للدليفري** («اللي عليه الدور») — auto-assign round-robin + تعيين/إعادة تعيين يدوي + مهلة رفض.
- [ ] **حسابات دليفري** + حالة online/offline + ping موقع + قبول/رفض تعيين.
- [ ] **إشعار العميل «اتحرك وجاري التوصيل»** عند `picked_up`/`on_the_way`.
- [ ] **إشعار العميل عند التسليم + الرسيت** (`Receipt` — 10.8، اختياري PDF/إيميل).
- [ ] تتبّع مباشر للطلب (`driver.location` + socket) أثناء `on_the_way`.
- [ ] **`delivery_fee` و `min_order` من التاجر** — يتشال الرقم `15` الثابت من الفرونت.
- [ ] السلة **متعددة التجّار** — تقسيم الرسوم والـ subtotal لكل تاجر.
- [ ] **`is_open` + مواعيد العمل + `stock=0`** يمنعوا الطلب برسالة واضحة.
- [ ] **`stock` / `is_available`** على مستوى المنتج **و** الـ option، وتقليلها عند القبول.
- [ ] **`option.price` absolute** (مش زيادة) — الباك اند يرجّع `additional_price` كمان مؤقتاً.
- [ ] **العروض** تحسب `discount.price_after` جوّه المنتج.
- [ ] **تعدد أكونتات التاجر** (`vendor_owner` + `vendor_staff`) وربطهم بـ `vendor_id`.
- [ ] **تحقّق الملكية** في كل `/vendor/*` و `/driver/*`.
- [ ] **التقييمات** بعد الطلب (`rating`, `reviews_count`).
- [ ] **البحث** (هوم + داخل التاجر) + **Pagination** لكل القوائم.
- [ ] **Push**: `POST /devices`؛ إشعارات لكل دور حسب جدول القسم 12.
- [ ] **soft delete** + **timezone Africa/Cairo** + **rate-limit على send-otp**.
- [ ] **`most-requested`** — الأدمن يختارها أو تتحسب من الطلبات.
- [ ] الكاتيجوريز والبانرات يديرها الأدمن.
- [ ] الفرونت يعرض المنتج disabled لما `stock=0` أو `is_available=false`.
- [ ] سجل `status_history` لكل طلب (مين غيّر الحالة وإمتى).
- [ ] إلغاء الطلب من العميل مسموح **قبل `accepted`** بس.

---

## 16. الحالة الحالية للفرونت + خطوات التوصيل

**شغّال على mock:** المنتجات/التجّار في `lib/features/vendor/data/datasources/mock/*` (هتتشال).
الأحجام مولّدة تلقائياً في `mock_vendor_products.dart` (بلوك `_withDemoOptions` — معلّم، للحذف).
السلة/المفضلة/العناوين/البروفايل: `SharedPreferences`. Auth: stub (أي كود يعدّي).

**خطوات التوصيل:**
1. `core/api/endpoints.dart`: `baseUrl` + كل المسارات الجديدة.
2. `auth/presentation/cubit/auth_cubit.dart`: استبدال البلوكين `// STUB` بـ `/auth/send-otp` + `/auth/verify-otp` + تخزين `token`.
3. `home/data/datasources/home_remote_data_source.dart`: يتظبط على `/vendors?type=` + datasource جديد للمنتجات.
4. `vendor/data/models/vendor_model.dart`: كتابة `fromJson` (أسماء 10.1).
5. `product/data/datasources/product_local_data_source.dart` → `ProductRemoteDataSource` → `/vendors/{id}/products`.
6. `ProductOptionModel`: التحويل من `additional_price` لـ `price` (absolute).
7. `cart` → `data/` + `POST /orders` + قراءة `delivery_fee`/`min_order` من الـ vendor + شاشة تتبّع الطلب (status + خريطة الدليفري).
8. `orders` → ربطها بـ `/orders` + `/orders/{id}` + `/orders/{id}/receipt`.
9. `notifications` → `/notifications` + استقبال push (`POST /devices` عند فتح التطبيق).
10. `addresses` / `profile` / `favorites` → `data/` layer بدل التخزين المحلي.
11. حذف مجلد `mock/` + بلوك `_withDemoOptions`.

---

## 17. ملخص تنفيذي

ابنِ **REST API** (JSON، مظروف `{data}`، أخطاء `{success,message,timestamp}` بـ status غير 2xx، يحترم `LANG` و `Authorization: Bearer`)
\+ **5 لوحات/واجهات**: تطبيق العميل (موجود) · لوحة التاجر · لوحة المشرف (Dispatch) · تطبيق الدليفري · لوحة الأدمن.

**Customer API**: OTP auth (يرجّع token) · vendors · products (بـ `options`/`stock`/`discount`) · categories · most-requested ·
offers · orders (create+list+detail+**receipt**+cancel) · `/orders/quick` multipart · addresses · profile+avatar · favorites · notifications · reviews · `/devices`.

**Vendor Dashboard** (`/vendor/*`): login + staff · إدارة المتجر (الاسم، الوصف، اللوجو/الغلاف، التليفون، **مواعيد العمل**،
فتح/قفل، الموقع، رسوم التوصيل، الحد الأدنى) · **CRUD منتجات** (اسم، وصف، **رفع صورة**، **سعر يتعدّل أي وقت**،
**كمية متوفرة**، **toggle أحجام/أطعمة بسعر لكل واحد**) · **عروض** · إدارة الطلبات (قبول/رفض/تجهيز) ·
**كل تغيير حسّاس = Change Request للأدمن**.

**Dispatch Dashboard** (`/dispatch/*`): طابور الطلبات الجاهزة · قايمة الدليفري وحالتهم · **دور التوصيل (rotation)** ·
تعيين/تعيين تلقائي/إعادة تعيين · متابعة realtime.

**Driver App** (`/driver/*`): login · online/offline · ping موقع · قبول/رفض تعيين · تحديث الحالة
(`picked_up`→`on_the_way`→`delivered`) — كل تغيير يبعت **إشعار للعميل**، والتسليم يبعت **الرسيت**.

**Admin** (`/admin/*`): **موافقة/رفض تغييرات التجّار (+ إيميل)** · موافقة التجّار · حسابات الدليفري والمشرفين ·
الكاتيجوريز والبانرات · تقارير.

النماذج بالتفصيل في القسم 10، الـ enums في 11، الإشعارات في 12، النقاط الحرجة في 15.
