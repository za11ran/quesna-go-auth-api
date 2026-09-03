// إنشاء إشعار (عميل أو موظف لوحة) + بثّ لحظي عبر Socket.IO.
const db = require('./db');
const { emitTo } = require('./realtime');

async function notify(userId, { title, body = '', type, orderId = null, data = null, recipientType = 'customer' }) {
  if (!userId) return;
  try {
    await db.query(
      `INSERT INTO notifications (user_id, recipient_type, title, body, type, order_id, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, recipientType, title, body, type, orderId, data ? JSON.stringify(data) : null]
    );
    const room = `${recipientType === 'staff' ? 'staff' : 'customer'}:${userId}`;
    emitTo(room, 'notification:new', { title, body, type, order_id: orderId, data, created_at: new Date().toISOString() });
    // TODO: push للأجهزة في user_devices عند تفعيل مزوّد الـ push
  } catch (e) {
    console.error('[notify error]', e.message);
  }
}

module.exports = { notify };
