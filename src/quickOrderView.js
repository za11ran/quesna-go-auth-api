// تحميل وتسلسل "الطلب السريع" (quick_orders) — نفس فكرة orderView.js، بس
// للطلب الحر (تفاصيل نصية + سعر تقديري بدل متجر/أصناف). بيتبع نفس مفردات
// حالة الطلب العادي (pending/accepted/assigned/picked_up/on_the_way/
// delivered/cancelled) عشان يشتغل مع نفس شاشة التتبّع، طابور التوزيع،
// وصفحة الدليفري من غير أي تعديل في التطبيق.
//
// مفيش هنا آلية عرض/قبول الدليفري (delivery_offers) زي الطلب العادي —
// دي مقصودة أبسط: المشرف بيدّي الطلب مباشرة لدليفري (زي مكالمة تليفونية)
// من غير طابور دور أو مهلة قبول، لأن delivery_offers.order_id بيربط بجدول
// orders بمفتاح أجنبي (مش quick_orders) أصلًا.
const db = require('./db');
const { emitTo } = require('./realtime');
const { serializeDriver } = require('./orderView');

// driver_sub_status بعد التعيين مباشرة = 'picked_up' (مفيش "متجر" نروحله زي
// الطلب العادي — الدليفري بيستلم المهمة على طول)، وبعدين نفس تسلسل الطلب
// العادي: on_the_way -> arrived -> delivered.
const QO_SUB_FLOW = { picked_up: 'on_the_way', on_the_way: 'arrived', arrived: 'delivered' };

async function loadQuickOrder(id) {
  const r = await db.query(`SELECT * FROM quick_orders WHERE id = $1`, [id]);
  if (!r.rowCount) return null;
  const qo = r.rows[0];
  const [customer, driver] = await Promise.all([
    db.query(`SELECT id, full_name, phone FROM users WHERE id = $1`, [qo.customer_id]),
    qo.driver_id ? db.query(`SELECT * FROM drivers WHERE id = $1`, [qo.driver_id]) : Promise.resolve({ rows: [] }),
  ]);
  return { qo, customer: customer.rows[0] || null, driver: driver.rows[0] || null };
}

function serializeQuickOrder({ qo, customer, driver }) {
  const price = qo.price != null ? Number(qo.price) : 0;
  const label = qo.details.length > 60 ? `${qo.details.slice(0, 60)}…` : qo.details;
  return {
    id: qo.id,
    is_quick: true,
    status: qo.status,
    driver_sub_status: qo.driver_sub_status || null,
    customer: customer ? { id: customer.id, name: customer.full_name, phone: customer.phone } : null,
    vendors: [{ vendor_id: null, vendor_name: `طلب سريع: ${label}`, subtotal: price, delivery_fee: 0, order_mode: 'app', vendor_phone: null }],
    vendor_names: [`طلب سريع: ${label}`],
    driver: serializeDriver(driver),
    dispatcher_id: qo.dispatcher_id || null,
    subtotal: price,
    delivery_total: 0,
    discount_total: 0,
    total: price,
    payment_method: 'cash',
    payment_status: 'pending',
    notes: qo.details,
    address_text: qo.address_text || null,
    address: qo.address_lat != null && qo.address_lng != null
      ? { text: qo.address_text, lat: Number(qo.address_lat), lng: Number(qo.address_lng) }
      : null,
    items: [{
      product_id: null, name: qo.details, option_name: null,
      unit_price: price, quantity: 1, line_total: price, note: null,
    }],
    images: qo.images || [],
    created_at: qo.created_at,
    timestamps: { placed_at: qo.created_at, delivered_at: qo.status === 'delivered' ? qo.updated_at : null },
    status_history: [],
  };
}

async function setQuickOrderStatus(id, status, { dispatcherId, driverId, price, driverSubStatus } = {}) {
  const cols = ['status = $2', 'updated_at = now()'];
  const params = [id, status];
  if (dispatcherId !== undefined) { params.push(dispatcherId); cols.push(`dispatcher_id = $${params.length}`); }
  if (driverId !== undefined) { params.push(driverId); cols.push(`driver_id = $${params.length}`); }
  if (price !== undefined && price !== null) { params.push(price); cols.push(`price = $${params.length}`); }
  if (driverSubStatus !== undefined) { params.push(driverSubStatus); cols.push(`driver_sub_status = $${params.length}`); }
  await db.query(`UPDATE quick_orders SET ${cols.join(', ')} WHERE id = $1`, params);
  const bundle = await loadQuickOrder(id);
  emitTo(`customer:${bundle.qo.customer_id}`, 'order:update', { order_id: id, status });
  return bundle;
}

module.exports = { QO_SUB_FLOW, loadQuickOrder, serializeQuickOrder, setQuickOrderStatus };
