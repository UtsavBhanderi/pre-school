const Photo = require('../models/Photo');
const fs = require('fs');
const path = require('path');

const addPhoto = async (req, res) => {
  try {
    const { title, description, sequence } = req.body;
    const url = req.file ? `/uploads/gallery/${req.file.filename}` : '';
    const newPhoto = new Photo({ title, description, url, sequence });
    await newPhoto.save();
    res.status(201).json(newPhoto);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add photo' });
  }
};

// const getPhotos = async (req, res) => {
//   try {
//     const photos = await Photo.find();
//     res.status(200).json(photos);
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to fetch photos' });
//   }
// };

const getPhotos = async (req, res) => {
  try {
    const photos = await Photo.find().sort({ sequence: 1 }); // Sort by sequence
    res.status(200).json(photos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
};

const updatePhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, sequence } = req.body;
    const photo = await Photo.findById(id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    if (req.file) {
      if (photo.url) {
        fs.unlinkSync(path.join(__dirname, '..', photo.url));
      }
      photo.url = `/uploads/gallery/${req.file.filename}`;
    }
    photo.title = title;
    photo.description = description;
    photo.sequence = sequence;

    await photo.save();
    res.status(200).json(photo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update photo' });
  }
};

const deletePhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const photo = await Photo.findByIdAndDelete(id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    if (photo.url) {
      fs.unlinkSync(path.join(__dirname, '..', photo.url));
    }

    res.status(200).json({ message: 'Photo deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete photo' });
  }
};

const updateSequence = async (req, res) => {
  try {
    const { id } = req.params;
    const { sequence } = req.body;
    const photo = await Photo.findById(id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    photo.sequence = sequence;
    await photo.save();

    res.status(200).json(photo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update photo sequence' });
  }
};

module.exports = { addPhoto, getPhotos, updatePhoto, deletePhoto, updateSequence };
