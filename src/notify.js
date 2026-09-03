// إنشاء إشعار داخل التطبيق (+ لاحقًا push عبر user_devices).
const db = require('./db');

async function notify(userId, { title, body = '', type, orderId = null, data = null }) {
  if (!userId) return;
  try {
    await db.query(
      `INSERT INTO notifications (user_id, title, body, type, order_id, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, title, body, type, orderId, data ? JSON.stringify(data) : null]
    );
    // TODO: إرسال push للأجهزة في user_devices عند تفعيل مزوّد الـ push
  } catch (e) {
    console.error('[notify error]', e.message);
  }
}

module.exports = { notify };
