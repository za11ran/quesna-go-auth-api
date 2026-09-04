# نشر Quesna Go على VPS (Ubuntu 24)

السيرفر: 4GB RAM / 2 vCPU / Ubuntu 24 — كفاية للبداية.
هيشتغل عليه: Node API + Socket.IO (PM2) + PostgreSQL + **الداش بورد (React مبني)** + Nginx + HTTPS.

بعد التشغيل، من الدومين:
- `https://api.quesnago.com/` → **الداش بورد** (دخول أدمن/مشرف/تاجر/دليفري)
- `https://api.quesnago.com/api/...` → الـ API (للتطبيق والداش بورد)
- `https://api.quesnago.com/uploads/...` → الصور
- `wss://api.quesnago.com/socket.io/` → الإشعارات اللحظية

`deploy/setup-server.sh` بيبني الداش بورد تلقائيًا. للتحديث بعد أي push: `bash deploy/update.sh`.

---

## 0) قبل ما تبدأ — محتاج

- **IP السيرفر** (من لوحة الـ VPS).
- **دومين** `quesnago.com` (تقدر تدخل إعدادات الـ DNS بتاعه).
- الاتصال بالسيرفر: `ssh root@SERVER_IP` (من PowerShell على ويندوز — الـ ssh متوفر).

---

## 1) اضبط الـ DNS

عند مزوّد الدومين، في إعدادات **DNS / Zone Editor**، أضف:

| Type | Name  | Value (Points to) | TTL |
|------|-------|-------------------|-----|
| A    | `api` | `SERVER_IP`       | 5 min / Automatic |
| A    | `@`   | `SERVER_IP`       | 5 min  (اختياري — لصفحة هبوط مستقبلاً) |
| A    | `www` | `SERVER_IP`       | 5 min  (اختياري) |

انتظر 5–30 دقيقة. تأكد من ويندوز: `nslookup api.quesnago.com` لازم يرجّع الـ IP.

---

## 2) ادخل السيرفر وجيب الكود

```bash
ssh root@SERVER_IP
```

### جيب الريبو

**الأسهل** (لو الريبو Public): 
```bash
git clone https://github.com/za11ran/quesna-go-auth-api.git /opt/quesna-go-auth-api
```

**لو الريبو Private** — أضف Deploy Key:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy -N ""
cat ~/.ssh/deploy.pub
```
انسخ المفتاح → GitHub → الريبو → **Settings → Deploy keys → Add deploy key** (اسم أي حاجة، من غير write access) → Save. ثم:
```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/deploy -o IdentitiesOnly=yes" \
  git clone git@github.com:za11ran/quesna-go-auth-api.git /opt/quesna-go-auth-api
git -C /opt/quesna-go-auth-api config core.sshCommand "ssh -i ~/.ssh/deploy -o IdentitiesOnly=yes"
```

---

## 3) شغّل سكربت التجهيز

```bash
cd /opt/quesna-go-auth-api
sudo DOMAIN=api.quesnago.com bash deploy/setup-server.sh
```

بيعمل: تحديث النظام · Node 20 · PostgreSQL (بينشئ قاعدة `quesnago` + مستخدم + باسورد عشوائي) ·
Nginx reverse proxy · PM2 (تشغيل دائم) · UFW · ملف `.env` بإعدادات إنتاج.

اختبار سريع بالـ IP:
```bash
curl http://SERVER_IP/api/villages
```

---

## 4) فعّل HTTPS (بعد ما DNS يشتغل)

```bash
sudo certbot --nginx -d api.quesnago.com --agree-tos -m m.s.za11ran@gmail.com --redirect
```

التجديد تلقائي (certbot بيضيف تايمر). اختبار:
```
https://api.quesnago.com/api/villages
```

---

## 4b) صفحة الهبوط على `quesnago.com` (اختياري)

صفحة تعريفية للتطبيق + أزرار تحميل + زر «دخول التجّار» يحوّل للوحة التحكم.
الملفات في `landing/` وتُقدَّم من نفس الـ VPS.

1. **DNS** عند هوستنجر — خلّي الجذر يشاور على السيرفر:

   | Type | Name | Value |
   |------|------|-------|
   | A    | `@`   | `SERVER_IP` (بدّل `2.57.91.91` القديم) |
   | A    | `www` | `SERVER_IP` (أو CNAME `www` → `quesnago.com`) |

2. على السيرفر:
   ```bash
   cd /opt/qg && git pull && sudo bash deploy/setup-landing.sh
   ```
3. HTTPS:
   ```bash
   sudo certbot --nginx -d quesnago.com -d www.quesnago.com --agree-tos -m m.s.za11ran@gmail.com --redirect
   ```
4. تعديل الصفحة لاحقًا: عدّل `landing/index.html` → `git push` → على السيرفر `cd /opt/qg && git pull`
   (Nginx يقدّمها مباشرة، مش محتاج build). حدّث روابط App Store / Google Play في قسم `id="download"`.

---

## 4c) إشعارات النظام (Push عبر Firebase)

مفتاح Firebase سرّي — مش في الريبو، لازم ترفعه للسيرفر يدويًا (زي `.db_password`):

```bash
scp firebase-service-account.json root@SERVER_IP:/opt/quesna-go-auth-api/
```

بعد كده على السيرفر أضف السطر ده لملف `.env`:
```
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```
وأعد تشغيل الـ API: `pm2 restart quesna-api`.

(لو الملف مش موجود، السيرفر بيشتغل عادي — الإشعارات بتتسجّل في التطبيق والداش بورد
بس من غير إشعار نظام خارج التطبيق.)

---

## 5) باك أب يومي

```bash
sudo crontab -e
```
أضف السطر:
```
0 3 * * * /opt/quesna-go-auth-api/deploy/backup.sh >> /var/log/quesnago-backup.log 2>&1
```
(بياخد نسخة كل يوم 3ص، يمسح اللي أقدم من 14 يوم. انسخ `/var/backups/quesnago/` لمكان تاني دوريًا.)

---

## 6) وصّل التطبيق

- Flutter: `AuthApi.baseUrl = 'https://api.quesnago.com'`
- Apidog: بيئة جديدة `Production` = `https://api.quesnago.com`

---

## التحديث بعد أي تعديل (نعمله كتير)

أنا أعمل `git push` → إنت على السيرفر:
```bash
cd /opt/quesna-go-auth-api && bash deploy/update.sh
```
(بيعمل pull + تثبيت + migrations + إعادة تشغيل.)

---

## أوامر يومية

| | |
|--|--|
| `pm2 status` | حالة الـ API |
| `pm2 logs quesna-api` | اللوجز الحية |
| `pm2 restart quesna-api` | إعادة تشغيل |
| `sudo systemctl status nginx` | حالة Nginx |
| `sudo -u postgres psql quesnago` | دخول قاعدة البيانات |
