// يمسح كل بيانات التشغيل ويعيد بذر البيانات التجريبية من db.sql.
// الاستخدام:  npm run reset-demo   (مفيد لإعادة العرض التوضيحي لحالة نظيفة)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const needSsl = /neon\.tech|supabase|render\.com|railway/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needSsl ? { rejectUnauthorized: false } : false,
});

(async () => {
  if (!process.env.DATABASE_URL) { console.error('❌ لا يوجد DATABASE_URL'); process.exit(1); }
  const seedKeepEmails = ['admin@quesnago.com', 'dispatch1@quesnago.com', 'driver1@quesnago.com'];
  try {
    await pool.query('BEGIN');
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM quick_orders');
    await pool.query('DELETE FROM orders');           // cascade -> order_items / order_vendors / order_status_history / delivery_offers
    await pool.query('DELETE FROM change_requests');
    await pool.query('DELETE FROM banners');
    await pool.query('DELETE FROM categories');
    await pool.query('DELETE FROM vendors');           // cascade -> products / product_options / offers / vendor staff_users
    await pool.query(
      `DELETE FROM staff_users WHERE email IS NULL OR email <> ALL($1::text[])`,
      [seedKeepEmails]
    );
    await pool.query('DELETE FROM drivers');
    await pool.query('COMMIT');

    const sql = fs.readFileSync(path.join(__dirname, '..', 'db.sql'), 'utf8');
    await pool.query(sql);

    const v = await pool.query('SELECT count(*)::int n FROM vendors');
    const p = await pool.query('SELECT count(*)::int n FROM products');
    const s = await pool.query('SELECT count(*)::int n FROM staff_users');
    console.log(`✅ رجعت البيانات التجريبية — تجّار: ${v.rows[0].n} · منتجات: ${p.rows[0].n} · حسابات لوحة: ${s.rows[0].n}`);
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
