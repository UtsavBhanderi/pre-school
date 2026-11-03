'use strict';

const express = require('express');
const mongoose = require('mongoose');
const ParentAccount = require('../models/ParentAccount');
const Student = require('../models/Student');
const User = require('../models/User');
const HomeworkAssignment = require('../models/HomeworkAssignment');
const ParentComplaint = require('../models/ParentComplaint');
const ParentPoll = require('../models/ParentPoll');

const router = express.Router();
const COMPLAINT_CATEGORIES = ['general', 'fees', 'classroom', 'transport', 'food', 'health', 'safety', 'staff', 'other'];
const COMPLAINT_STATUSES = ['open', 'in_progress', 'resolved'];

const displayName = (student) => [student?.firstName, student?.middleName, student?.lastName].filter(Boolean).join(' ').trim();
const idIsValid = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const validDate = (value) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date : null;
};
const isStaff = (req, res) => {
  if (['admin', 'teacher'].includes(req.user?.role)) return true;
  res.status(403).json({ message: 'Only school staff can manage parent communication.' });
  return false;
};

async function getParentChildren(req, res) {
  const account = await ParentAccount.findOne({ userId: req.user?._id }).select('studentIds status').lean();
  if (!account || account.status !== 'active' || !Array.isArray(account.studentIds) || !account.studentIds.length) {
    res.status(403).json({ code: 'PARENT_ACCESS_INACTIVE', message: 'Parent portal access is not active. Contact the preschool office.' });
    return null;
  }
  const children = await Student.find({
    _id: { $in: account.studentIds },
    $or: [{ organizationId: null }, { organizationId: { $exists: false } }],
  }).select('_id firstName middleName lastName stuNo standard').lean();
  if (!children.length) {
    res.status(403).json({ code: 'PARENT_CHILD_LINK_MISSING', message: 'No active child records are linked to this parent account.' });
    return null;
  }
  return children;
}

function pollCounts(poll) {
  const counts = (poll.options || []).map(() => 0);
  for (const vote of poll.votes || []) {
    if (Number.isInteger(vote.optionIndex) && counts[vote.optionIndex] !== undefined) counts[vote.optionIndex] += 1;
  }
  return counts;
}

function serializePoll(poll, parentUserId, includeVoterCounts = true) {
  const counts = pollCounts(poll);
  const ownVote = (poll.votes || []).find((vote) => String(vote.parentUserId) === String(parentUserId));
  const now = new Date();
  const open = Boolean(poll.isActive && poll.startsAt <= now && poll.endsAt > now);
  return {
    id: String(poll._id),
    question: poll.question,
    description: poll.description || '',
    standard: poll.standard,
    options: poll.options,
    startsAt: poll.startsAt,
    endsAt: poll.endsAt,
    isActive: open,
    status: open ? 'open' : (poll.endsAt <= now ? 'closed' : 'scheduled'),
    hasVoted: Boolean(ownVote),
    votedOption: ownVote ? ownVote.optionIndex : null,
    totalVotes: (poll.votes || []).length,
    results: includeVoterCounts ? counts : [],
  };
}

// Parent endpoints. Every child identifier is checked against the account's saved child allow-list.
router.get('/parent/homework', async (req, res) => {
  try {
    const children = await getParentChildren(req, res);
    if (!children) return;
    const standards = [...new Set(children.map((child) => String(child.standard || '').trim()).filter(Boolean))];
    const now = new Date();
    const assignments = await HomeworkAssignment.find({
      isActive: true,
      publishAt: { $lte: now },
      $or: [{ standard: 'all' }, { standard: { $in: standards } }],
    }).sort({ dueDate: 1, createdAt: -1 }).limit(100).lean();
    const visible = assignments.map((assignment) => ({
      id: String(assignment._id),
      title: assignment.title,
      instructions: assignment.instructions,
      standard: assignment.standard,
      dueDate: assignment.dueDate,
      createdAt: assignment.createdAt,
      children: children
        .filter((child) => assignment.standard === 'all' || String(child.standard || '').trim() === assignment.standard)
        .map((child) => {
          const submission = (assignment.submissions || []).find((item) =>
            String(item.studentId) === String(child._id) && String(item.parentUserId) === String(req.user._id)
          );
          return {
            id: String(child._id),
            name: displayName(child),
            admissionNumber: child.stuNo || '',
            submitted: Boolean(submission),
            submittedAt: submission?.submittedAt || null,
            responseText: submission?.responseText || '',
          };
        }),
    })).filter((assignment) => assignment.children.length);
    return res.json({ homework: visible });
  } catch (error) {
    console.error('Unable to load parent homework:', error?.name || 'homework_error');
    return res.status(503).json({ message: 'Homework could not be loaded right now.' });
  }
});

