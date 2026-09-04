# Quesna Go — دليل ربط تطبيق Flutter بالـ API

كل تفاصيل الطلبات والردود في [`openapi.yaml`](./openapi.yaml) (استوردها في Apidog/Postman).
الأكواد الثابتة للأخطاء في [`ERROR_CODES.md`](./ERROR_CODES.md).

---

## 1) الأساسيات

| | |
|---|---|
| **Base URL (إنتاج)** | `https://api.quesnago.com` |
| **Base URL (تطوير محلي)** | `http://localhost:4000` |
| **التوكن** | بعد `verify-otp` خزّن `token` وابعته في كل طلب محمي: `Authorization: Bearer <token>` |
| **اللغة** | هيدر `LANG: ar` أو `LANG: en` على مسارات الكتالوج/الطلبات/الإشعارات. عند التسجيل: `?lang=ar|en` |
| **صيغة body** | Auth = form-data · باقي المسارات = JSON |
| **الصور** | المسارات بترجّع مسار نسبي مثل `/uploads/x.webp` — كوّن الرابط: `https://api.quesnago.com` + المسار |

### شكل الخطأ (موحّد)
```json
{ "success": false, "error_code": "OUT_OF_STOCK", "message": "الكمية المطلوبة غير متوفرة", "timestamp": "..." }
```
التطبيق بيترجم `error_code` بنفسه؛ `message`/`error` نص عربي للتشخيص فقط.

---

## 2) تدفّق الدخول (OTP)

1. `POST /api/auth/register?lang=ar` — form-data: `name`, `phone`, `village_id` → بيرجّع `{ success, phone, next:"otp" }`
   (في التطوير كمان `dev_otp`).
   - رقم مصري: بيقبل `01065465118` أو `1065465118` أو `+201065465118`.
2. أو `POST /api/auth/login` — form-data: `phone`.
3. `POST /api/auth/verify-otp` — form-data: `phone`, `code` → بيرجّع `{ token, user }`.
   `user` فيه: `id, name, phone, email, avatar_url, birth_date, gender, lang, village_id, village_name, status, created_at, is_new`.
4. `POST /api/auth/resend-otp` — form-data: `phone`.

> **مؤقت لحد ما نشترك في مزوّد SMS:** الكود الثابت **`123456`** بيشتغل لأي حساب في `verify-otp`،
> وكمان بيرجع في رد `register`/`login`/`resend` كـ `dev_otp`. (مضبوط بمتغيّر البيئة `DEV_LOGIN_OTP` على السيرفر — هيتشال بعد ربط الـ SMS.)
5. `GET /api/auth/me` · `PATCH /api/auth/me` (form-data، كل الحقول اختيارية: `name, avatar_url, email, birth_date, gender, village_id, lang`).
6. قائمة القرى لقائمة التسجيل: `GET /api/villages`.

---

## 3) الكتالوج (بدون توكن)

| المسار | الوصف |
|---|---|
| `GET /api/home/categories` | أقسام الصفحة الرئيسية |
| `GET /api/home/banners` | سلايدر/بانرات العروض |
| `GET /api/vendors?type=&search=&page=&per_page=` | المتاجر (المعتمدة والمفعّلة فقط) |
| `GET /api/vendors/:id` | تفاصيل متجر |
| `GET /api/vendors/:id/products?category=&search=&page=` | منتجات متجر |
| `GET /api/vendors/:id/products/:productId` | تفاصيل منتج + الأحجام/الأنواع (`options`) |
| `GET /api/products/most-requested?limit=` | الأكثر طلبًا (الأدمن بيختارهم) |
| `GET /api/offers` | كل العروض الفعّالة |

- القوائم بترجّع `{ data: [...], meta: { page, per_page, total, last_page } }`.
- المنتج فيه `discount` (خصم محسوب: `type`, `value`, `price_after`) و `options[]` لكل حجم/نوع
  (كل option فيه `price` و `additional_price` و `stock` و `is_available`).
- `stock: null` معناها كمية غير محدودة.

---

## 4) الطلبات (بتوكن)

