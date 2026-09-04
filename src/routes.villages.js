// GET /api/villages  -> قائمة القرى للاختيار منها في شاشة التسجيل + أسعار التوصيل
const router = require('express').Router();
const db = require('./db');
const { getExtraVendorFee } = require('./deliveryPricing');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, key, name, governorate, delivery_base_fee
         FROM villages
        WHERE is_active = true
     ORDER BY id`
    );
    const extraVendorFee = await getExtraVendorFee();
    res.json({
      success: true,
      count: rows.length,
      villages: rows,
      extra_vendor_fee: extraVendorFee,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
