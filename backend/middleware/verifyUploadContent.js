'use strict';

const fs = require('fs');
const path = require('path');

const EXTENSIONS = {
  students: new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']),
  'student-documents': new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']),
  teachers: new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']),
  gallery: new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']),
  pdf: new Set(['.pdf']),
  video: new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv']),
};

function startsWithBytes(buffer, bytes) {
  return buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);
}

function matchesUploadSignature(directory, filename, buffer) {
  if (!Buffer.isBuffer(buffer) || !EXTENSIONS[directory]) return false;
  const extension = path.extname(String(filename || '')).toLowerCase();
  if (!EXTENSIONS[directory].has(extension)) return false;

  if (['students', 'teachers', 'gallery', 'student-documents'].includes(directory) && ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) {
    if (['.jpg', '.jpeg'].includes(extension)) return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
    if (extension === '.png') return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (extension === '.gif') return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
    if (extension === '.webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    return false;
  }

  if (directory === 'pdf' || (directory === 'student-documents' && extension === '.pdf')) return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (['.mp4', '.mov', '.m4v'].includes(extension)) return buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  if (extension === '.webm') return startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  if (extension === '.ogv') return buffer.subarray(0, 4).toString('ascii') === 'OggS';
  return false;
}

function requestFiles(req) {
  if (req.file) return [req.file];
  return Object.values(req.files || {}).flat().filter(Boolean);
}

function readFileHeader(filePath) {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(32);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
}

function verifyUploadContent(directory) {
  if (!EXTENSIONS[directory]) throw new TypeError('A supported upload directory is required.');
  return async function verifyRequestUploads(req, res, next) {
    const files = requestFiles(req);
    if (!files.length) return next();

    let invalidFile = false;
    try {
      invalidFile = files.some((file) => !matchesUploadSignature(
        directory,
        file.originalname || file.filename,
        readFileHeader(file.path),
      ));
    } catch {
      invalidFile = true;
    }

    if (!invalidFile) return next();
    await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})));
    const typeLabel = directory === 'student-documents' ? 'supported student document' : directory === 'pdf' ? 'PDF document' : directory === 'video' ? 'supported video format' : 'supported image format';
    return res.status(415).json({
      code: 'UPLOAD_CONTENT_TYPE_MISMATCH',
      message: 'The selected file does not contain a valid ' + typeLabel + '.',
    });
  };
}

module.exports = { matchesUploadSignature, verifyUploadContent };
