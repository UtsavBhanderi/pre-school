'use strict';

const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const PDF = require('../models/Pdf');

const router = express.Router();
const uploadRoot = path.resolve(__dirname, '../uploads/pdf');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
      return cb(new Error('Only PDF documents can be uploaded.'));
    }
    cb(null, true);
  },
});

const removeUploadedFile = (storedPath) => {
  if (!storedPath) return;
  const absolutePath = path.resolve(__dirname, '..', storedPath);
  if (absolutePath.startsWith(uploadRoot + path.sep) && fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

router.get('/', async (req, res) => {
  try {
    const pdfs = await PDF.find().sort({ standard: 1, subject: 1, title: 1 }).lean();
    return res.json(pdfs);
  } catch (error) {
    console.error('Unable to fetch PDF resources:', error);
    return res.status(500).json({ message: 'Unable to fetch PDF resources.' });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { title, standard, subject, chapter, url } = req.body;
    const trimmedTitle = String(title || '').trim();
    const trimmedUrl = String(url || '').trim();
    if (!trimmedTitle) return res.status(400).json({ message: 'A resource title is required.' });
    if (!req.file && !trimmedUrl) return res.status(400).json({ message: 'Upload a PDF or provide a resource URL.' });

    const newPDF = await PDF.create({
      title: trimmedTitle,
      standard: standard || '',
      subject: subject || '',
      chapter: chapter || '',
      url: req.file ? '' : trimmedUrl,
      filePath: req.file ? `uploads/pdf/${req.file.filename}` : null,
    });
    return res.status(201).json(newPDF);
  } catch (error) {
    console.error('Unable to create PDF resource:', error);
    return res.status(400).json({ message: 'Unable to create PDF resource.' });
  }
});

router.put('/:id', upload.single('file'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid PDF resource ID.' });
    }
    const existing = await PDF.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'PDF resource not found.' });

    const trimmedUrl = String(req.body.url || '').trim();
    const updates = {
      title: req.body.title ?? existing.title,
      standard: req.body.standard ?? existing.standard,
      subject: req.body.subject ?? existing.subject,
      chapter: req.body.chapter ?? existing.chapter,
      url: req.file ? '' : (trimmedUrl ? trimmedUrl : (existing.url || '')),
      filePath: req.file ? `uploads/pdf/${req.file.filename}` : (trimmedUrl ? null : existing.filePath),
    };

    const updatedPDF = await PDF.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if ((req.file || trimmedUrl) && existing.filePath) removeUploadedFile(existing.filePath);
    return res.json(updatedPDF);
  } catch (error) {
    console.error('Unable to update PDF resource:', error);
    return res.status(400).json({ message: 'Unable to update PDF resource.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid PDF resource ID.' });
    }
    const pdf = await PDF.findByIdAndDelete(req.params.id);
    if (!pdf) return res.status(404).json({ message: 'PDF resource not found.' });
    removeUploadedFile(pdf.filePath);
    return res.sendStatus(204);
  } catch (error) {
    console.error('Unable to delete PDF resource:', error);
    return res.status(500).json({ message: 'Unable to delete PDF resource.' });
  }
});

module.exports = router;
