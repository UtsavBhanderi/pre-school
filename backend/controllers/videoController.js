// backend/controllers/videoController.js
const Video = require('../models/Video');
const path = require('path');
const fs = require('fs');

exports.getAllVideos = async (req, res) => {
  try {
    const videos = await Video.find();
    res.json(videos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createVideo = async (req, res) => {
  const { title, standard, subject, chapter, url } = req.body;
  let filePath = '';
  if (req.file) {
    filePath = `uploads/video/${req.file.filename}`;
  }

  const video = new Video({
    title,
    standard,
    subject,
    chapter,
    url,
    filePath,
  });

  try {
    const newVideo = await video.save();
    res.status(201).json(newVideo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    const { title, standard, subject, chapter, url } = req.body;
    video.title = title ?? video.title;
    video.standard = standard ?? video.standard;
    video.subject = subject ?? video.subject;
    video.chapter = chapter ?? video.chapter;

    if (req.file) {
      if (video.filePath) {
        const oldPath = path.resolve(__dirname, '..', video.filePath);
        const uploadRoot = path.resolve(__dirname, '../uploads/video');
        if (oldPath.startsWith(uploadRoot) && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      video.filePath = `uploads/video/${req.file.filename}`;
      video.url = '';
    } else if (typeof url === 'string' && url.trim()) {
      video.url = url.trim();
      video.filePath = '';
    }

    const updatedVideo = await video.save();
    return res.json(updatedVideo);
  } catch (err) {
    console.error('Video resource update failed:', err);
    return res.status(400).json({ message: 'Unable to update video resource.' });
  }
};

exports.deleteVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Delete the video file if it exists
    if (video.filePath) {
      const filePath = path.join(__dirname, '..', video.filePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Use findByIdAndDelete to delete the document
    await Video.findByIdAndDelete(req.params.id);

    res.json({ message: 'Video deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
