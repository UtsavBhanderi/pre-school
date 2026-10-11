// routes/subjectRoutes.js
const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');

// Get subjects for a specific standard
router.get('/:standard', async (req, res) => {
  try {
    const standard = req.params.standard;
    const subjectData = await Subject.findOne({ standard: standard });

    if (!subjectData) {
      return res.status(404).json({ message: 'No subjects found for this standard' });
    }
    res.json(subjectData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create subjects for a new standard
router.post('/', async (req, res) => {
  const { standard, subjects } = req.body;

  if (!standard || !subjects) {
    return res.status(400).json({ message: 'Standard and subjects are required' });
  }

  try {
    const newSubject = new Subject({ standard, subjects });
    await newSubject.save();
    res.status(201).json(newSubject);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
