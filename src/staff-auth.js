// مصادقة حسابات لوحة التحكم (staff_users): توقيع توكن + ميدلوير حسب الدور.
const jwt = require('jsonwebtoken');
const db = require('./db');

function signStaffToken(staff) {
  return jwt.sign(
    { sub: staff.id, kind: 'staff', role: staff.role, vendor_id: staff.vendor_id || null, driver_id: staff.driver_id || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

// staffAuth(['admin','dispatcher']) -> ميدلوير
function staffAuth(roles) {
  const allow = Array.isArray(roles) ? roles : roles ? [roles] : null;
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, error_code: 'AUTH_REQUIRED', message: 'مطلوب تسجيل الدخول', timestamp: new Date().toISOString() });
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error_code: 'AUTH_INVALID', message: 'الجلسة غير صالحة', timestamp: new Date().toISOString() });
    }
    if (payload.kind !== 'staff') {
      return res.status(403).json({ success: false, error_code: 'FORBIDDEN', message: 'هذا الحساب لا يملك صلاحية اللوحة', timestamp: new Date().toISOString() });
    }
    if (allow && !allow.includes(payload.role)) {
      return res.status(403).json({ success: false, error_code: 'FORBIDDEN', message: 'صلاحية غير كافية', timestamp: new Date().toISOString() });
    }
    // تأكد إن الحساب لسه شغّال
    const { rows } = await db.query(`SELECT id, role, vendor_id, driver_id, is_active FROM staff_users WHERE id = $1`, [payload.sub]);
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ success: false, error_code: 'AUTH_INVALID', message: 'الحساب غير مفعّل', timestamp: new Date().toISOString() });
    }
    req.staff = { id: rows[0].id, role: rows[0].role, vendor_id: rows[0].vendor_id, driver_id: rows[0].driver_id };
    next();
  };
}

module.exports = { signStaffToken, staffAuth };
