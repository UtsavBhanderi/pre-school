const express = require('express');
const router = express.Router();
const adminOnly = require('../middleware/adminOnly');
const DailyWorkReport = require('../models/DailyWorkReport');
const { getLegacyTeacherScope } = require('../utils/legacyTeacherClass');
const { validateDailyWorkReport } = require('../utils/dailyWorkReportValidation');

// POST /api/dailyWorkReport - Create a new daily work report
router.post('/', async (req, res) => {
  try {
    const requestedStandard = typeof req.body?.standard === 'string' ? req.body.standard.trim() : '';
    const scope = await getLegacyTeacherScope(req.user, requestedStandard);
    if (!scope.allowed) return res.status(403).json({ code: scope.code, message: scope.message });
    const validation = validateDailyWorkReport(req.body || {}, scope.isTeacher ? scope.standard : '');
    if (!validation.valid) return res.status(400).json({ code: validation.code || 'INVALID_WORK_REPORT', message: validation.message });
    const report = await DailyWorkReport.create({
      user: req.user._id,
      userName: req.user.username || '',
      ...validation.value,
    });
    return res.status(201).json({ message: 'Daily work report submitted successfully.', report });
  } catch (error) {
    console.error('Unable to save daily work report:', error?.name || 'save_error');
    return res.status(503).json({ message: 'Your daily work report could not be saved. Please try again.' });
  }
});

// GET /api/dailyWorkReport - Get all daily work reports for the logged-in user
// this is for teachers-dashboard
router.get('/', async (req, res) => {
  try {
    const reports = await DailyWorkReport.find({ user: req.user.id });
    res.json(reports);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Get all fees
// this is for teachers-Entry
router.get('/all', adminOnly, async (req, res) => {
  try {
    const dailyWork = await DailyWorkReport.find();
    res.json(dailyWork);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
