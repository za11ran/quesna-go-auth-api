// إرسال Push فعلي عبر Firebase Cloud Messaging — لأجهزة العميل (user_devices)
// أو الدليفري (driver_devices، وضع الدليفري جوه تطبيق العميل). مفتاح الخدمة
// سرّي — مش موجود في الريبو، بيتحدد مساره بمتغيّر بيئة
// FIREBASE_SERVICE_ACCOUNT_PATH. لو مش موجود، بنتجاهل الإرسال بصمت (التخزين في
// notifications + البث اللحظي عبر Socket.IO شغّالين برضو بدونه).
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const db = require('./db');

let messaging; // undefined = لسه ما جربناش، null = جرّبنا وفشل (متغيّر بيئة مفقود/مفتاح غلط)

function getMessagingClient() {
  if (messaging !== undefined) return messaging;
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!keyPath) {
    messaging = null;
    return messaging;
  }
  try {
    const serviceAccount = require(path.resolve(keyPath));
    const app = initializeApp({ credential: cert(serviceAccount) });
    messaging = getMessaging(app);
  } catch (e) {
    console.error('[push] فشل تحميل مفتاح Firebase:', e.message);
    messaging = null;
  }
  return messaging;
}

const INVALID_TOKEN_ERRORS = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

// منطق مشترك: يجيب توكنز جهاز معيّن من جدول معيّن، يبعت، ويشيل التوكنز البايظة.
async function sendToTable({ table, idColumn, idValue, title, body, data }) {
  const client = getMessagingClient();
  if (!client) return;
  try {
    const { rows } = await db.query(`SELECT token FROM ${table} WHERE ${idColumn} = $1`, [idValue]);
    if (!rows.length) return;
    const tokens = rows.map((r) => r.token);

    const stringData = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (v !== null && v !== undefined) stringData[k] = String(v);
    }

    const res = await client.sendEachForMulticast({
      tokens,
      notification: { title: String(title || ''), body: String(body || '') },
      data: stringData,
    });

    const staleTokens = [];
    res.responses.forEach((r, i) => {
      if (!r.success && INVALID_TOKEN_ERRORS.has(r.error?.code)) staleTokens.push(tokens[i]);
    });
    if (staleTokens.length) {
      await db.query(`DELETE FROM ${table} WHERE ${idColumn} = $1 AND token = ANY($2::text[])`, [idValue, staleTokens]);
    }
  } catch (e) {
    console.error('[push] فشل الإرسال:', e.message);
  }
}

// بيبعت push لكل أجهزة عميل واحد. صامت تمامًا لو مفيش مفتاح Firebase أو مفيش
// أجهزة مسجّلة — النداء آمن يتكرر من notify() لأي إشعار.
async function sendPush(userId, { title, body, data = {} }) {
  return sendToTable({ table: 'user_devices', idColumn: 'user_id', idValue: userId, title, body, data });
}

// نفس الفكرة، بس لأجهزة الدليفري (وضع الدليفري جوه تطبيق العميل).
async function sendDriverPush(driverId, { title, body, data = {} }) {
  return sendToTable({ table: 'driver_devices', idColumn: 'driver_id', idValue: driverId, title, body, data });
}

module.exports = { sendPush, sendDriverPush };
