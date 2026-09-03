require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());                                  // يسمح للفرونت/الموبايل بالاتصال
app.use(express.json());                           // يقرأ body بصيغة JSON
app.use(express.urlencoded({ extended: true }));   // يقرأ body بصيغة form (x-www-form-urlencoded)

// الصور المرفوعة
const { UPLOADS_DIR } = require('./upload');
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', fallthrough: false }));

// فحص سريع أن السيرفر شغّال
app.get('/', (req, res) =>
  res.json({ ok: true, service: 'delivery-auth-api', time: new Date().toISOString() })
);

// المسارات
app.use('/api/villages', require('./routes.villages'));
app.use('/api/auth', require('./routes.auth'));
app.use('/api', require('./catalog'));   // vendors, products, home/categories, offers
app.use('/api', require('./orders'));    // orders, addresses, notifications, devices
app.use('/api/vendor', require('./vendor'));      // لوحة التاجر
app.use('/api/admin', require('./admin'));        // لوحة الأدمن + مراجعة Change Requests
app.use('/api/dispatch', require('./dispatch'));  // لوحة المشرف (التوزيع)
app.use('/api/driver', require('./driver'));      // تطبيق/لوحة الدليفري

// مسار غير موجود
app.use((req, res) =>
  res.status(404).json({ success: false, error_code: 'NOT_FOUND', error: 'المسار غير موجود' })
);

// معالج الأخطاء العام
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌', err);
  res.status(500).json({ success: false, error_code: 'SERVER_ERROR', error: 'خطأ في السيرفر' });
});

const http = require('http');
const server = http.createServer(app);
require('./realtime').initRealtime(server);   // Socket.IO
require('./worker').start();                  // عامل مهلة عروض التوصيل

const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`\n✅ الـ API شغّال على: http://localhost:${port}`);
  console.log(`   وضع التشغيل: ${process.env.NODE_ENV || 'development'}\n`);
});
