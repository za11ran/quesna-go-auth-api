// يغيّر كلمة سر حساب لوحة تحكم (staff_users) بالإيميل أو رقم الموبايل.
// الاستخدام:  node scripts/set-password.js admin@quesnago.com كلمة_السر_الجديدة
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

(async () => {
  const [idArg, password] = process.argv.slice(2);
  if (!idArg || !password) {
    console.error('الاستخدام: node scripts/set-password.js <email أو phone> <كلمة السر الجديدة>');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('❌ لم تضبط DATABASE_URL في ملف .env');
    process.exit(1);
  }

  const needSsl = /neon\.tech|supabase|render\.com|railway/.test(process.env.DATABASE_URL);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: needSsl ? { rejectUnauthorized: false } : false,
  });

  try {
    const hash = await bcrypt.hash(password, 10);
    const isEmail = idArg.includes('@');
    const { rowCount, rows } = await pool.query(
      `UPDATE staff_users SET password_hash = $1, updated_at = now()
        WHERE ${isEmail ? 'email' : 'phone'} = $2
        RETURNING id, name, role, email, phone`,
      [hash, idArg]
    );
    if (rowCount === 0) {
      console.error(`❌ مفيش حساب بـ ${isEmail ? 'إيميل' : 'رقم'}: ${idArg}`);
      process.exit(1);
    }
    console.log(`✅ اتغيّرت كلمة السر لحساب: ${rows[0].name} (${rows[0].role})`);
  } catch (err) {
    console.error('❌ فشل:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
