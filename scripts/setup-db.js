// ينشئ الجداول ويدخل القرى بتشغيل ملف db.sql
// الاستخدام:  npm run db:setup
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('❌ لم تضبط DATABASE_URL في ملف .env');
    process.exit(1);
  }

  const needSsl = /neon\.tech|supabase|render\.com|railway/.test(process.env.DATABASE_URL);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: needSsl ? { rejectUnauthorized: false } : false,
  });

  const sql = fs.readFileSync(path.join(__dirname, '..', 'db.sql'), 'utf8');

  try {
    await pool.query(sql);
    const { rows } = await pool.query('SELECT count(*)::int AS c FROM villages');
    console.log(`✅ تم إعداد قاعدة البيانات. عدد القرى: ${rows[0].c}`);
  } catch (err) {
    console.error('❌ فشل الإعداد:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
