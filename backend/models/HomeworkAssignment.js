'use strict';

const mongoose = require('mongoose');

const HomeworkSubmissionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  responseText: { type: String, default: '', trim: true, maxlength: 1200 },
  submittedAt: { type: Date, default: Date.now },
}, { _id: false });

const HomeworkAssignmentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  instructions: { type: String, required: true, trim: true, maxlength: 3000 },
  standard: { type: String, required: true, trim: true, default: 'all', maxlength: 80 },
  dueDate: { type: Date, required: true },
  publishAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, default: '', trim: true, maxlength: 120 },
  submissions: { type: [HomeworkSubmissionSchema], default: [] },
}, { timestamps: true });

HomeworkAssignmentSchema.index({ isActive: 1, publishAt: 1, standard: 1, dueDate: 1 });
HomeworkAssignmentSchema.index({ 'submissions.studentId': 1, 'submissions.parentUserId': 1 });

module.exports = mongoose.model('HomeworkAssignment', HomeworkAssignmentSchema);
