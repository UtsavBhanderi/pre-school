'use strict';

const express = require('express');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const ReportCard = require('../models/ReportCard');
const { escapeRegExp } = require('../utils/legacyTeacherClass');

const router = express.Router();

function validateSubjectInput(input, requireStandard) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const unsupported = Object.keys(body).filter((key) => !['standard', 'subjects'].includes(key));
  if (unsupported.length) {
    return { valid: false, message: 'Only class / standard and subjects may be provided.' };
  }

  const standard = typeof body.standard === 'string' ? body.standard.trim() : '';
  if (requireStandard && (!standard || standard.length > 60)) {
    return { valid: false, message: 'Choose a class / standard between 1 and 60 characters.' };
  }

  if (!Array.isArray(body.subjects) || body.subjects.length < 1 || body.subjects.length > 30) {
    return { valid: false, message: 'Add between 1 and 30 subjects for this class.' };
  }

  const subjects = [];
  const seen = new Set();
  for (const item of body.subjects) {
    if (typeof item !== 'string') return { valid: false, message: 'Every subject name must be text.' };
    const name = item.trim();
    if (name.length < 2 || name.length > 80) {
      return { valid: false, message: 'Each subject name must contain 2 to 80 characters.' };
    }
    const key = name.toLocaleLowerCase('en-IN');
    if (seen.has(key)) return { valid: false, message: 'Subject names must be unique within a class.' };
    seen.add(key);
    subjects.push(name);
  }

  return { valid: true, value: { standard, subjects } };
}

function standardFilter(standard) {
  return { standard: { $regex: '^' + escapeRegExp(standard) + '$', $options: 'i' } };
}

async function withUsageStatus(config) {
  const [hasSavedMarks, hasReportTemplates] = await Promise.all([
    Student.exists({ standard: config.standard, 'marks.0': { $exists: true } }),
    ReportCard.exists({ standard: config.standard }),
  ]);
  return {
    ...config,
    hasSavedMarks: Boolean(hasSavedMarks),
    hasReportTemplates: Boolean(hasReportTemplates),
  };
}

// GET /api/subjects - list all configured classes for the admin setup screen.
router.get('/', async (req, res) => {
  try {
    const configs = await Subject.find({}).sort({ standard: 1 }).lean();
    const result = await Promise.all(configs.map(withUsageStatus));
    return res.json(result);
  } catch (error) {
    console.error('Unable to list subject configurations:', error?.name || 'query_error');
    return res.status(503).json({ message: 'Subject configurations could not be loaded.' });
  }
});

// GET /api/subjects/:standard - retrieve the subjects for one class.
router.get('/:standard', async (req, res) => {
  const standard = String(req.params.standard || '').trim();
  if (!standard || standard.length > 60) {
    return res.status(400).json({ message: 'Choose a valid class / standard.' });
  }
  try {
    const config = await Subject.findOne(standardFilter(standard)).lean();
    if (!config) return res.status(404).json({ message: 'No subjects have been configured for this class yet.' });
    return res.json(await withUsageStatus(config));
  } catch (error) {
    console.error('Unable to load class subjects:', error?.name || 'query_error');
    return res.status(503).json({ message: 'Class subjects could not be loaded.' });
  }
});

// POST /api/subjects - create the first subject list for a class.
router.post('/', async (req, res) => {
  const validation = validateSubjectInput(req.body, true);
  if (!validation.valid) return res.status(400).json({ message: validation.message });

  try {
    const duplicate = await Subject.exists(standardFilter(validation.value.standard));
    if (duplicate) {
      return res.status(409).json({ code: 'SUBJECT_CONFIG_EXISTS', message: 'Subjects are already configured for this class. Open the existing class configuration to review it.' });
    }

    const created = await Subject.create(validation.value);
    return res.status(201).json({ ...created.toObject(), hasSavedMarks: false, hasReportTemplates: false });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Subjects are already configured for this class.' });
    console.error('Unable to create class subjects:', error?.name || 'create_error');
    return res.status(503).json({ message: 'Class subjects could not be saved.' });
  }
});

// PUT /api/subjects/:standard - update subjects only before marks are saved.
router.put('/:standard', async (req, res) => {
  const standard = String(req.params.standard || '').trim();
  if (!standard || standard.length > 60) return res.status(400).json({ message: 'Choose a valid class / standard.' });
  const validation = validateSubjectInput({ ...req.body, standard }, false);
  if (!validation.valid) return res.status(400).json({ message: validation.message });

  try {
    const existing = await Subject.findOne(standardFilter(standard));
    if (!existing) return res.status(404).json({ message: 'Subject configuration not found.' });

    const hasSavedMarks = await Student.exists({ standard: existing.standard, 'marks.0': { $exists: true } });
    if (hasSavedMarks) {
      return res.status(409).json({
        code: 'SUBJECT_HISTORY_PRESERVED',
        message: 'Subjects cannot be changed after marks have been saved for this class. Keep the historical subject list intact.',
      });
    }

    existing.subjects = validation.value.subjects;
    await existing.save();
    return res.json(await withUsageStatus(existing.toObject()));
  } catch (error) {
    console.error('Unable to update class subjects:', error?.name || 'update_error');
    return res.status(503).json({ message: 'Class subjects could not be updated.' });
  }
});

// DELETE /api/subjects/:standard - remove only unused configurations.
router.delete('/:standard', async (req, res) => {
  const standard = String(req.params.standard || '').trim();
  if (!standard || standard.length > 60) return res.status(400).json({ message: 'Choose a valid class / standard.' });
  try {
    const existing = await Subject.findOne(standardFilter(standard));
    if (!existing) return res.status(404).json({ message: 'Subject configuration not found.' });

    const [hasSavedMarks, hasReportTemplates] = await Promise.all([
      Student.exists({ standard: existing.standard, 'marks.0': { $exists: true } }),
      ReportCard.exists({ standard: existing.standard }),
    ]);
    if (hasSavedMarks || hasReportTemplates) {
      return res.status(409).json({
        code: 'SUBJECT_HISTORY_PRESERVED',
        message: hasSavedMarks
          ? 'This class has saved student marks. Its subject configuration cannot be deleted.'
          : 'This class already has report card templates. Keep its subject configuration so those reports remain usable.',
      });
    }

    await Subject.deleteOne({ _id: existing._id });
    return res.json({ message: 'Unused subject configuration deleted.' });
  } catch (error) {
    console.error('Unable to delete class subjects:', error?.name || 'delete_error');
    return res.status(503).json({ message: 'Subject configuration could not be deleted.' });
  }
});

module.exports = router;
