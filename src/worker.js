// عامل خلفي: يلغي عروض التوصيل اللي عدّت المهلة ويرجّع الطلب للطابور.
const db = require('./db');
const { emitTo } = require('./realtime');

let timer = null;

// كل طلب في معاملة (transaction) لوحده — لو حصل خطأ في نص العملية (مثلًا
// الـ INSERT في order_status_history) قبل الفيكس ده كان ممكن UPDATE orders
// يتنفّذ وبعدين يفشل قبل ما يسجّل السبب في السجل، فيبان الطلب اتشال من عند
// الدليفري "من غير سبب". دلوقتي إما كل الخطوات تنجح مع بعض أو ولا حاجة منها.
// وكمان try/catch لكل طلب لوحده عشان فشل طلب واحد ميوقفش معالجة الباقيين.
async function expireOffer({ order_id, driver_id }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE delivery_offers SET response = 'timeout', responded_at = now()
        WHERE order_id = $1 AND driver_id = $2 AND response IS NULL`,
      [order_id, driver_id]
    );
    if (upd.rowCount === 0) {
      // حد تاني (قبول/رفض الدليفري) سبقنا في نفس اللحظة — مفيش حاجة نعملها.
      await client.query('ROLLBACK');
      return false;
    }
    if (driver_id) {
      await client.query(
        `UPDATE drivers SET status = 'available', current_order_id = NULL, updated_at = now() WHERE id = $1`,
        [driver_id]
      );
    }
    await client.query(
      `UPDATE orders SET driver_id = NULL, driver_sub_status = NULL, status = 'ready_for_pickup', updated_at = now()
        WHERE id = $1 AND status = 'assigned'`,
      [order_id]
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, status, by_role) VALUES ($1, 'ready_for_pickup', 'system(offer_timeout)')`,
      [order_id]
    );
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[worker] فشل إلغاء عرض الطلب ${order_id}:`, e.message);
    return false;
  } finally {
    client.release();
  }
}

async function tick() {
  try {
    const { rows } = await db.query(
      `SELECT off.order_id, off.driver_id
         FROM delivery_offers off
         JOIN orders o ON o.id = off.order_id
        WHERE off.response IS NULL AND off.expires_at < now() AND o.status = 'assigned'`
    );
    for (const r of rows) {
      const changed = await expireOffer(r);
      if (changed) {
        emitTo('role:dispatcher', 'dispatch:needs_assignment', { order_id: r.order_id, reason: 'offer_timeout' });
      }
    }
  } catch (e) {
    console.error('[worker]', e.message);
  }
}

function start() {
  if (process.env.DISABLE_WORKER === '1') return;
  timer = setInterval(tick, Number(process.env.WORKER_INTERVAL_MS || 20000));
  if (timer.unref) timer.unref();
}

module.exports = { start, tick };
