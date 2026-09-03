# Quesna Go — Auth API (تسجيل الدخول وإنشاء الحساب)

باك اند جاهز لتطبيق Quesna Go يغطي:

1. **إنشاء حساب** — الاسم + رقم موبايل مصري (`01065465118` أو `1065465118` الاثنان مقبولان) + اختيار القرية من قائمة (30 قرية).
2. الضغط على الزر → السيرفر يبعت **كود OTP من 6 أرقام** → التطبيق يفتح شاشة الـ OTP.
3. **تسجيل الدخول** — رقم الموبايل فقط → الضغط على الزر → شاشة الـ OTP.
4. **تأكيد الـ OTP** → السيرفر يرجّع **token** يخزّنه التطبيق ويستخدمه في باقي الطلبات.

التقنيات: **Node.js + Express + PostgreSQL**. من غير أي تعقيد.

---

## المتطلبات (ثبّتها مرة واحدة)

| الأداة | من فين | ليه |
|--------|--------|-----|
| **Node.js** (نسخة LTS 20 أو أحدث) | <https://nodejs.org> | تشغيل السيرفر |
| **محرر أكواد** (VS Code) | <https://code.visualstudio.com> | تعديل الملفات + تجربة الطلبات |
| **قاعدة بيانات PostgreSQL** | اختر طريقة من تحت 👇 | تخزين المستخدمين والأكواد |

### أسهل طريقة لقاعدة البيانات: Neon (مجاني، بدون تثبيت)

1. ادخل <https://neon.tech> واعمل حساب.
2. اضغط **Create Project** → اختار الاسم والمنطقة.
3. من صفحة المشروع انسخ **Connection String** (شكله:
   `postgresql://user:pass@ep-xxxx.neon.tech/neondb?sslmode=require`).
4. هتحطه في ملف `.env` في الخطوة الجاية.

> بدائل مماثلة: **Supabase** أو تثبيت PostgreSQL على جهازك من <https://www.postgresql.org/download/windows/>.

---

## التشغيل خطوة بخطوة

كل الأوامر دي تكتبها في الترمينال جوّه فولدر المشروع (`delivery-auth-api`):

```bash
# 1) نزّل مكتبات المشروع
npm install

# 2) اعمل نسخة من ملف الإعدادات وسمّها .env
#    (على ويندوز: انسخ الملف .env.example يدويًا وغيّر اسمه إلى .env)
copy .env.example .env

# 3) افتح .env وعدّل سطرين:
#    DATABASE_URL = رابط قاعدة البيانات اللي نسخته من Neon
#    JWT_SECRET   = أي نص عشوائي طويل (اكتب حروف وأرقام كتير)

# 4) أنشئ الجداول وادخل الـ 30 قرية
npm run db:setup

# 5) شغّل السيرفر
npm run dev
```

لو ظهر:

```
✅ الـ API شغّال على: http://localhost:4000
```

يبقى تمام. سيبه شغّال في الترمينال ده.

---

## تجربة الـ API

افتح ملف [`requests.http`](./requests.http) في VS Code بعد تثبيت امتداد **REST Client**،
واضغط "Send Request" فوق كل طلب. أو استخدم **Postman**.

### 1) قائمة القرى (للـ dropdown)

```
GET http://localhost:4000/api/villages
```

```json
{ "success": true, "count": 30, "villages": [ { "id": 1, "name": "كفر داود", "governorate": "المنوفية" }, ... ] }
```

### 2) إنشاء حساب

```
POST http://localhost:4000/api/auth/register
Content-Type: application/json

{ "name": "أحمد محمد", "phone": "01065465118", "village_id": 1 }
```

الرد:

```json
{ "success": true, "message": "تم إرسال كود التحقق", "phone": "+201065465118", "next": "otp", "dev_otp": "483920" }
```

> `dev_otp` بيظهر فقط وأنت في وضع التطوير (`NODE_ENV=development`) عشان تجرّب من غير SMS.
> الكود كمان بيتطبع في ترمينال السيرفر.

### 3) تأكيد الـ OTP

```
POST http://localhost:4000/api/auth/verify-otp
Content-Type: application/json

{ "phone": "01065465118", "code": "483920" }
```

الرد عند النجاح:

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": { "id": "...", "name": "أحمد محمد", "phone": "+201065465118", "village_id": 1, "status": "active", "is_new": true }
}
```

### 4) تسجيل الدخول

```
POST http://localhost:4000/api/auth/login
Content-Type: application/json

