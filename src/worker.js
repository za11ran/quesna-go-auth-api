// عامل خلفي: يلغي عروض التوصيل اللي عدّت المهلة ويرجّع الطلب للطابور.
const db = require('./db');
const { emitTo } = require('./realtime');

let timer = null;

async function tick() {
  try {
    const { rows } = await db.query(
      `SELECT off.order_id, off.driver_id
         FROM delivery_offers off
         JOIN orders o ON o.id = off.order_id
        WHERE off.response IS NULL AND off.expires_at < now() AND o.status = 'assigned'`
    );
    for (const r of rows) {
      await db.query(
        `UPDATE delivery_offers SET response = 'timeout', responded_at = now()
          WHERE order_id = $1 AND driver_id = $2 AND response IS NULL`,
        [r.order_id, r.driver_id]
      );
      if (r.driver_id) {
        await db.query(
          `UPDATE drivers SET status = 'available', current_order_id = NULL, updated_at = now() WHERE id = $1`,
          [r.driver_id]
        );
      }
      await db.query(
        `UPDATE orders SET driver_id = NULL, driver_sub_status = NULL, status = 'ready_for_pickup', updated_at = now() WHERE id = $1`,
        [r.order_id]
      );
      await db.query(
        `INSERT INTO order_status_history (order_id, status, by_role) VALUES ($1, 'ready_for_pickup', 'system(offer_timeout)')`,
        [r.order_id]
      );
      emitTo('role:dispatcher', 'dispatch:needs_assignment', { order_id: r.order_id, reason: 'offer_timeout' });
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
