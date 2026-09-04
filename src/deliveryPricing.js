// تسعير التوصيل: سعر أساسي حسب قرية العميل + رسوم إضافية لكل متجر زيادة عن
// واحد في نفس الطلب (سلة بتجمع من أكتر من متجر). الاتنين قابلين للتعديل من
// لوحة الأدمن (routes: admin.js `/villages`, `/settings/delivery-pricing`).
const db = require('./db');

const DEFAULT_BASE_FEE = 25;
const DEFAULT_EXTRA_VENDOR_FEE = 15;

async function getExtraVendorFee() {
  const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = 'delivery_pricing'`);
  const v = rows[0]?.value || {};
  return Number(v.extra_vendor_fee ?? DEFAULT_EXTRA_VENDOR_FEE);
}

async function getVillageBaseFee(villageId) {
  if (!villageId) return DEFAULT_BASE_FEE;
  const { rows } = await db.query(`SELECT delivery_base_fee FROM villages WHERE id = $1`, [villageId]);
  return rows[0] ? Number(rows[0].delivery_base_fee) : DEFAULT_BASE_FEE;
}

// إجمالي رسوم التوصيل لطلب فيه vendorCount متجر مختلف لعميل من villageId.
async function computeDeliveryTotal({ villageId, vendorCount }) {
  const [base, extra] = await Promise.all([getVillageBaseFee(villageId), getExtraVendorFee()]);
  const count = Math.max(0, Number(vendorCount) || 0);
  const total = base + extra * Math.max(0, count - 1);
  return Math.round(total * 100) / 100;
}

module.exports = {
  DEFAULT_BASE_FEE,
  DEFAULT_EXTRA_VENDOR_FEE,
  getExtraVendorFee,
  getVillageBaseFee,
  computeDeliveryTotal,
};
