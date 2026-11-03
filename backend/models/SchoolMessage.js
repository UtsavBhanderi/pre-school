'use strict';

const mongoose = require('mongoose');

const SchoolMessageReadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['parent', 'teacher'], required: true },
  readAt: { type: Date, default: Date.now },
}, { _id: false });

const SchoolMessageSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 3000 },
  audience: { type: String, enum: ['all', 'parents', 'teachers'], default: 'all', required: true },
  priority: { type: String, enum: ['normal', 'important', 'urgent'], default: 'normal', required: true },
  startsAt: { type: Date, default: Date.now, required: true },
  expiresAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, default: '', trim: true, maxlength: 120 },
  readBy: { type: [SchoolMessageReadSchema], default: [] },
}, { timestamps: true });

SchoolMessageSchema.index({ isActive: 1, audience: 1, startsAt: 1, expiresAt: 1, createdAt: -1 });

module.exports = mongoose.model('SchoolMessage', SchoolMessageSchema);
