'use strict';

const mongoose = require('mongoose');

const ParentAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, immutable: true, index: true },
  studentIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    default: [],
  },
  registeredPhone: { type: String, required: true, trim: true, maxlength: 16, select: false },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
  activatedAt: { type: Date, default: Date.now },
  lastVerifiedAt: { type: Date, default: Date.now },
}, { timestamps: true, strict: 'throw' });

ParentAccountSchema.index({ studentIds: 1, status: 1 });

module.exports = mongoose.model('ParentAccount', ParentAccountSchema);
