const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getAllVideos, createVideo, updateVideo, deleteVideo } = require('../controllers/videoController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/video'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(path.basename(file.originalname))}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('video/')) {
      return cb(new Error('Only video files can be uploaded in this section.'));
    }
    cb(null, true);
  },
});

router.get('/', getAllVideos);
router.post('/', upload.single('file'), createVideo);
router.put('/:id', upload.single('file'), updateVideo);
router.delete('/:id', deleteVideo);

module.exports = router;
