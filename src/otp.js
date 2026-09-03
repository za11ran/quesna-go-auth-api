// توليد وتخزين والتحقق من كود OTP المكوّن من 6 أرقام
const { randomInt } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

function generateOtp() {
  return String(randomInt(100000, 1000000)); // 6 أرقام دائمًا
}

// ينشئ كودًا جديدًا، يلغي القديم، يخزّن نسخة مشفّرة، ويرجع الكود الأصلي
async function issueOtp(userId, purpose) {
  const code = generateOtp();
  const ttl = Number(process.env.OTP_TTL_MINUTES || 10);

  await db.query(
    `UPDATE auth_tokens SET consumed_at = now()
       WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose]
  );

  const hash = await bcrypt.hash(code, 10);
  await db.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [userId, purpose, hash, ttl]
  );

  return code;
}

// في التطوير: نطبع الكود في الترمينال. عند النشر: ابعت SMS حقيقي هنا.
async function deliverOtp(phone, code, channel) {
  if (process.env.NODE_ENV === 'production') {
    // TODO: استبدل هذا بنداء مزوّد SMS (SMSMisr / Twilio / Vonage ...)
    console.log(`[SMS] إرسال كود ${channel} إلى ${phone}`);
  } else {
    console.log(`\n📲 كود ${channel} للرقم ${phone} هو: ${code}\n`);
  }
}

module.exports = { generateOtp, issueOtp, deliverOtp };
