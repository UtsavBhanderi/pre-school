'use strict';

const mongoose = require('mongoose');
const path = require('path');
const Photo = require('../models/Photo');
const { removeManagedUploadFile } = require('../utils/uploadFileStorage');

const uploadRoot = path.resolve(__dirname, '../uploads/gallery');
const photoFilePath = (file) => file ? '/uploads/gallery/' + file.filename : '';

const addPhoto = async (req, res) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    if (title.length > 120 || description.length > 1000) {
      await removeManagedUploadFile(uploadRoot, req.file?.path);
      return res.status(400).json({ message: 'Photo title must be under 120 characters and description under 1,000 characters.' });
    }
    const photo = await Photo.create({ title, description, url: photoFilePath(req.file), sequence: String(req.body.sequence ?? '0').slice(0, 20) });
    return res.status(201).json(photo);
  } catch (error) {
    await removeManagedUploadFile(uploadRoot, req.file?.path);
    console.error('Unable to add gallery photo:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The gallery photo could not be saved. Please try again.' });
  }
};

const getPhotos = async (_req, res) => {
  try {
    const photos = await Photo.find().sort({ sequence: 1, _id: 1 }).lean();
    return res.status(200).json(photos);
  } catch (error) {
    console.error('Unable to load gallery photos:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Gallery photos could not be loaded.' });
  }
};

const updatePhoto = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    await removeManagedUploadFile(uploadRoot, req.file?.path);
    return res.status(400).json({ message: 'Choose a valid gallery photo.' });
  }
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) {
      await removeManagedUploadFile(uploadRoot, req.file?.path);
      return res.status(404).json({ message: 'Gallery photo not found.' });
    }
    const oldUrl = photo.url;
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : photo.title;
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : photo.description;
    const sequence = req.body.sequence === undefined ? photo.sequence : String(req.body.sequence).slice(0, 20);
    if (String(title || '').length > 120 || String(description || '').length > 1000) {
      await removeManagedUploadFile(uploadRoot, req.file?.path);
      return res.status(400).json({ message: 'Photo title must be under 120 characters and description under 1,000 characters.' });
    }
    photo.title = title;
    photo.description = description;
    photo.sequence = sequence;
    if (req.file) photo.url = photoFilePath(req.file);
    await photo.save();
    if (req.file && oldUrl && oldUrl !== photo.url) await removeManagedUploadFile(uploadRoot, oldUrl);
    return res.status(200).json(photo);
  } catch (error) {
    await removeManagedUploadFile(uploadRoot, req.file?.path);
    console.error('Unable to update gallery photo:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The gallery photo could not be updated. Please try again.' });
  }
};

const deletePhoto = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid gallery photo.' });
  try {
    const photo = await Photo.findByIdAndDelete(req.params.id);
    if (!photo) return res.status(404).json({ message: 'Gallery photo not found.' });
    if (photo.url) await removeManagedUploadFile(uploadRoot, photo.url);
    return res.status(200).json({ message: 'Gallery photo deleted.' });
  } catch (error) {
    console.error('Unable to delete gallery photo:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The gallery photo could not be deleted.' });
  }
};

const updateSequence = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid gallery photo.' });
  const sequence = req.body?.sequence;
  if (sequence === undefined || !/^\d{1,10}$/.test(String(sequence))) return res.status(400).json({ message: 'Enter a valid photo display order.' });
  try {
    const photo = await Photo.findByIdAndUpdate(req.params.id, { $set: { sequence: String(sequence) } }, { new: true, runValidators: true });
    if (!photo) return res.status(404).json({ message: 'Gallery photo not found.' });
    return res.status(200).json(photo);
  } catch (error) {
    console.error('Unable to update gallery sequence:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The gallery display order could not be updated.' });
  }
};

module.exports = { addPhoto, getPhotos, updatePhoto, deletePhoto, updateSequence };
