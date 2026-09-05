// كود الطلب الموحّد اللي بيتعرض في كل مكان بدل الـ id الخام (ord_/qo_):
//   ord_<n>            → GQ<n>        طلب متجر عادي
//   qo_<n> بدون مركبة  → GO<n>        طلب سريع (توصيل حاجة)
//   qo_<n> بمركبة      → Driver<n>    حجز درايفر (motorcycle/tuk_tuk/car)
function orderCode(id, vehicleType = null) {
  const s = String(id == null ? '' : id);
  if (s.startsWith('qo_')) {
    const n = s.slice(3);
    return vehicleType ? `Driver${n}` : `GO${n}`;
  }
  if (s.startsWith('ord_')) return `GQ${s.slice(4)}`;
  return s;
}

module.exports = { orderCode };
