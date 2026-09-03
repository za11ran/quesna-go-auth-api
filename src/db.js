// اتصال واحد مشترك بقاعدة البيانات
const { Pool } = require('pg');

const needSsl = /neon\.tech|supabase|render\.com|railway/.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => console.error('خطأ في اتصال قاعدة البيانات:', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
