const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const Teacher = require('../models/Teacher');
const router = express.Router();
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/teachers'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_'));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            return cb(new Error('Teacher photographs must be image files.'));
        }
        cb(null, true);
    },
});


// Get all teachers
router.get('/', async (req, res) => {
    try {
        const teachers = await Teacher.find();
        res.json(teachers);
    } catch (error) {
        res.status(500).send(error);
    }
});

// Create a new teacher
router.post('/', upload.fields([{ name: 'selfPhoto' }, { name: 'motherPhoto' }, { name: 'fatherPhoto' }]), async (req, res) => {
    try {
        const batchYear = new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);

        const newTeacher = new Teacher({
            ...req.body,
            selfPhoto: req.files?.selfPhoto?.[0] ? `uploads/teachers/${req.files.selfPhoto[0].filename}` : undefined,
            motherPhoto: req.files?.motherPhoto?.[0] ? `uploads/teachers/${req.files.motherPhoto[0].filename}` : undefined,
            fatherPhoto: req.files?.fatherPhoto?.[0] ? `uploads/teachers/${req.files.fatherPhoto[0].filename}` : undefined,
            // stuNo,
            batchYear
        });
        await newTeacher.save();
        res.status(201).send('Teacher registered successfully');
    } catch (error) {
        console.error('Teacher registration failed:', error);
        res.status(400).json({ message: 'Unable to register teacher.' });
    }
});

// Update a teacher
router.put('/:id', upload.fields([
    { name: 'selfPhoto', maxCount: 1 },
    { name: 'motherPhoto', maxCount: 1 },
    { name: 'fatherPhoto', maxCount: 1 },
]), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid teacher ID.' });
        }

        const updatedTeacher = { ...req.body };
        const files = req.files || {};
        if (files.selfPhoto?.[0]) updatedTeacher.selfPhoto = `uploads/teachers/${files.selfPhoto[0].filename}`;
        if (files.motherPhoto?.[0]) updatedTeacher.motherPhoto = `uploads/teachers/${files.motherPhoto[0].filename}`;
        if (files.fatherPhoto?.[0]) updatedTeacher.fatherPhoto = `uploads/teachers/${files.fatherPhoto[0].filename}`;

        const teacher = await Teacher.findByIdAndUpdate(
            req.params.id,
            { $set: updatedTeacher },
            { new: true, runValidators: true }
        );
        if (!teacher) return res.status(404).json({ message: 'Teacher not found.' });
        return res.json({ message: 'Teacher updated successfully.', teacher });
    } catch (error) {
        console.error('Teacher update failed:', error);
        return res.status(400).json({ message: 'Unable to update teacher.' });
    }
});

// Delete a teacher
router.delete('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid teacher ID.' });
        }
        const teacher = await Teacher.findByIdAndDelete(req.params.id);
        if (!teacher) return res.status(404).json({ message: 'Teacher not found.' });
        return res.json({ message: 'Teacher deleted successfully.' });
    } catch (error) {
        console.error('Teacher deletion failed:', error);
        return res.status(500).json({ message: 'Unable to delete teacher.' });
    }
});


router.get('/birthdays', async (req, res) => {
    try {
        const teachers = await Teacher.find({});
        res.json(teachers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;
