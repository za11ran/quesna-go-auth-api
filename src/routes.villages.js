// GET /api/villages  -> قائمة القرى للاختيار منها في شاشة التسجيل
const router = require('express').Router();
const db = require('./db');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, key, name, governorate
         FROM villages
        WHERE is_active = true
     ORDER BY id`
    );
    res.json({ success: true, count: rows.length, villages: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