router.post('/parent/homework/:id/submissions', async (req, res) => {
  if (!idIsValid(req.params.id)) return res.status(400).json({ message: 'Invalid homework record.' });
  const studentId = String(req.body?.studentId || '');
  const responseText = typeof req.body?.responseText === 'string' ? req.body.responseText.trim() : '';
  if (!idIsValid(studentId) || responseText.length > 1200) return res.status(400).json({ message: 'Check the child and homework response.' });
  try {
    const children = await getParentChildren(req, res);
    if (!children) return;
    const child = children.find((item) => String(item._id) === studentId);
    if (!child) return res.status(403).json({ message: 'This child is not linked to your parent account.' });
    const assignment = await HomeworkAssignment.findOne({
      _id: req.params.id,
      isActive: true,
      $or: [{ standard: 'all' }, { standard: String(child.standard || '').trim() }],
    });
    if (!assignment) return res.status(404).json({ message: 'This homework is unavailable for the selected child.' });
    const existing = assignment.submissions.find((item) =>
      String(item.studentId) === studentId && String(item.parentUserId) === String(req.user._id)
    );
    if (existing) {
      existing.responseText = responseText;
      existing.submittedAt = new Date();
    } else {
      assignment.submissions.push({ studentId, parentUserId: req.user._id, responseText, submittedAt: new Date() });
    }
    await assignment.save();
    return res.json({ message: existing ? 'Homework response updated.' : 'Homework marked as completed.' });
  } catch (error) {
    console.error('Unable to save parent homework response:', error?.name || 'homework_submission_error');
    return res.status(503).json({ message: 'Your homework response could not be saved.' });
  }
});

router.get('/parent/complaints', async (req, res) => {
  try {
    await getParentChildren(req, res);
    if (res.headersSent) return;
    const complaints = await ParentComplaint.find({ parentUserId: req.user._id })
      .sort({ createdAt: -1 }).limit(100)
      .populate({ path: 'studentId', select: 'firstName middleName lastName stuNo standard' }).lean();
    return res.json({ complaints: complaints.map((complaint) => ({
      id: String(complaint._id),
      child: {
        id: String(complaint.studentId?._id || ''),
        name: complaint.childName || displayName(complaint.studentId),
        admissionNumber: complaint.studentId?.stuNo || '',
        className: complaint.childStandard || complaint.studentId?.standard || '',
      },
      category: complaint.category,
      subject: complaint.subject,
      message: complaint.message,
      status: complaint.status,
      schoolReply: complaint.schoolReply || '',
      respondedAt: complaint.respondedAt,
      createdAt: complaint.createdAt,
      updatedAt: complaint.updatedAt,
    })) });
  } catch (error) {
    console.error('Unable to load parent complaints:', error?.name || 'complaint_list_error');
    return res.status(503).json({ message: 'Your messages to the school could not be loaded.' });
  }
});

