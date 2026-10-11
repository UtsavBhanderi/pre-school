const express = require('express');
const multer = require('multer');
const { addPhoto, getPhotos, updatePhoto, deletePhoto, updateSequence } = require('../controllers/galleryController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/gallery');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

router.get('/', getPhotos);
router.post('/', upload.single('photo'), addPhoto);
router.put('/:id', upload.single('photo'), updatePhoto);
router.delete('/:id', deletePhoto);
router.put('/sequence/:id', updateSequence);

module.exports = router;
