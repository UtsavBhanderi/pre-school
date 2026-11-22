'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const StudentDocument = require('../models/StudentDocument');
const StudentDocumentAuditEvent = require('../models/StudentDocumentAuditEvent');
const { verifyUploadContent } = require('../middleware/verifyUploadContent');
const {
  MAX_STUDENT_DOCUMENT_BYTES,
  getStudentDocumentMimeType,
  normalizeStudentDocumentMetadata,
  isSafeStudentDocumentStorageName,
} = require('../utils/studentDocumentFiles');

const router = express.Router();
const privateDocumentRoot = path.resolve(__dirname, '../private-files/student-documents');

function requestAuditDetails(req) {
  return {
    actorUserId: req.user._id,
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  };
}

function publicDocument(document) {
  const value = document?.toObject ? document.toObject() : { ...document };
  delete value.storageName;
  delete value.sha256;
  delete value.__v;
  return value;
}

function validObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

const storage = multer.diskStorage({
  destination(req, file, callback) {
    fs.mkdir(privateDocumentRoot, { recursive: true, mode: 0o700 }, (error) => callback(error, privateDocumentRoot));
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    callback(null, crypto.randomUUID() + extension);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_STUDENT_DOCUMENT_BYTES, files: 1, fields: 3, parts: 5 },
  fileFilter(req, file, callback) {
    // The content-signature middleware is authoritative. This preliminary
    // check only rejects obviously unsupported names before writing to disk.
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
      return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'document'));
    }
    return callback(null, true);
  },
});

async function removeUploadedFile(file) {
  if (!file?.path) return;
  await fs.promises.unlink(file.path).catch(() => {});
}

async function ensureStudent(studentId) {
  if (!validObjectId(studentId)) return { error: 'invalid' };
  const student = await Student.findById(studentId).select('_id stuNo').lean();
  return student ? { student } : { error: 'missing' };
}

router.get('/:studentId', async (req, res) => {
  try {
    const result = await ensureStudent(req.params.studentId);
    if (result.error === 'invalid') return res.status(400).json({ message: 'Invalid student ID.' });
    if (result.error) return res.status(404).json({ message: 'Student not found.' });

    const documents = await StudentDocument.find({ studentId: result.student._id })
      .select('-storageName -sha256 -__v')
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return res.json({ documents });
  } catch (error) {
    console.error('Student document listing failed:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Unable to load this student’s documents.' });
  }
});

router.post('/:studentId', upload.single('document'), verifyUploadContent('student-documents'), async (req, res) => {
  let createdDocument = null;
  try {
    const result = await ensureStudent(req.params.studentId);
    if (result.error === 'invalid') {
      await removeUploadedFile(req.file);
      return res.status(400).json({ message: 'Invalid student ID.' });
    }
    if (result.error) {
      await removeUploadedFile(req.file);
      return res.status(404).json({ message: 'Student not found.' });
    }
    if (!req.file) return res.status(400).json({ message: 'Choose a document to upload.' });

    const metadata = normalizeStudentDocumentMetadata(req.body, req.file.originalname);
    const mimeType = getStudentDocumentMimeType(req.file.originalname);
    if (!mimeType || !req.file.size) {
      await removeUploadedFile(req.file);
      return res.status(415).json({ message: 'Choose a valid PDF or image document.' });
    }

    const fileBuffer = await fs.promises.readFile(req.file.path);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    createdDocument = await StudentDocument.create({
      studentId: result.student._id,
      ...metadata,
      mimeType,
      sizeBytes: fileBuffer.length,
      storageName: req.file.filename,
      sha256,
      uploadedBy: req.user._id,
    });

    await StudentDocumentAuditEvent.create({
      studentId: result.student._id,
      documentId: createdDocument._id,
      action: 'uploaded',
      documentType: metadata.documentType,
      ...requestAuditDetails(req),
    });

    return res.status(201).json({
      message: 'Student document uploaded securely.',
      document: publicDocument(createdDocument),
    });
  } catch (error) {
    if (createdDocument?._id) {
      await StudentDocument.deleteOne({ _id: createdDocument._id }).catch(() => {});
    }
    await removeUploadedFile(req.file);
    if (error instanceof TypeError) return res.status(400).json({ message: error.message });
    console.error('Student document upload failed:', error?.name || 'upload_error');
    return res.status(500).json({ message: 'The document could not be saved. Please try again.' });
  }
});

