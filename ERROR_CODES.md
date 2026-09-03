# أكواد الأخطاء (error_code)

كل رد خطأ من الـ API شكله:

```json
{ "success": false, "error_code": "INVALID_PHONE", "error": "رسالة عربية للتشخيص فقط" }
```

**التطبيق (عربي/إنجليزي) يترجم `error_code` عنده** ولا يعتمد على نص `error`
(النص العربي موجود للمطوّر وقت التطوير فقط).

| error_code | HTTP | متى يحصل | نص عربي مقترح | English text |
|---|---|---|---|---|
| `NAME_REQUIRED` | 422 | الاسم فاضي أو أقل من حرفين | الاسم مطلوب | Name is required |
| `INVALID_PHONE` | 422 | رقم موبايل مصري غير صحيح | رقم الموبايل غير صحيح | Invalid phone number |
| `VILLAGE_REQUIRED` | 422 | لم تُرسل القرية | اختر القرية | Please select your village |
| `VILLAGE_NOT_FOUND` | 422 | قرية غير موجودة/غير مفعّلة | القرية غير موجودة | Village not found |
| `INVALID_AVATAR_URL` | 422 | رابط صورة غير صحيح | رابط الصورة غير صحيح | Invalid image URL |
| `INVALID_EMAIL` | 422 | صيغة إيميل غير صحيحة | الإيميل غير صحيح | Invalid email |
| `INVALID_BIRTH_DATE` | 422 | تاريخ ميلاد غير صحيح (الصيغة YYYY-MM-DD) | تاريخ الميلاد غير صحيح | Invalid birth date |
| `INVALID_GENDER` | 422 | قيمة غير `male`/`female` | اختر النوع | Invalid gender |
| `INVALID_LANGUAGE` | 422 | لغة غير `ar`/`en` | لغة غير مدعومة | Unsupported language |
| `EMAIL_TAKEN` | 409 | الإيميل مستخدم بحساب آخر | الإيميل مستخدم بالفعل | Email already in use |
| `ALREADY_REGISTERED` | 409 | الرقم مسجّل ومُفعّل | الرقم مسجّل، سجّل الدخول | Number already registered, please log in |
| `ACCOUNT_NOT_FOUND` | 404 | لا يوجد حساب بهذا الرقم (login/verify/resend) | لا يوجد حساب بهذا الرقم | No account with this number |
| `INVALID_OTP_FORMAT` | 422 | الكود ليس 6 أرقام | الكود لازم 6 أرقام | Code must be 6 digits |
| `OTP_NOT_FOUND` | 400 | لا يوجد كود فعّال، اطلب جديد | اطلب كود جديد | Request a new code |
| `OTP_EXPIRED` | 400 | انتهت صلاحية الكود | انتهت صلاحية الكود | Code expired |
| `OTP_WRONG` | 401 | كود غير صحيح (يرجع معه `attempts_left`) | الكود غير صحيح | Wrong code |
| `OTP_TOO_MANY_ATTEMPTS` | 429 | تجاوز عدد المحاولات | حاولت كتير، اطلب كود جديد | Too many attempts, request a new code |
| `RATE_LIMITED` | 429 | طلبات كتير في وقت قصير | حاول بعد شوية | Try again in a moment |
| `AUTH_REQUIRED` | 401 | مفيش توكن في الهيدر | سجّل الدخول | Please sign in |
| `AUTH_INVALID` | 401 | توكن غير صالح/منتهي | انتهت الجلسة، سجّل الدخول | Session expired, sign in again |
| `NOTHING_TO_UPDATE` | 422 | PATCH /me من غير أي حقل | مفيش تعديلات | Nothing to update |
| `USER_NOT_FOUND` | 404 | المستخدم اتحذف | الحساب غير موجود | Account not found |
| `NOT_FOUND` | 404 | مسار غير موجود | — | — |
| `SERVER_ERROR` | 500 | خطأ داخلي | حصل خطأ، حاول تاني | Something went wrong |

## مثال معالجة في Flutter

```dart
String messageFor(String code, String lang) {
  const ar = {
    'INVALID_PHONE': 'رقم الموبايل غير صحيح',
    'OTP_WRONG': 'الكود غير صحيح',
    'ACCOUNT_NOT_FOUND': 'لا يوجد حساب بهذا الرقم',
    // ... باقي الأكواد
  };
  const en = {
    'INVALID_PHONE': 'Invalid phone number',
    'OTP_WRONG': 'Wrong code',
    'ACCOUNT_NOT_FOUND': 'No account with this number',
    // ...
  };
  final map = lang == 'en' ? en : ar;
  return map[code] ?? (lang == 'en' ? 'Something went wrong' : 'حصل خطأ');
}
```

## اللغة

- **التسجيل يطلب 3 حقول بس**: `name` + `phone` + `village_id`.
- اللغة والبروفايل (الصورة، الإيميل، تاريخ الميلاد، النوع) بتتضاف بعد الدخول
  من شاشة البروفايل عبر `PATCH /api/auth/me`.
- `preferred_language` افتراضيها `ar`، وبتُرجع في `user.preferred_language` —
  استخدمها لإرسال SMS/إشعارات بلغة المستخدم لاحقًا.
- مفيش داعي تبعت اللغة في كل طلب — الترجمة مسؤولية التطبيق عبر `error_code`.
