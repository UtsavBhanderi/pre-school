const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getAllVideos, createVideo, updateVideo, deleteVideo } = require('../controllers/videoController');
const { verifyUploadContent } = require('../middleware/verifyUploadContent');

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
    const extension = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv']);
    if (!allowedExtensions.has(extension)) {
      return cb(new Error('Upload an MP4, WEBM, MOV, M4V or OGV video file.'));
    }
    cb(null, true);
  },
});

router.get('/', getAllVideos);
router.post('/', upload.single('file'), verifyUploadContent('video'), createVideo);
router.put('/:id', upload.single('file'), verifyUploadContent('video'), updateVideo);
router.delete('/:id', deleteVideo);

module.exports = router;