router.get('/:studentId/:documentId/download', async (req, res) => {
  try {
    const { studentId, documentId } = req.params;
    if (!validObjectId(studentId) || !validObjectId(documentId)) {
      return res.status(400).json({ message: 'Invalid student or document ID.' });
    }

    const [student, document] = await Promise.all([
      Student.findById(studentId).select('_id').lean(),
      StudentDocument.findOne({ _id: documentId, studentId }).select('+storageName +sha256').lean(),
    ]);
    if (!student || !document) return res.status(404).json({ message: 'Student document not found.' });
    if (!isSafeStudentDocumentStorageName(document.storageName) ||
        getStudentDocumentMimeType(document.storageName) !== document.mimeType) {
      return res.status(404).json({ message: 'The stored student document is unavailable.' });
    }

    const absolutePath = path.resolve(privateDocumentRoot, document.storageName);
    if (!absolutePath.startsWith(privateDocumentRoot + path.sep)) {
      return res.status(400).json({ message: 'Invalid private document path.' });
    }

    const [realRoot, realFile] = await Promise.all([
      fs.promises.realpath(privateDocumentRoot),
      fs.promises.realpath(absolutePath),
    ]);
    if (!realFile.startsWith(realRoot + path.sep)) {
      return res.status(400).json({ message: 'Invalid private document path.' });
    }

    const buffer = await fs.promises.readFile(realFile);
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (buffer.length !== document.sizeBytes || digest !== document.sha256) {
      return res.status(409).json({ message: 'The saved document failed its integrity check. Contact the administrator.' });
    }

    await StudentDocumentAuditEvent.create({
      studentId,
      documentId,
      action: 'downloaded',
      documentType: document.documentType,
      ...requestAuditDetails(req),
    });

    const fallbackName = String(document.originalFileName || 'student-document')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(0, 120) || 'student-document';
    const encodedName = encodeURIComponent(document.originalFileName || fallbackName)
      .replace(/[!'()*]/g, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase());

    res.set({
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Type': document.mimeType,
      'Content-Length': String(document.sizeBytes),
      'Content-Disposition': 'attachment; filename="' + fallbackName + '"; filename*=UTF-8\'\'' + encodedName,
    });
    return res.sendFile(realFile, (error) => {
      if (error && !res.headersSent) {
        console.error('Student document delivery failed:', error?.code || error?.name || 'send_file_error');
        res.status(error.statusCode || 404).json({ message: 'The student document could not be delivered.' });
      }
    });
  } catch (error) {
    if (error?.code === 'ENOENT') return res.status(404).json({ message: 'Student document file not found.' });
    console.error('Student document download failed:', error?.name || 'download_error');
    return res.status(503).json({ message: 'Student document access could not be verified.' });
  }
});

router.patch('/:studentId/:documentId/archive', async (req, res) => {
  try {
    const { studentId, documentId } = req.params;
    if (!validObjectId(studentId) || !validObjectId(documentId)) {
      return res.status(400).json({ message: 'Invalid student or document ID.' });
    }
    const reason = String(req.body?.reason || '').trim();
    if (reason.length > 250) return res.status(400).json({ message: 'Archive note must be 250 characters or fewer.' });

    const document = await StudentDocument.findOneAndUpdate(
      { _id: documentId, studentId, status: 'active' },
      {
        $set: {
          status: 'archived',
          archivedAt: new Date(),
          archivedBy: req.user._id,
          archiveReason: reason,
        },
      },
      { new: true, runValidators: true },
    );
    if (!document) return res.status(404).json({ message: 'Active student document not found.' });

    try {
      await StudentDocumentAuditEvent.create({
        studentId,
        documentId,
        action: 'archived',
        documentType: document.documentType,
        ...requestAuditDetails(req),
      });
    } catch (auditError) {
      await StudentDocument.updateOne(
        { _id: documentId, studentId, status: 'archived', archivedBy: req.user._id },
        { $set: { status: 'active', archivedAt: null, archivedBy: null, archiveReason: '' } },
      ).catch(() => {});
      throw auditError;
    }

    return res.json({ message: 'Document archived. The original file and audit history have been retained.', document: publicDocument(document) });
  } catch (error) {
    console.error('Student document archive failed:', error?.name || 'archive_error');
    return res.status(500).json({ message: 'Unable to archive this student document.' });
  }
});

module.exports = router;
