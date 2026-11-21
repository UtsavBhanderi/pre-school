'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const PDF = require('../models/Pdf');
const { verifyUploadContent } = require('../middleware/verifyUploadContent');
const { removeManagedUploadFile } = require('../utils/uploadFileStorage');

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

const removeUploadedFile = (storedPath) => removeManagedUploadFile(uploadRoot, storedPath);

const cleanText = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const isHttpUrl = (value) => {
  if (!value) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
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

router.post('/', upload.single('file'), verifyUploadContent('pdf'), async (req, res) => {
  const title = cleanText(req.body?.title, 150);
  const standard = cleanText(req.body?.standard, 60);
  const subject = cleanText(req.body?.subject, 80);
  const chapter = cleanText(req.body?.chapter, 120);
  const url = cleanText(req.body?.url, 2048);
  if (!title) { await removeUploadedFile(req.file?.path); return res.status(400).json({ message: 'A resource title is required.' }); }
  if (!req.file && !url) return res.status(400).json({ message: 'Upload a PDF or provide a resource URL.' });
  if (!isHttpUrl(url)) { await removeUploadedFile(req.file?.path); return res.status(400).json({ message: 'Enter a valid HTTP or HTTPS resource URL.' }); }
  try {
    const newPDF = await PDF.create({
      title, standard, subject, chapter,
      url: req.file ? '' : url,
      filePath: req.file ? 'uploads/pdf/' + req.file.filename : null,
    });
    return res.status(201).json(newPDF);
  } catch (error) {
    await removeUploadedFile(req.file?.path);
    console.error('Unable to create PDF resource:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Unable to create PDF resource. Please try again.' });
  }
});

router.put('/:id', upload.single('file'), verifyUploadContent('pdf'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    await removeUploadedFile(req.file?.path);
    return res.status(400).json({ message: 'Invalid PDF resource ID.' });
  }
  try {
    const existing = await PDF.findById(req.params.id);
    if (!existing) {
      await removeUploadedFile(req.file?.path);
      return res.status(404).json({ message: 'PDF resource not found.' });
    }
    const title = req.body?.title === undefined ? existing.title : cleanText(req.body.title, 150);
    const urlProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'url');
    const trimmedUrl = urlProvided ? cleanText(req.body.url, 2048) : (existing.url || '');
    if (!title) { await removeUploadedFile(req.file?.path); return res.status(400).json({ message: 'A resource title is required.' }); }
    if (!req.file && urlProvided && !trimmedUrl) return res.status(400).json({ message: 'Enter a resource URL or upload a PDF file.' });
    if (!isHttpUrl(trimmedUrl)) { await removeUploadedFile(req.file?.path); return res.status(400).json({ message: 'Enter a valid HTTP or HTTPS resource URL.' }); }
    const updates = {
      title,
      standard: req.body?.standard === undefined ? existing.standard : cleanText(req.body.standard, 60),
      subject: req.body?.subject === undefined ? existing.subject : cleanText(req.body.subject, 80),
      chapter: req.body?.chapter === undefined ? existing.chapter : cleanText(req.body.chapter, 120),
      url: req.file ? '' : (urlProvided ? trimmedUrl : (existing.url || '')),
      filePath: req.file ? 'uploads/pdf/' + req.file.filename : (urlProvided ? null : existing.filePath),
    };
    const updatedPDF = await PDF.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!updatedPDF) {
      await removeUploadedFile(req.file?.path);
      return res.status(404).json({ message: 'PDF resource not found.' });
    }
    if ((req.file || urlProvided) && existing.filePath) await removeUploadedFile(existing.filePath);
    return res.json(updatedPDF);
  } catch (error) {
    await removeUploadedFile(req.file?.path);
    console.error('Unable to update PDF resource:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Unable to update PDF resource. Please try again.' });
  }
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid PDF resource ID.' });
  try {
    const pdf = await PDF.findByIdAndDelete(req.params.id);
    if (!pdf) return res.status(404).json({ message: 'PDF resource not found.' });
    if (pdf.filePath) await removeUploadedFile(pdf.filePath);
    return res.sendStatus(204);
  } catch (error) {
    console.error('Unable to delete PDF resource:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Unable to delete PDF resource.' });
  }
});

module.exports = router;
