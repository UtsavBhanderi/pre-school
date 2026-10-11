const express = require('express');
const multer = require('multer');
const Teacher = require('../models/Teacher');
const router = express.Router();
// const Sequence = require('../models/sequence');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/teachers');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// const generateStudentNumber = async (firstName, middleName, lastName) => {
//   const currentYear = new Date().getFullYear().toString().slice(-2);
//   const initials = `${firstName[0]}${middleName[0]}${lastName[0]}`.toUpperCase();

//   // Find or create the sequence for the current year
//   let sequence = await Sequence.findOne({ year: currentYear });
//   if (!sequence) {
//     sequence = new Sequence({ year: currentYear, seq: 0 });
//   }

//   sequence.seq += 1;
//   await sequence.save();

//   const seqNumber = sequence.seq.toString().padStart(3, '0');
//   return `${currentYear}${initials}${seqNumber}`;
// };





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
        const { firstName, middleName, lastName } = req.body;
        // const stuNo = await generateStudentNumber(firstName, middleName, lastName);

        const batchYear = new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);

        const newTeacher = new Teacher({
            ...req.body,
            selfPhoto: req.files.selfPhoto[0].path,
            motherPhoto: req.files.motherPhoto[0].path,
            fatherPhoto: req.files.fatherPhoto[0].path,
            // stuNo,
            batchYear
        });
        await newTeacher.save();
        res.status(201).send('Teacher registered successfully');
    } catch (error) {
        console.log(error, "Teacher.js catch routs backend post");
        res.status(400).send(error);
    }
});

// Update a teacher
router.put('/:id', upload.fields([{ name: 'selfPhoto' }, { name: 'motherPhoto' }, { name: 'fatherPhoto' }]), async (req, res) => {
    try {
        const updatedTeacher = {
            ...req.body,
        };
        if (req.files.selfPhoto) {
            updatedTeacher.selfPhoto = req.files.selfPhoto[0].path;
        }
        if (req.files.motherPhoto) {
            updatedTeacher.motherPhoto = req.files.motherPhoto[0].path;
        }
        if (req.files.fatherPhoto) {
            updatedTeacher.fatherPhoto = req.files.fatherPhoto[0].path;
        }

        await Teacher.findByIdAndUpdate(req.params.id, updatedTeacher);
        res.status(200).send('Teacher updated successfully');
    } catch (error) {
        res.status(400).send(error);
    }
});

// Delete a teacher
router.delete('/:id', async (req, res) => {
    try {
        await Teacher.findByIdAndDelete(req.params.id);
        res.status(200).send('Teacher deleted successfully');
    } catch (error) {
        res.status(400).send(error);
    }
});


// // Helper function to get start and end dates for filters
// const getStartAndEndDates = (dateFilter) => {
//     const now = new Date();
//     let start, end;

//     switch (dateFilter) {
//         case 'today':
//             start = new Date(now.setHours(0, 0, 0, 0));
//             end = new Date(now.setHours(23, 59, 59, 999));
//             break;
//         case 'thisWeek':
//             const dayOfWeek = now.getDay();
//             start = new Date(now.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)));
//             start.setHours(0, 0, 0, 0);
//             end = new Date(start);
//             end.setDate(end.getDate() + 6);
//             end.setHours(23, 59, 59, 999);
//             break;
//         case 'thisMonth':
//             start = new Date(now.getFullYear(), now.getMonth(), 1);
//             end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
//             end.setHours(23, 59, 59, 999);
//             break;
//         default:
//             // If a specific date is passed
//             start = new Date(dateFilter);
//             start.setHours(0, 0, 0, 0);
//             end = new Date(start);
//             end.setHours(23, 59, 59, 999);
//             break;
//     }

//     return { start, end };
// };


router.get('/birthdays', async (req, res) => {
    try {
        const teachers = await Teacher.find({});
        res.json(teachers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;
