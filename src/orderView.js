// تحميل وتسلسل الطلب — مشترك بين العميل/التاجر/المشرف/الدليفري.
const db = require('./db');

const n2 = (v) => (v === null || v === undefined ? v : Math.round(Number(v) * 100) / 100);

async function loadOrder(orderId) {
  const o = await db.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (!o.rowCount) return null;
  const ord = o.rows[0];
  const [items, vendors, history, customer, driver] = await Promise.all([
    db.query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [orderId]),
    db.query(`SELECT * FROM order_vendors WHERE order_id = $1`, [orderId]),
    db.query(`SELECT status, by_role, at FROM order_status_history WHERE order_id = $1 ORDER BY at, id`, [orderId]),
    db.query(`SELECT id, full_name, phone FROM users WHERE id = $1`, [ord.customer_id]),
    ord.driver_id
      ? db.query(`SELECT * FROM drivers WHERE id = $1`, [ord.driver_id])
      : Promise.resolve({ rows: [] }),
  ]);
  return {
    order: ord,
    items: items.rows,
    vendors: vendors.rows,
    history: history.rows,
    customer: customer.rows[0],
    driver: driver.rows[0] || null,
  };
}

function serializeDriver(d) {
  if (!d) return null;
  return {
    id: d.id,
    name: d.name,
    phone: d.phone,
    photo: d.photo || null,
    vehicle_type: d.vehicle_type,
    location: d.lat != null && d.lng != null ? { lat: Number(d.lat), lng: Number(d.lng), updated_at: d.location_updated_at } : null,
  };
}

function serializeOrder(bundle) {
  const { order: o, items, vendors, history, customer, driver } = bundle;
  return {
    id: o.id,
    status: o.status,
    driver_sub_status: o.driver_sub_status || null,
    created_at: o.placed_at,
    customer: customer ? { id: customer.id, name: customer.full_name, phone: customer.phone } : null,
    vendors: vendors.map((v) => ({
      vendor_id: v.vendor_id, vendor_name: v.vendor_name,
      subtotal: n2(v.subtotal), delivery_fee: n2(v.delivery_fee),
    })),
    driver: serializeDriver(driver),
    dispatcher_id: o.dispatcher_id || null,
    subtotal: n2(o.subtotal),
    delivery_total: n2(o.delivery_total),
    discount_total: n2(o.discount_total),
    total: n2(o.total),
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    notes: o.notes || null,
    address_text: o.address_text || null,
    address: o.address_lat != null && o.address_lng != null
      ? { text: o.address_text, lat: Number(o.address_lat), lng: Number(o.address_lng) }
      : null,
    items: items.map((it) => ({
      product_id: it.product_id, name: it.name, option_name: it.option_name || null,
      unit_price: n2(it.unit_price), quantity: it.quantity, line_total: n2(it.line_total), note: it.note || null,
    })),
    timestamps: {
      placed_at: o.placed_at, accepted_at: o.accepted_at, ready_at: o.ready_at,
      assigned_at: o.assigned_at, picked_up_at: o.picked_up_at, delivered_at: o.delivered_at,
    },
    status_history: history.map((h) => ({ status: h.status, at: h.at, by: h.by_role })),
  };
}

// يضيف صف لسجل الحالة + يحدّث عمود التوقيت المناسب
async function setStatus(orderId, status, byRole, extraCols = {}) {
  const timeCol = {
    accepted: 'accepted_at', ready_for_pickup: 'ready_at', assigned: 'assigned_at',
    picked_up: 'picked_up_at', delivered: 'delivered_at', cancelled: 'cancelled_at',
  }[status];
  const cols = ['status = $2', 'updated_at = now()'];
  const params = [orderId, status];
  if (timeCol) cols.push(`${timeCol} = COALESCE(${timeCol}, now())`);
  for (const [k, v] of Object.entries(extraCols)) {
    params.push(v);
    cols.push(`${k} = $${params.length}`);
  }
  await db.query(`UPDATE orders SET ${cols.join(', ')} WHERE id = $1`, params);
  await db.query(`INSERT INTO order_status_history (order_id, status, by_role) VALUES ($1, $2, $3)`, [orderId, status, byRole]);
}

module.exports = { loadOrder, serializeOrder, serializeDriver, setStatus, n2 };
