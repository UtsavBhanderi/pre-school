'use strict';

const mongoose = require('mongoose');
const path = require('path');
const Video = require('../models/Video');
const { removeManagedUploadFile } = require('../utils/uploadFileStorage');

const uploadRoot = path.resolve(__dirname, '../uploads/video');
const videoFilePath = (file) => file ? 'uploads/video/' + file.filename : '';
const cleanText = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const validExternalUrl = (value) => {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch { return false; }
};

exports.getAllVideos = async (_req, res) => {
  try {
    const videos = await Video.find().sort({ standard: 1, subject: 1, title: 1 }).lean();
    return res.json(videos);
  } catch (error) {
    console.error('Unable to load videos:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Video resources could not be loaded.' });
  }
};

exports.createVideo = async (req, res) => {
  const title = cleanText(req.body?.title, 120);
  const standard = cleanText(req.body?.standard, 60);
  const subject = cleanText(req.body?.subject, 80);
  const chapter = cleanText(req.body?.chapter, 120);
  const url = cleanText(req.body?.url, 2048);
  if (!title) { await removeManagedUploadFile(uploadRoot, req.file?.path); return res.status(400).json({ message: 'A video title is required.' }); }
  if (!req.file && !url) return res.status(400).json({ message: 'Upload a video or provide a resource URL.' });
  if (!validExternalUrl(url)) { await removeManagedUploadFile(uploadRoot, req.file?.path); return res.status(400).json({ message: 'Enter a valid HTTP or HTTPS video URL.' }); }
  try {
    const video = await Video.create({ title, standard, subject, chapter, url: req.file ? '' : url, filePath: videoFilePath(req.file) });
    return res.status(201).json(video);
  } catch (error) {
    await removeManagedUploadFile(uploadRoot, req.file?.path);
    console.error('Unable to create video resource:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The video resource could not be saved.' });
  }
};

exports.updateVideo = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) { await removeManagedUploadFile(uploadRoot, req.file?.path); return res.status(400).json({ message: 'Choose a valid video resource.' }); }
  try {
    const video = await Video.findById(req.params.id);
    if (!video) { await removeManagedUploadFile(uploadRoot, req.file?.path); return res.status(404).json({ message: 'Video resource not found.' }); }
    const previousFilePath = video.filePath;
    const title = req.body?.title === undefined ? video.title : cleanText(req.body.title, 120);
    const url = req.body?.url === undefined ? video.url : cleanText(req.body.url, 2048);
    if (!title) { await removeManagedUploadFile(uploadRoot, req.file?.path); return res.status(400).json({ message: 'A video title is required.' }); }
    if (!validExternalUrl(url)) { await removeManagedUploadFile(uploadRoot, req.file?.path); return res.status(400).json({ message: 'Enter a valid HTTP or HTTPS video URL.' }); }
    video.title = title;
    if (req.body?.standard !== undefined) video.standard = cleanText(req.body.standard, 60);
    if (req.body?.subject !== undefined) video.subject = cleanText(req.body.subject, 80);
    if (req.body?.chapter !== undefined) video.chapter = cleanText(req.body.chapter, 120);
    if (req.file) { video.filePath = videoFilePath(req.file); video.url = ''; }
    else if (req.body?.url !== undefined) { video.url = url; video.filePath = ''; }
    await video.save();
    if (previousFilePath && (req.file || (req.body?.url !== undefined && video.url))) await removeManagedUploadFile(uploadRoot, previousFilePath);
    return res.json(video);
  } catch (error) {
    await removeManagedUploadFile(uploadRoot, req.file?.path);
    console.error('Video resource update failed:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The video resource could not be updated.' });
  }
};

exports.deleteVideo = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid video resource.' });
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) return res.status(404).json({ message: 'Video resource not found.' });
    if (video.filePath) await removeManagedUploadFile(uploadRoot, video.filePath);
    return res.json({ message: 'Video resource deleted successfully.' });
  } catch (error) {
    console.error('Video resource deletion failed:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The video resource could not be deleted.' });
  }
};