router.post('/parent/complaints', async (req, res) => {
  const studentId = String(req.body?.studentId || '');
  const category = String(req.body?.category || 'general');
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!idIsValid(studentId) || !COMPLAINT_CATEGORIES.includes(category) ||
      subject.length < 3 || subject.length > 120 || message.length < 5 || message.length > 3000) {
    return res.status(400).json({ message: 'Complete the child, category, subject and message fields correctly.' });
  }
  try {
    const children = await getParentChildren(req, res);
    if (!children) return;
    const child = children.find((item) => String(item._id) === studentId);
    if (!child) return res.status(403).json({ message: 'This child is not linked to your parent account.' });
    const parent = await User.findById(req.user._id).select('username').lean();
    const complaint = await ParentComplaint.create({
      studentId: child._id,
      parentUserId: req.user._id,
      parentName: parent?.username || 'Parent',
      childName: displayName(child),
      childStandard: child.standard || '',
      category, subject, message,
    });
    return res.status(201).json({ message: 'Your message has been sent privately to the school.', complaintId: String(complaint._id) });
  } catch (error) {
    console.error('Unable to create parent complaint:', error?.name || 'complaint_create_error');
    return res.status(503).json({ message: 'Your message could not be sent.' });
  }
});

router.get('/parent/polls', async (req, res) => {
  try {
    const children = await getParentChildren(req, res);
    if (!children) return;
    const standards = [...new Set(children.map((child) => String(child.standard || '').trim()).filter(Boolean))];
    const now = new Date();
    const recentCutoff = new Date(now);
    recentCutoff.setDate(recentCutoff.getDate() - 30);
    const polls = await ParentPoll.find({
      startsAt: { $lte: now },
      $or: [{ standard: 'all' }, { standard: { $in: standards } }],
      $and: [{ $or: [{ endsAt: { $gte: now } }, { endsAt: { $gte: recentCutoff } }] }],
    }).sort({ endsAt: -1, createdAt: -1 }).limit(50).lean();
    return res.json({ polls: polls.map((poll) => serializePoll(poll, req.user._id)) });
  } catch (error) {
    console.error('Unable to load parent polls:', error?.name || 'poll_list_error');
    return res.status(503).json({ message: 'School polls could not be loaded.' });
  }
});

router.post('/parent/polls/:id/votes', async (req, res) => {
  if (!idIsValid(req.params.id)) return res.status(400).json({ message: 'Invalid poll.' });
  const optionIndex = Number(req.body?.optionIndex);
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return res.status(400).json({ message: 'Choose one poll option.' });
  try {
    const children = await getParentChildren(req, res);
    if (!children) return;
    const standards = [...new Set(children.map((child) => String(child.standard || '').trim()).filter(Boolean))];
    const now = new Date();
    const poll = await ParentPoll.findOne({
      _id: req.params.id,
      isActive: true,
      startsAt: { $lte: now },
      endsAt: { $gt: now },
      $or: [{ standard: 'all' }, { standard: { $in: standards } }],
    });
    if (!poll) return res.status(404).json({ message: 'This poll is closed or unavailable for your family.' });
    if (optionIndex >= poll.options.length) return res.status(400).json({ message: 'Choose a valid poll option.' });
    const updated = await ParentPoll.findOneAndUpdate({
      _id: poll._id,
      isActive: true,
      endsAt: { $gt: now },
      votes: { $not: { $elemMatch: { parentUserId: req.user._id } } },
    }, {
      $push: { votes: { parentUserId: req.user._id, optionIndex, votedAt: now } },
    }, { new: true });
    if (!updated) return res.status(409).json({ message: 'Your family has already voted in this poll.' });
    return res.json({ message: 'Your vote has been recorded.', poll: serializePoll(updated.toObject(), req.user._id) });
  } catch (error) {
    console.error('Unable to save parent poll vote:', error?.name || 'poll_vote_error');
    return res.status(503).json({ message: 'Your vote could not be saved.' });
  }
});

// Staff endpoints. Teachers and administrators can manage school-wide communication.
router.get('/staff/classes', async (req, res) => {
  if (!isStaff(req, res)) return;
  try {
    const classes = await Student.distinct('standard', { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] });
    return res.json({ classes: classes.map((item) => String(item || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)) });
  } catch (error) {
    return res.status(503).json({ message: 'Class list could not be loaded.' });
  }
});

