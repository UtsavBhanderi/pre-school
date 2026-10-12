'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Photo = require('../models/Photo');
const PDF = require('../models/Pdf');
const Video = require('../models/Video');
const OrganizationMembership = require('../models/OrganizationMembership');
const { verifyPrivateMediaToken } = require('../utils/privateMedia');

const router = express.Router();
const uploadRoot = path.resolve(__dirname, '../uploads');
const MODEL_BY_TYPE = {
  students: { Model: Student, fields: ['studentPhoto', 'motherPhoto', 'fatherPhoto'] },
  teachers: { Model: Teacher, fields: ['selfPhoto', 'motherPhoto', 'fatherPhoto'] },
  gallery: { Model: Photo, fields: ['url'] },
  pdf: { Model: PDF, fields: ['filePath'] },
  video: { Model: Video, fields: ['filePath', 'url'] },
};
const REGEX_SPECIAL = new Set(['.', '*', '+', '?', '^', '$', '|', '(', ')', '{', '}', '[', ']', '\\']);

function escapeRegex(value) {
  return Array.from(value, (character) => REGEX_SPECIAL.has(character) ? '\\' + character : character).join('');
}

async function recordStillReferencesFile(type, filename) {
  const entry = MODEL_BY_TYPE[type];
  if (!entry) return false;
  const filenamePattern = new RegExp('(?:^|[/\\\\])' + escapeRegex(filename) + '(?:[?#].*)?$');
  const filter = { $or: entry.fields.map((field) => ({ [field]: filenamePattern })) };
  const record = await entry.Model.findOne(filter).select('_id').lean();
  return Boolean(record);
}

router.get('/file', async (req, res) => {
  res.set({
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });

  const claims = verifyPrivateMediaToken(req.query.token, process.env.JWT_SECRET);
  if (!claims) return res.status(403).json({ message: 'This private resource link is invalid or has expired. Reload the school resource and try again.' });
  if (!mongoose.Types.ObjectId.isValid(claims.userId)) return res.status(403).json({ message: 'This private resource link is invalid.' });

  try {
    const user = await User.findById(claims.userId).select('_id role').lean();
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'You are not allowed to access this school resource.' });
    }

    // Legacy resources use this capability route until their records have full
    // organization scoping. A user connected to any tenant cannot use old links.
    const membership = await OrganizationMembership.exists({ userId: user._id });
    if (membership) return res.status(403).json({ message: 'This resource must be accessed through your organization workspace.' });

    if (!(await recordStillReferencesFile(claims.type, claims.filename))) {
      return res.status(404).json({ message: 'This file is no longer attached to a school record.' });
    }

    const mediaRoot = path.resolve(uploadRoot, claims.type);
    const absolutePath = path.resolve(mediaRoot, claims.filename);
    if (!absolutePath.startsWith(mediaRoot + path.sep)) return res.status(400).json({ message: 'Invalid resource path.' });

    const [realRoot, realFile] = await Promise.all([
      fs.promises.realpath(mediaRoot),
      fs.promises.realpath(absolutePath),
    ]);
    if (!realFile.startsWith(realRoot + path.sep)) return res.status(400).json({ message: 'Invalid resource path.' });
    const stat = await fs.promises.stat(realFile);
    if (!stat.isFile()) return res.status(404).json({ message: 'File not found.' });

    res.setHeader('Content-Disposition', 'inline; filename="' + claims.filename.replace(/["\\\r\n]/g, '') + '"');
    return res.sendFile(realFile, (error) => {
      if (error && !res.headersSent) {
        console.error('Private media delivery failed:', error.code || error.name || 'send_file_error');
        res.status(error.statusCode || 404).json({ message: 'The resource could not be delivered.' });
      }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ message: 'File not found.' });
    console.error('Private media authorization failed:', error.message);
    return res.status(503).json({ message: 'Resource access could not be verified.' });
  }
});

module.exports = router;
