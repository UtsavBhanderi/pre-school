const express = require('express');
const multer = require('multer');
const PDF = require('../models/Pdf');
const router = express.Router();

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/pdf/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });

router.get('/', async (req, res) => {
  const pdfs = await PDF.find();  
  res.json(pdfs);
});

router.post('/', upload.single('file'), async (req, res) => {
  const { title, standard, subject, chapter, url } = req.body;
  const filePath = req.file ? req.file.path : null;
  const newPDF = new PDF({ title, standard, subject, chapter, url, filePath });
  await newPDF.save();
  res.json(newPDF);
});

router.put('/:id', upload.single('file'), async (req, res) => {
  const { title, standard, subject, chapter, url } = req.body;
  const filePath = req.file ? req.file.path : null;
  const updatedPDF = await PDF.findByIdAndUpdate(
    req.params.id,
    { title, standard, subject, chapter, url, filePath },
    { new: true }
  );
  res.json(updatedPDF);
});

router.delete('/:id', async (req, res) => {
  await PDF.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

module.exports = router;
