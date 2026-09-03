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

function uploadErr(res, err) {
  const code =
    err.code === 'LIMIT_FILE_SIZE' ? 'IMAGE_TOO_LARGE'
    : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? 'TOO_MANY_IMAGES'
    : err.message === 'BAD_IMAGE_TYPE' ? 'BAD_IMAGE_TYPE'
    : 'UPLOAD_ERROR';
  const message =
    code === 'IMAGE_TOO_LARGE' ? 'الصورة أكبر من 5 ميجا'
    : code === 'TOO_MANY_IMAGES' ? 'أقصى عدد صور 5'
    : code === 'BAD_IMAGE_TYPE' ? 'نوع الصورة لازم jpg أو png أو webp'
    : 'فشل رفع الصورة';
  res.status(422).json({ success: false, error_code: code, message, timestamp: new Date().toISOString() });
}

// ميدلوير لحقل صورة واحد اسمه "image"
function imageUpload(req, res, next) {
  memUpload.single('image')(req, res, (err) => (err ? uploadErr(res, err) : next()));
}
// ميدلوير لعدة صور (حقل "images"، أقصى 5)
function imagesUpload(req, res, next) {
  memUpload.array('images', 5)(req, res, (err) => (err ? uploadErr(res, err) : next()));
}

async function saveImages(files, opts) {
  const out = [];
  for (const f of files || []) out.push((await saveImage(f, opts)).url);
  return out;
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

module.exports = { UPLOADS_DIR, imageUpload, imagesUpload, saveImage, saveImages };
