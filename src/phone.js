// تطبيع والتحقق من رقم الموبايل المصري
// يقبل كل الصيغ التالية ويحوّلها لصيغة موحّدة:
//   01065465118 , 1065465118 , +201065465118 , 00201065465118 , 201065465118
// بادئات الشبكات المصرية بعد الصفر: 10 , 11 , 12 , 15

function normalizeEgyptPhone(input) {
  if (typeof input !== 'string' && typeof input !== 'number') {
    return { ok: false, error: 'رقم الهاتف مطلوب' };
  }

  let s = String(input).trim().replace(/[\s\-()]/g, '');
  // حوّل أرقام لوحة المفاتيح العربية (٠١٢..) إلى إنجليزية
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

  if (s.startsWith('+20')) s = '0' + s.slice(3);
  else if (s.startsWith('0020')) s = '0' + s.slice(4);
  else if (s.startsWith('20') && s.length === 12) s = '0' + s.slice(2);

  // لو الرقم 10 خانات ويبدأ بـ 1 (بدون الصفر) ضيف الصفر
  if (/^1[0125]\d{8}$/.test(s)) s = '0' + s;

  if (!/^01[0125]\d{8}$/.test(s)) {
    return { ok: false, error: 'رقم موبايل مصري غير صحيح (مثال: 01065465118)' };
  }

  return {
    ok: true,
    local: s,                    // 01065465118  (للعرض)
    e164: '+20' + s.slice(1),    // +201065465118 (للتخزين)
  };
}

module.exports = { normalizeEgyptPhone };
