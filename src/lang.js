// تحديد لغة الرد للعميل: هيدر LANG ثم باراميتر ?lang= ثم body.lang ثم العربية افتراضيًا.
// النتيجة دايمًا 'ar' أو 'en'.
const pick = (v) => (String(v || '').toLowerCase().startsWith('en') ? 'en' : 'ar');

const langOf = (req) =>
  pick(req.get('LANG') || req.query.lang || (req.body && req.body.lang) || 'ar');

// يختار نص من كائن ثنائي اللغة { ar, en } — أو يرجّع النص كما هو لو مش كائن.
const t = (val, lang) =>
  val && typeof val === 'object' ? val[lang] || val.ar || val.en || '' : val;

module.exports = { langOf, pick, t };
