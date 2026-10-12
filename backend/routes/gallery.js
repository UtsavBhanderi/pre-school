const express = require('express');
const multer = require('multer');
const path = require('path');
const { addPhoto, getPhotos, updatePhoto, deletePhoto, updateSequence } = require('../controllers/galleryController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/gallery'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
    if (!file.mimetype || !file.mimetype.startsWith('image/') || !allowedExtensions.has(extension)) {
      return cb(new Error('Gallery uploads must be JPG, PNG, WEBP or GIF images.'));
    }
    cb(null, true);
  },
});

router.get('/', getPhotos);
router.post('/', upload.single('photo'), addPhoto);
router.put('/:id', upload.single('photo'), updatePhoto);
router.delete('/:id', deletePhoto);
router.put('/sequence/:id', updateSequence);

module.exports = router;
