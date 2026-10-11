const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getAllVideos, createVideo, updateVideo, deleteVideo } = require('../controllers/videoController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/video');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

router.get('/', getAllVideos);
router.post('/', upload.single('file'), createVideo);
router.put('/:id', upload.single('file'), updateVideo);
router.delete('/:id', deleteVideo);

module.exports = router;
