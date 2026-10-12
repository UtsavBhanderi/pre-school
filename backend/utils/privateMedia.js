'use strict';

const jwt = require('jsonwebtoken');

const MEDIA_TOKEN_ISSUER = 'preschool-private-media';
const MEDIA_TOKEN_AUDIENCE = 'school-photo';
const MEDIA_TOKEN_TTL_SECONDS = 120;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;
const PRIVATE_DIRECTORIES = new Set(['students', 'teachers']);
const SAFE_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const PHOTO_FIELDS = new Set(['studentPhoto', 'motherPhoto', 'fatherPhoto', 'selfPhoto']);

function isSafeImageFilename(filename) {
  if (typeof filename !== 'string' || !SAFE_FILENAME.test(filename)) return false;
  if (filename === '.' || filename === '..') return false;
  const extension = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return SAFE_IMAGE_EXTENSIONS.has(extension);
}

function parsePrivateMediaReference(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let pathname;
  try {
    pathname = /^https?:\/\//i.test(value)
      ? new URL(value).pathname
      : value.split(/[?#]/, 1)[0];
  } catch {
    return null;
  }

  const normalized = pathname.replace(/\\/g, '/').replace(/^\/+/, '');
  const match = /^uploads\/(students|teachers)\/([^/]+)$/.exec(normalized);
  if (!match || !SAFE_FILENAME.test(match[2]) || match[2] === '.' || match[2] === '..') return null;
  if (!PRIVATE_DIRECTORIES.has(match[1])) return null;

  return {
    type: match[1],
    filename: match[2],
    serveable: isSafeImageFilename(match[2]),
  };
}

function signPrivateMediaToken({ userId, type, filename, secret }) {
  if (!secret || !userId || !PRIVATE_DIRECTORIES.has(type) || !isSafeImageFilename(filename)) {
    throw new TypeError('Valid user, photo path and signing secret are required.');
  }
  return jwt.sign(
    { sub: String(userId), type, filename },
    secret,
    {
      expiresIn: MEDIA_TOKEN_TTL_SECONDS,
      issuer: MEDIA_TOKEN_ISSUER,
      audience: MEDIA_TOKEN_AUDIENCE,
      algorithm: 'HS256',
    }
  );
}

function verifyPrivateMediaToken(token, secret) {
  if (typeof token !== 'string' || !token || !secret) return null;
  try {
    const decoded = jwt.verify(token, secret, {
      issuer: MEDIA_TOKEN_ISSUER,
      audience: MEDIA_TOKEN_AUDIENCE,
      algorithms: ['HS256'],
    });
    if (!decoded || typeof decoded.sub !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.sub)) return null;
    if (!PRIVATE_DIRECTORIES.has(decoded.type) || !isSafeImageFilename(decoded.filename)) return null;
    return { userId: decoded.sub, type: decoded.type, filename: decoded.filename };
  } catch {
    return null;
  }
}

function mediaFieldToSignedUrl(value, userId, secret, publicBaseUrl) {
  const reference = parsePrivateMediaReference(value);
  if (!reference) return value;
  // A valid but unsupported image extension must never fall back to a public URL.
  if (!reference.serveable) return '';
  const token = signPrivateMediaToken({
    userId,
    type: reference.type,
    filename: reference.filename,
    secret,
  });
  return String(publicBaseUrl).replace(/\/+$/, '') + '/api/media/file?token=' + encodeURIComponent(token);
}

function rewritePrivateMediaFields(body, { userId, secret, publicBaseUrl }) {
  let clone;
  try {
    clone = JSON.parse(JSON.stringify(body));
  } catch {
    return body;
  }

  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;

    for (const [key, child] of Object.entries(value)) {
      if (PHOTO_FIELDS.has(key) && typeof child === 'string') {
        try {
          value[key] = mediaFieldToSignedUrl(child, userId, secret, publicBaseUrl);
        } catch {
          // Never leak the unprotected path if signing is unavailable.
          value[key] = '';
        }
      } else {
        visit(child);
      }
    }
  };
  visit(clone);
  return clone;
}

function mediaPublicBaseUrl(req) {
  const configured = String(process.env.API_PUBLIC_URL || '').trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (['http:', 'https:'].includes(parsed.protocol)) return parsed.origin;
    } catch {
      // Use the current API origin when the configured value is invalid.
    }
  }
  return req.protocol + '://' + req.get('host');
}

module.exports = {
  MEDIA_TOKEN_ISSUER,
  MEDIA_TOKEN_AUDIENCE,
  MEDIA_TOKEN_TTL_SECONDS,
  SAFE_IMAGE_EXTENSIONS,
  isSafeImageFilename,
  parsePrivateMediaReference,
  signPrivateMediaToken,
  verifyPrivateMediaToken,
  rewritePrivateMediaFields,
  mediaPublicBaseUrl,
};
