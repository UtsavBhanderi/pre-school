const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const DailyWorkReport = require('../models/DailyWorkReport');

// POST /api/dailyWorkReport - Create a new daily work report
router.post('/', auth, async (req, res) => {
  const { TimeIn, TimeOut, subject, standard, branch, dailyWorkReport, totalStudents } = req.body;

  try {
    const report = new DailyWorkReport({
      user: req.user.id,
      userName: req.user.username,
      TimeIn,
      TimeOut,
      subject,
      standard,
      branch,
      dailyWorkReport,
      totalStudents
    });

    await report.save();
    res.json(report);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// GET /api/dailyWorkReport - Get all daily work reports for the logged-in user
// this is for teachers-dashboard
router.get('/', auth, async (req, res) => {
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
router.get('/all', async (req, res) => {
  try {
    const dailyWork = await DailyWorkReport.find();
    res.json(dailyWork);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
