// إنشاء إشعار (عميل أو موظف لوحة) + بثّ لحظي عبر Socket.IO.
// title/body ممكن يكونوا نص عادي أو كائن ثنائي اللغة { ar, en }.
// لو كائن والمستلم عميل → نختار حسب لغة العميل المحفوظة (users.preferred_language).
const db = require('./db');
const { emitTo } = require('./realtime');
const { t } = require('./lang');
const { sendPush } = require('./push');

async function notify(userId, { title, body = '', type, orderId = null, data = null, recipientType = 'customer' }) {
  if (!userId) return;
  try {
    const bilingual = (v) => v && typeof v === 'object';
    let lang = 'ar';
    if ((bilingual(title) || bilingual(body)) && recipientType === 'customer') {
      const r = await db.query(`SELECT preferred_language FROM users WHERE id = $1`, [userId]);
      if (r.rows[0] && r.rows[0].preferred_language) lang = r.rows[0].preferred_language;
    }
    const finalTitle = t(title, lang);
    const finalBody = t(body, lang);

    await db.query(
      `INSERT INTO notifications (user_id, recipient_type, title, body, type, order_id, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, recipientType, finalTitle, finalBody, type, orderId, data ? JSON.stringify(data) : null]
    );
    const room = `${recipientType === 'staff' ? 'staff' : 'customer'}:${userId}`;
    emitTo(room, 'notification:new', {
      title: finalTitle, body: finalBody, type, order_id: orderId, data,
      created_at: new Date().toISOString(),
    });
    // push فعلي (FCM) — بس للعملاء (user_devices مربوطة بـ users فقط، مش staff_users).
    // صامت تمامًا لو مفيش مفتاح Firebase مضبوط أو مفيش جهاز مسجّل.
    if (recipientType === 'customer') {
      sendPush(userId, { title: finalTitle, body: finalBody, data: { type, order_id: orderId, ...(data || {}) } });
    }
  } catch (e) {
    console.error('[notify error]', e.message);
  }
}

module.exports = { notify };
