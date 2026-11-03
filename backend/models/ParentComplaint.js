'use strict';

const mongoose = require('mongoose');

const ParentComplaintSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parentName: { type: String, default: '', trim: true, maxlength: 120 },
  childName: { type: String, default: '', trim: true, maxlength: 160 },
  childStandard: { type: String, default: '', trim: true, maxlength: 80 },
  category: {
    type: String,
    enum: ['general', 'fees', 'classroom', 'transport', 'food', 'health', 'safety', 'staff', 'other'],
    default: 'general',
    required: true,
  },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 3000 },
  status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
  schoolReply: { type: String, default: '', trim: true, maxlength: 3000 },
  respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  respondedByName: { type: String, default: '', trim: true, maxlength: 120 },
  respondedAt: { type: Date, default: null },
}, { timestamps: true });

ParentComplaintSchema.index({ parentUserId: 1, createdAt: -1 });
ParentComplaintSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ParentComplaint', ParentComplaintSchema);