### إنشاء طلب — `POST /api/orders`
```json
{
  "payment_method": "cash",
  "address_id": 4,
  "notes": "الدور الثالث",
  "items": [
    { "product_id": 101, "quantity": 2, "option_id": 5, "note": "بدون بصل" },
    { "product_id": 210, "quantity": 1 }
  ]
}
```
- بدل `address_id` تقدر تبعت `address_text` (+ اختياري `address_lat`/`address_lng`).
- السلة ممكن تجمع منتجات من أكتر من متجر؛ الرد بيقسّم المجاميع لكل متجر في `vendors[]`.
- أخطاء متوقّعة: `EMPTY_CART`, `PRODUCT_NOT_FOUND`, `VENDOR_CLOSED`, `PRODUCT_UNAVAILABLE`,
  `OPTION_UNAVAILABLE`, `OUT_OF_STOCK`, `MIN_ORDER_NOT_MET`, `ADDRESS_REQUIRED`.

| المسار | الوصف |
|---|---|
| `GET /api/orders?page=&per_page=` | طلباتي |
| `GET /api/orders/:id` | تفاصيل طلب (فيه `driver` + `driver.location` لو اتخصّص دليفري) |
| `GET /api/orders/:id/receipt` | الرسيت |
| `POST /api/orders/:id/cancel` | إلغاء — **بس طول ما الحالة `pending`** (قبل قبول المتجر) |
| `POST /api/orders/quick` | طلب سريع: multipart، `details` + `price` + `images` (حتى 5) |

### حالات الطلب (`status`)
```
pending → accepted → preparing → ready_for_pickup → assigned
        → picked_up → on_the_way → arrived → delivered
(أو) cancelled
```
`serializeOrder` بيرجّع كمان `timestamps` و `status_history` و `driver_sub_status`.

---

## 5) الحساب: عناوين / إشعارات / أجهزة (بتوكن)

| المسار | الوصف |
|---|---|
| `GET /api/addresses` · `POST /api/addresses` · `DELETE /api/addresses/:id` | عناوين العميل (`is_default`) |
| `GET /api/notifications?page=` | الإشعارات + `meta.unread` |
| `POST /api/notifications/:id/read` | تعليم مقروء |
| `POST /api/devices` | تسجيل توكن Push (`token`, `platform: android\|ios`) — التخزين جاهز؛ الإرسال الفعلي (FCM) لسه محتاج مفتاح |

---

## 6) اللحظي (Socket.IO) — اختياري لكن مفيد

- الاتصال: `https://api.quesnago.com` — path `/socket.io`، والتوكن في `auth`:
  ```dart
  IO.io('https://api.quesnago.com', <String, dynamic>{
    'transports': ['websocket'],
    'auth': {'token': token},
  });
  ```
- أحداث تهمّ العميل:
  - `order:update` → `{ order_id, status }` — كل تغيّر في حالة الطلب.
  - `notification:new` → إشعار جديد (نفس شكل عنصر `/api/notifications`).
- كفاية تعمل refetch للطلب/الإشعارات عند وصول الحدث.

---

## 7) مثال Dart سريع

```dart
const base = 'https://api.quesnago.com';

Future<Map<String, dynamic>> verifyOtp(String phone, String code) async {
  final r = await http.post(Uri.parse('$base/api/auth/verify-otp'),
      body: {'phone': phone, 'code': code}); // form-data
  final j = jsonDecode(r.body);
  if (j['success'] != true) throw ApiException(j['error_code'], j['message']);
  return j; // { token, user }
}

Future<List> vendors({String? type}) async {
  final uri = Uri.parse('$base/api/vendors').replace(queryParameters: {
    if (type != null) 'type': type,
  });
  final r = await http.get(uri, headers: {'LANG': 'ar'});
  return jsonDecode(r.body)['data'] as List;
}

Future<Map<String, dynamic>> createOrder(String token, Map body) async {
  final r = await http.post(Uri.parse('$base/api/orders'),
      headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json', 'LANG': 'ar'},
      body: jsonEncode(body));
  final j = jsonDecode(r.body);
  if (r.statusCode >= 400) throw ApiException(j['error_code'], j['message']);
  return j; // الطلب المُسلسَل
}
```