router.get('/staff/homework', async (req, res) => {
  if (!isStaff(req, res)) return;
  try {
    const homework = await HomeworkAssignment.find().sort({ createdAt: -1 }).limit(150)
      .populate({ path: 'submissions.studentId', select: 'firstName middleName lastName stuNo standard' })
      .populate({ path: 'submissions.parentUserId', select: 'username email' }).lean();
    return res.json({ homework: homework.map((assignment) => ({
      id: String(assignment._id),
      title: assignment.title,
      instructions: assignment.instructions,
      standard: assignment.standard,
      dueDate: assignment.dueDate,
      isActive: assignment.isActive,
      createdAt: assignment.createdAt,
      submissionCount: (assignment.submissions || []).length,
      submissions: (assignment.submissions || []).map((submission) => ({
        child: displayName(submission.studentId),
        admissionNumber: submission.studentId?.stuNo || '',
        parent: submission.parentUserId?.username || 'Parent',
        responseText: submission.responseText || '',
        submittedAt: submission.submittedAt,
      })),
    })) });
  } catch (error) {
    return res.status(503).json({ message: 'Homework list could not be loaded.' });
  }
});

router.post('/staff/homework', async (req, res) => {
  if (!isStaff(req, res)) return;
  const title = String(req.body?.title || '').trim();
  const instructions = String(req.body?.instructions || '').trim();
  const standard = String(req.body?.standard || 'all').trim();
  const dueDate = validDate(req.body?.dueDate);
  if (title.length < 3 || title.length > 120 || !instructions || instructions.length > 3000 || !dueDate || standard.length > 80) {
    return res.status(400).json({ message: 'Enter a title, instructions, class and valid due date.' });
  }
  try {
    if (standard !== 'all') {
      const classes = await Student.distinct('standard', { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] });
      if (!classes.map((item) => String(item).trim()).includes(standard)) return res.status(400).json({ message: 'Choose a class that exists in the student records.' });
    }
    const assignment = await HomeworkAssignment.create({
      title, instructions, standard, dueDate, createdBy: req.user._id,
      createdByName: req.user.username || '',
    });
    return res.status(201).json({ message: 'Homework published to the selected class.', homeworkId: String(assignment._id) });
  } catch (error) {
    return res.status(503).json({ message: 'Homework could not be published.' });
  }
});

router.patch('/staff/homework/:id/status', async (req, res) => {
  if (!isStaff(req, res)) return;
  if (!idIsValid(req.params.id) || typeof req.body?.isActive !== 'boolean') return res.status(400).json({ message: 'Choose a valid homework record and status.' });
  try {
    const assignment = await HomeworkAssignment.findByIdAndUpdate(req.params.id, { $set: { isActive: req.body.isActive } }, { new: true, runValidators: true });
    if (!assignment) return res.status(404).json({ message: 'Homework record not found.' });
    return res.json({ message: assignment.isActive ? 'Homework published.' : 'Homework archived.' });
  } catch (error) {
    return res.status(503).json({ message: 'Homework status could not be updated.' });
  }
});

router.get('/staff/complaints', async (req, res) => {
  if (!isStaff(req, res)) return;
  try {
    const complaints = await ParentComplaint.find().sort({ createdAt: -1 }).limit(250)
      .populate({ path: 'studentId', select: 'firstName middleName lastName stuNo standard' })
      .populate({ path: 'parentUserId', select: 'username email' }).lean();
    return res.json({ complaints: complaints.map((item) => ({
      id: String(item._id),
      child: item.childName || displayName(item.studentId),
      admissionNumber: item.studentId?.stuNo || '',
      className: item.childStandard || item.studentId?.standard || '',
      parent: item.parentName || item.parentUserId?.username || 'Parent',
      parentEmail: item.parentUserId?.email || '',
      category: item.category,
      subject: item.subject,
      message: item.message,
      status: item.status,
      schoolReply: item.schoolReply || '',
      createdAt: item.createdAt,
      respondedAt: item.respondedAt,
    })) });
  } catch (error) {
    return res.status(503).json({ message: 'Parent messages could not be loaded.' });
  }
});

