'use strict';

const crypto = require('crypto');
const path = require('path');

const IMAGE_MIMES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const VIDEO_MIMES = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};
const CATEGORY_RULES = {
  child_photo: { mimeExtensions: IMAGE_MIMES, maxBytes: 5 * 1024 * 1024 },
  staff_photo: { mimeExtensions: IMAGE_MIMES, maxBytes: 5 * 1024 * 1024 },
  gallery_image: { mimeExtensions: IMAGE_MIMES, maxBytes: 8 * 1024 * 1024 },
  learning_pdf: { mimeExtensions: { 'application/pdf': '.pdf' }, maxBytes: 20 * 1024 * 1024 },
  learning_video: { mimeExtensions: VIDEO_MIMES, maxBytes: 100 * 1024 * 1024 },
};

function storageNameFor(category, mimeType) {
  const extension = CATEGORY_RULES[category]?.mimeExtensions?.[mimeType];
  return extension ? crypto.randomUUID() + extension : null;
}

function safeDisplayName(value) {
  if (typeof value !== 'string') return '';
  return path.basename(value.replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, 160);
}

function matchesMediaSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return false;

  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  if (mimeType === 'image/gif') {
    return buffer.length >= 6 &&
      ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
  }
  if (mimeType === 'application/pdf') {
    return buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-';
  }
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') {
    return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
  }
  if (mimeType === 'video/webm') {
    return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  return false;
}

module.exports = { CATEGORY_RULES, storageNameFor, safeDisplayName, matchesMediaSignature };
