'use strict';

const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 3000 },
  audience: { type: String, enum: ['all', 'teachers'], default: 'all', required: true },
  priority: { type: String, enum: ['normal', 'important', 'urgent'], default: 'normal', required: true },
  startsAt: { type: Date, default: Date.now, required: true },
  expiresAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, default: '', trim: true },
}, { timestamps: true });

AnnouncementSchema.index({ isActive: 1, startsAt: 1, expiresAt: 1, audience: 1, createdAt: -1 });

module.exports = mongoose.model('Announcement', AnnouncementSchema);
