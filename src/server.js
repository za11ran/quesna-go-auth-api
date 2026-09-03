require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());                                  // يسمح للفرونت/الموبايل بالاتصال
app.use(express.json());                           // يقرأ body بصيغة JSON
app.use(express.urlencoded({ extended: true }));   // يقرأ body بصيغة form (x-www-form-urlencoded)

// فحص سريع أن السيرفر شغّال
app.get('/', (req, res) =>
  res.json({ ok: true, service: 'delivery-auth-api', time: new Date().toISOString() })
);

// المسارات
app.use('/api/villages', require('./routes.villages'));
app.use('/api/auth', require('./routes.auth'));

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

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`\n✅ الـ API شغّال على: http://localhost:${port}`);
  console.log(`   وضع التشغيل: ${process.env.NODE_ENV || 'development'}\n`);
});