router.patch('/staff/complaints/:id', async (req, res) => {
  if (!isStaff(req, res)) return;
  if (!idIsValid(req.params.id)) return res.status(400).json({ message: 'Invalid parent message.' });
  const status = String(req.body?.status || 'in_progress');
  const schoolReply = typeof req.body?.schoolReply === 'string' ? req.body.schoolReply.trim() : '';
  if (!COMPLAINT_STATUSES.includes(status) || schoolReply.length > 3000) return res.status(400).json({ message: 'Choose a valid status and response.' });
  try {
    const complaint = await ParentComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ message: 'Parent message not found.' });
    complaint.status = status;
    if (schoolReply) {
      complaint.schoolReply = schoolReply;
      complaint.respondedBy = req.user._id;
      complaint.respondedByName = req.user.username || '';
      complaint.respondedAt = new Date();
    }
    await complaint.save();
    return res.json({ message: 'Parent message updated.' });
  } catch (error) {
    return res.status(503).json({ message: 'Parent message could not be updated.' });
  }
});

router.get('/staff/polls', async (req, res) => {
  if (!isStaff(req, res)) return;
  try {
    const polls = await ParentPoll.find().sort({ createdAt: -1 }).limit(150).lean();
    return res.json({ polls: polls.map((poll) => ({
      ...serializePoll(poll, req.user._id),
      createdAt: poll.createdAt,
    })) });
  } catch (error) {
    return res.status(503).json({ message: 'Poll list could not be loaded.' });
  }
});

router.post('/staff/polls', async (req, res) => {
  if (!isStaff(req, res)) return;
  const question = String(req.body?.question || '').trim();
  const description = String(req.body?.description || '').trim();
  const standard = String(req.body?.standard || 'all').trim();
  const options = Array.isArray(req.body?.options) ? req.body.options.map((option) => String(option || '').trim()).filter(Boolean) : [];
  const startsAt = req.body?.startsAt ? validDate(req.body.startsAt) : new Date();
  const endsAt = validDate(req.body?.endsAt);
  const normalizedOptions = [...new Set(options)];
  if (question.length < 5 || question.length > 240 || description.length > 1200 || standard.length > 80 ||
      normalizedOptions.length < 2 || normalizedOptions.length > 6 || normalizedOptions.some((option) => option.length > 80) ||
      !startsAt || !endsAt || endsAt <= startsAt) {
    return res.status(400).json({ message: 'Enter a question, 2–6 unique options, a class and a valid closing date.' });
  }
  try {
    if (standard !== 'all') {
      const classes = await Student.distinct('standard', { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] });
      if (!classes.map((item) => String(item).trim()).includes(standard)) return res.status(400).json({ message: 'Choose a class that exists in the student records.' });
    }
    const poll = await ParentPoll.create({
      question, description, options: normalizedOptions, standard, startsAt, endsAt,
      createdBy: req.user._id, createdByName: req.user.username || '',
    });
    return res.status(201).json({ message: 'Poll published to the selected families.', pollId: String(poll._id) });
  } catch (error) {
    return res.status(503).json({ message: 'Poll could not be published.' });
  }
});

router.patch('/staff/polls/:id/status', async (req, res) => {
  if (!isStaff(req, res)) return;
  if (!idIsValid(req.params.id) || typeof req.body?.isActive !== 'boolean') return res.status(400).json({ message: 'Choose a valid poll and status.' });
  try {
    const poll = await ParentPoll.findByIdAndUpdate(req.params.id, { $set: { isActive: req.body.isActive } }, { new: true, runValidators: true });
    if (!poll) return res.status(404).json({ message: 'Poll not found.' });
    return res.json({ message: poll.isActive ? 'Poll reopened.' : 'Poll closed.' });
  } catch (error) {
    return res.status(503).json({ message: 'Poll status could not be updated.' });
  }
});

module.exports = router;
