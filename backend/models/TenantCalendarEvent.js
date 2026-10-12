'use strict';

const mongoose = require('mongoose');

const TenantCalendarEventSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 140 },
  description: { type: String, trim: true, maxlength: 3000, default: '' },
  type: { type: String, enum: ['holiday', 'school_event', 'meeting', 'trip', 'birthday', 'deadline', 'other'], required: true, default: 'school_event', index: true },
  audience: { type: String, enum: ['all', 'staff', 'parents'], required: true, default: 'all', index: true },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true, index: true },
  allDay: { type: Boolean, default: false },
  location: { type: String, trim: true, maxlength: 180, default: '' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancellationReason: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true, strict: 'throw' });

TenantCalendarEventSchema.index({ organizationId: 1, branchId: 1, status: 1, startsAt: 1 });
TenantCalendarEventSchema.index({ organizationId: 1, branchId: 1, audience: 1, startsAt: 1, endsAt: 1 });

module.exports = mongoose.model('TenantCalendarEvent', TenantCalendarEventSchema);