{ "phone": "1065465118" }
```

ثم نفس طلب **verify-otp** بالكود الجديد.

### 5) طلب محمي (اختبار التوكن)

```
GET http://localhost:4000/api/auth/me
Authorization: Bearer <التوكن اللي رجع من verify-otp>
```

---

## جدول كل المسارات (Endpoints)

| الطريقة | المسار | الجسم (body) | الوظيفة |
|--------|--------|--------------|---------|
| `GET`   | `/api/villages` | — | قائمة القرى للـ dropdown |
| `POST`  | `/api/auth/register` | `name, phone, village_id` + `preferred_language` اختياري (`ar`/`en`) | إنشاء حساب + إرسال OTP |
| `POST`  | `/api/auth/login` | `phone` | إرسال OTP للدخول |
| `POST`  | `/api/auth/verify-otp` | `phone, code` | تأكيد الكود + إرجاع `token` + البروفايل |
| `POST`  | `/api/auth/resend-otp` | `phone` | إعادة إرسال الكود |
| `GET`   | `/api/auth/me` | — (هيدر Authorization) | البروفايل كامل (الاسم، الصورة، القرية، `created_at` ...) |
| `PATCH` | `/api/auth/me` | أي من: `name, avatar_url, email, birth_date, gender, village_id, preferred_language` | تعديل البروفايل |

الجسم يُقبل كـ **form-data** أو **JSON**.

**الأخطاء:** كل رد خطأ فيه `error_code` ثابت (زي `INVALID_PHONE`) + `error` نص عربي.
التطبيق العربي/الإنجليزي يترجم `error_code` عنده. القائمة الكاملة في
[`ERROR_CODES.md`](./ERROR_CODES.md).

**اللغة:** `preferred_language` (`ar`/`en`) بتتخزن في البروفايل وبتترجع في `user`،
وتقدر تغيّرها بـ `PATCH /api/auth/me`.

---

## كيف يربطه مبرمج الموبايل / الفرونت

- كل زرار في التطبيق = **طلب HTTP** واحد للـ API.
- شاشة "إنشاء حساب": فيها 3 حقول (اسم، تليفون، قائمة قرى من `GET /api/villages`).
  عند الضغط على الزر → استدعِ `POST /api/auth/register`.
- لو الرد `success: true` و `next: "otp"` → افتح **شاشة الـ OTP** (6 خانات).
- شاشة الـ OTP: عند الضغط على تأكيد → استدعِ `POST /api/auth/verify-otp`.
- خزّن `token` في مكان آمن (SecureStorage / Keychain / SharedPreferences).
- في أي طلب بعد كده ابعت الهيدر: `Authorization: Bearer <token>`.
- شاشة "تسجيل الدخول": حقل تليفون واحد → `POST /api/auth/login` → شاشة OTP → `verify-otp`.

مثال بـ JavaScript (fetch):

```js
const API = 'http://localhost:4000';

async function register(name, phone, villageId) {
  const res = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, village_id: villageId }),
  });
  return res.json(); // { success, next: 'otp', phone, ... }
}

async function verifyOtp(phone, code) {
  const res = await fetch(`${API}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const data = await res.json();
  if (data.success) localStorage.setItem('token', data.token);
  return data;
}
```

---

## قبل النشر للجمهور (Production)

1. **إرسال SMS حقيقي:** افتح [`src/otp.js`](./src/otp.js) ودالة `deliverOtp` وضع فيها
   نداء مزوّد رسائل مصري مثل **SMSMisr** أو **Twilio** أو **Vonage**.
2. في ملف `.env` غيّر `NODE_ENV=production` — ساعتها الكود مش هيرجع في الرد (`dev_otp`).
3. اجعل `JWT_SECRET` نصًّا عشوائيًا طويلًا وسريًّا (لا ترفعه على GitHub — ملف `.env` متجاهَل في `.gitignore`).
4. انشر السيرفر على خدمة زي **Railway** أو **Render** أو **Fly.io** (كلها تدعم Node + Postgres).
5. فعّل HTTPS دائمًا، وقيّد `cors` على دومين تطبيقك بدل السماح للجميع.

---

## هيكل الملفات

```
delivery-auth-api/
├─ package.json          # اسم المشروع والمكتبات والأوامر
├─ .env.example          # نموذج الإعدادات (انسخه إلى .env)
├─ db.sql                # إنشاء الجداول + إدخال 30 قرية
├─ requests.http         # طلبات جاهزة للتجربة
├─ scripts/
│  └─ setup-db.js        # يشغّل db.sql على قاعدة بياناتك
└─ src/
   ├─ server.js          # نقطة البداية: يشغّل Express ويربط المسارات
   ├─ db.js              # اتصال قاعدة البيانات
   ├─ phone.js           # تطبيع رقم الموبايل المصري والتحقق منه
   ├─ otp.js             # توليد/تخزين/إرسال كود الـ OTP
   ├─ auth.js            # إنشاء توكن JWT + حماية المسارات
   ├─ routes.auth.js     # /api/auth/* (register, login, verify-otp, ...)
   └─ routes.villages.js # /api/villages
```

## جداول قاعدة البيانات المستخدمة هنا

- `villages` — القرى الـ 30.
- `users` — الحسابات (متوافق مع `schema.sql` الكبير لو كنت شغّلته).
- `auth_tokens` — أكواد الـ OTP مشفّرة، مع مدة صلاحية وعدد محاولات.

> ملف `db.sql` آمن للتشغيل أكثر من مرة، ولو كنت شغّلت `schema.sql` الكبير قبل كده
> فهو بس هيضيف جدول `villages` وعمود `village_id`.
