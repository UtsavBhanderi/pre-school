const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const Teacher = require('../models/Teacher');
const User = require('../models/User');
const router = express.Router();
const { verifyUploadContent } = require('../middleware/verifyUploadContent');
const { TEACHER_PROFILE_FIELDS, pickProfileFields } = require('../utils/legacyProfileFields');
const { escapeRegExp } = require('../utils/legacyTeacherClass');
const { removeManagedUploadFile } = require('../utils/uploadFileStorage');
const uploadRoot = path.resolve(__dirname, '../uploads/teachers');

async function cleanupRequestUploads(req) {
    const files = Object.values(req.files || {}).flat().filter(Boolean);
    await Promise.all(files.map((file) => removeManagedUploadFile(uploadRoot, file.path)));
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadRoot);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_'));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 50, parts: 53 },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
        if (!allowedExtensions.has(extension)) {
            return cb(new Error('Teacher photographs must be JPG, PNG, WEBP or GIF images.'));
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
router.post('/', upload.fields([{ name: 'selfPhoto', maxCount: 1 }, { name: 'motherPhoto', maxCount: 1 }, { name: 'fatherPhoto', maxCount: 1 }]), verifyUploadContent('teachers'), async (req, res) => {
    try {
        const batchYear = new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);

        const profileData = pickProfileFields(req.body, TEACHER_PROFILE_FIELDS);
        if (profileData.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.Email)) {
            await cleanupRequestUploads(req);
            return res.status(400).json({ message: 'Enter a valid teacher email address.' });
        }
        if (profileData.Email) {
            profileData.Email = profileData.Email.toLowerCase();
            const duplicateEmail = await Teacher.exists({
                Email: { $regex: '^' + escapeRegExp(profileData.Email) + '$', $options: 'i' },
            });
            if (duplicateEmail) {
                await cleanupRequestUploads(req);
                return res.status(409).json({ message: 'A teacher profile with this email address already exists.' });
            }
        }

        const newTeacher = new Teacher({
            ...profileData,
            selfPhoto: req.files?.selfPhoto?.[0] ? `uploads/teachers/${req.files.selfPhoto[0].filename}` : undefined,
            motherPhoto: req.files?.motherPhoto?.[0] ? `uploads/teachers/${req.files.motherPhoto[0].filename}` : undefined,
            fatherPhoto: req.files?.fatherPhoto?.[0] ? `uploads/teachers/${req.files.fatherPhoto[0].filename}` : undefined,
            // stuNo,
            batchYear
        });
        await newTeacher.save();
        res.status(201).send('Teacher registered successfully');
    } catch (error) {
        await cleanupRequestUploads(req);
        console.error('Teacher registration failed:', error);
        res.status(400).json({ message: 'Unable to register teacher.' });
    }
});

// Update a teacher
router.put('/:id', upload.fields([
    { name: 'selfPhoto', maxCount: 1 },
    { name: 'motherPhoto', maxCount: 1 },
    { name: 'fatherPhoto', maxCount: 1 },
]), verifyUploadContent('teachers'), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            await cleanupRequestUploads(req);
            return res.status(400).json({ message: 'Invalid teacher ID.' });
        }

        const updatedTeacher = pickProfileFields(req.body, TEACHER_PROFILE_FIELDS);
        const files = req.files || {};
        if (files.selfPhoto?.[0]) updatedTeacher.selfPhoto = `uploads/teachers/${files.selfPhoto[0].filename}`;
        if (files.motherPhoto?.[0]) updatedTeacher.motherPhoto = `uploads/teachers/${files.motherPhoto[0].filename}`;
        if (files.fatherPhoto?.[0]) updatedTeacher.fatherPhoto = `uploads/teachers/${files.fatherPhoto[0].filename}`;
        if (updatedTeacher.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updatedTeacher.Email)) {
            await cleanupRequestUploads(req);
            return res.status(400).json({ message: 'Enter a valid teacher email address.' });
        }
        if (updatedTeacher.Email) {
            updatedTeacher.Email = updatedTeacher.Email.toLowerCase();
            const duplicateEmail = await Teacher.exists({
                Email: { $regex: '^' + escapeRegExp(updatedTeacher.Email) + '$', $options: 'i' },
                _id: { $ne: req.params.id },
            });
            if (duplicateEmail) {
                await cleanupRequestUploads(req);
                return res.status(409).json({ message: 'A teacher profile with this email address already exists.' });
            }
        }
        if (Object.keys(updatedTeacher).length === 0) {
            await cleanupRequestUploads(req);
            return res.status(400).json({ message: 'No supported teacher details were provided to update.' });
        }

        const teacher = await Teacher.findByIdAndUpdate(
            req.params.id,
            { $set: updatedTeacher },
            { new: true, runValidators: true }
        );
        if (!teacher) { await cleanupRequestUploads(req); return res.status(404).json({ message: 'Teacher not found.' }); }
        return res.json({ message: 'Teacher updated successfully.', teacher });
    } catch (error) {
        await cleanupRequestUploads(req);
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
        const teacher = await Teacher.findById(req.params.id);
        if (!teacher) return res.status(404).json({ message: 'Teacher not found.' });

        // Removing a teacher profile also offboards the linked login.
        let loginAccessRevoked = false;
        const teacherEmail = String(teacher.Email || '').trim().toLowerCase();
        if (teacherEmail) {
            const result = await User.updateOne(
                { email: teacherEmail, role: 'teacher' },
                { $set: { status: 'suspended' }, $inc: { authVersion: 1 } },
            );
            loginAccessRevoked = result.matchedCount > 0;
        }

        await teacher.deleteOne();
        return res.json({
            message: loginAccessRevoked
                ? 'Teacher profile deleted and linked login access suspended.'
                : 'Teacher profile deleted.',
            loginAccessRevoked,
        });
    } catch (error) {
        console.error('Teacher deletion failed:', error?.name || 'database_error');
        return res.status(500).json({ message: 'Unable to delete teacher.' });
    }
});


router.get('/birthdays', async (req, res) => {
    try {
        // Birthday views need only identity and calendar fields, not private
        // home address, family contacts, emergency numbers or licence details.
        const teachers = await Teacher.find({})
            .select('_id firstName middleName lastName dob standard GR_No selfPhoto')
            .lean();
        return res.json(teachers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;
