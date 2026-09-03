// إنشاء رمز الدخول (JWT) والتحقق منه في الطلبات المحمية
const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign(
    { sub: user.id, phone: user.phone, role: user.role || 'customer' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res
      .status(401)
      .json({ success: false, error_code: 'AUTH_REQUIRED', error: 'مطلوب تسجيل الدخول' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res
      .status(401)
      .json({ success: false, error_code: 'AUTH_INVALID', error: 'الجلسة غير صالحة أو منتهية' });
  }
}

module.exports = { signToken, authRequired };
