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
    filePath = path.join('uploads/video', req.file.filename);
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
    video.title = title;
    video.standard = standard;
    video.subject = subject;
    video.chapter = chapter;

    if (req.file) {
      // Delete the old file if exists
      if (video.filePath) {
        fs.unlinkSync(video.filePath);
      }
      video.filePath = path.join('uploads/video', req.file.filename);
      video.url = '';
    } else {
      video.url = url;
      video.filePath = '';
    }

    const updatedVideo = await video.save();
    res.json(updatedVideo);
  } catch (err) {
    res.status(400).json({ message: err.message });
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
