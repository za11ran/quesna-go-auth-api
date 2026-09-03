// رفع الصور على السيرفر نفسه: استقبال في الذاكرة -> resize (sharp) -> webp -> /uploads
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'));
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) =>
    ALLOWED.has(file.mimetype) ? cb(null, true) : cb(new Error('BAD_IMAGE_TYPE')),
});

// ميدلوير لحقل صورة واحد اسمه "image" + رسالة خطأ عربية موحّدة
function imageUpload(req, res, next) {
  memUpload.single('image')(req, res, (err) => {
    if (!err) return next();
    const code =
      err.code === 'LIMIT_FILE_SIZE' ? 'IMAGE_TOO_LARGE'
      : err.message === 'BAD_IMAGE_TYPE' ? 'BAD_IMAGE_TYPE'
      : 'UPLOAD_ERROR';
    const message =
      code === 'IMAGE_TOO_LARGE' ? 'الصورة أكبر من 5 ميجا'
      : code === 'BAD_IMAGE_TYPE' ? 'نوع الصورة لازم jpg أو png أو webp'
      : 'فشل رفع الصورة';
    res.status(422).json({ success: false, error_code: code, message, timestamp: new Date().toISOString() });
  });
}

// يكتب الصورة بعد resize ويرجّع { url }
async function saveImage(file, { folder = 'misc', width = 1200 } = {}) {
  if (!file || !file.buffer) return null;
  const dir = path.join(UPLOADS_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}.webp`;
  await sharp(file.buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(dir, name));
  return { url: `/uploads/${folder}/${name}` };
}

module.exports = { UPLOADS_DIR, imageUpload, saveImage };
