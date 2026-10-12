'use strict';

const crypto = require('crypto');

const PRIVATE_FOLDERS = new Set(['students', 'teachers']);
const PRIVATE_PHOTO_FIELDS = {
  studentPhoto: 'students',
  motherPhoto: null,
  fatherPhoto: null,
  selfPhoto: 'teachers',
};

function safeFilename(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 220) return false;
  if (value === '.' || value === '..' || pathHasSeparator(value)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp|gif|avif|bmp)$/i.test(value);
}

function pathHasSeparator(value) {
  return value.includes('/') || value.includes('\\');
}

function privateMediaSecret() {
  return String(process.env.PRIVATE_MEDIA_SECRET || process.env.JWT_SECRET || '');
}

function signatureFor(folder, filename, expiresAt, secret = privateMediaSecret()) {
  if (!PRIVATE_FOLDERS.has(folder) || !safeFilename(filename) ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= 0 || !secret) return '';
  return crypto.createHmac('sha256', secret)
    .update('preschool-private-media-v1\n' + folder + '\n' + filename + '\n' + expiresAt)
    .digest('hex');
}

function signPrivateMediaUrl(folder, filename, nowSeconds = Math.floor(Date.now() / 1000), ttlSeconds = 600) {
  if (!PRIVATE_FOLDERS.has(folder) || !safeFilename(filename) || !privateMediaSecret()) return '';
  const ttl = Number.isInteger(ttlSeconds) ? Math.min(900, Math.max(60, ttlSeconds)) : 600;
  const expiresAt = nowSeconds + ttl;
  const signature = signatureFor(folder, filename, expiresAt);
  if (!signature) return '';
  return 'uploads/' + folder + '/' + encodeURIComponent(filename) +
    '?expires=' + expiresAt + '&signature=' + signature;
}

function verifyPrivateMediaSignature(folder, filename, expiresValue, signature, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!PRIVATE_FOLDERS.has(folder) || !safeFilename(filename) || !/^\d{10}$/.test(String(expiresValue || ''))) return false;
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expiresAt = Number(expiresValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + 901) return false;
  const expected = signatureFor(folder, filename, expiresAt);
  if (!expected) return false;
  const actualBytes = Buffer.from(signature, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
}

function parseStoredPhotoPath(value, expectedFolder, origin) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  let pathValue = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (origin && parsed.origin !== origin) return null;
      pathValue = parsed.pathname;
    } catch {
      return null;
    }
  }

  pathValue = pathValue.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  const match = pathValue.match(/^uploads\/(students|teachers)\/([^/]+)$/);
  if (match) {
    const folder = match[1];
    const filename = decodeURIComponent(match[2]);
    if (!PRIVATE_FOLDERS.has(folder) || !safeFilename(filename)) return { folder, filename: '', privatePath: true };
    return { folder, filename, privatePath: true };
  }

  // Older deployments sometimes stored only the filename. The schema field
  // determines its folder, but only for the known private photo fields.
  if (expectedFolder && !pathValue.includes('/') && safeFilename(pathValue)) {
    return { folder: expectedFolder, filename: pathValue, privatePath: true };
  }
  return null;
}

function signedPhotoValue(value, fieldName, origin, defaultFolder) {
  if (typeof value !== 'string') return value;
  let expectedFolder = PRIVATE_PHOTO_FIELDS[fieldName];
  if (fieldName === 'motherPhoto' || fieldName === 'fatherPhoto') {
    const normalizedPath = value.replace(/^\/+/, '');
    if (normalizedPath.startsWith('uploads/teachers/')) expectedFolder = 'teachers';
    else if (normalizedPath.startsWith('uploads/students/')) expectedFolder = 'students';
    else expectedFolder = defaultFolder;
  }

  const parsed = parseStoredPhotoPath(value, expectedFolder, origin);
  if (!parsed) return value;
  if (!parsed.filename) return '';

  const signed = signPrivateMediaUrl(parsed.folder, parsed.filename);
  // Fail closed: never return the old public path if signing is not possible.
  return signed;
}

function transformPhotoValues(value, origin, defaultFolder) {
  if (Array.isArray(value)) return value.map((item) => transformPhotoValues(item, origin, defaultFolder));
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;

  const plain = typeof value.toJSON === 'function' ? value.toJSON() : value;
  if (plain !== value) return transformPhotoValues(plain, origin, defaultFolder);

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = Object.prototype.hasOwnProperty.call(PRIVATE_PHOTO_FIELDS, key) || key === 'motherPhoto' || key === 'fatherPhoto'
      ? signedPhotoValue(child, key, origin, defaultFolder)
      : transformPhotoValues(child, origin, defaultFolder);
  }
  return output;
}

function installPrivatePhotoResponseTransform(req, res, next) {
  const originalJson = res.json;
  const defaultFolder = req.path.startsWith('/api/teachers') ? 'teachers' : req.path.startsWith('/api/students') ? 'students' : undefined;
  const origin = (() => {
    const forwardedProtocol = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const protocol = forwardedProtocol || req.protocol;
    return protocol + '://' + String(req.get('host') || '');
  })();

  res.json = function privatePhotoJson(body) {
    try {
      return originalJson.call(this, transformPhotoValues(body, origin, defaultFolder));
    } catch (error) {
      console.error('Unable to prepare private photo URLs:', error.message);
      this.status(500);
      return originalJson.call(this, { message: 'The response could not be prepared safely.' });
    }
  };
  return next();
}

module.exports = {
  PRIVATE_FOLDERS,
  safeFilename,
  signPrivateMediaUrl,
  verifyPrivateMediaSignature,
  transformPhotoValues,
  installPrivatePhotoResponseTransform,
};
