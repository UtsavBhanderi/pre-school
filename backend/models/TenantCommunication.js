'use strict';

const mongoose = require('mongoose');

const ReceiptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, required: true, maxlength: 40 },
  recordedAt: { type: Date, default: Date.now },
}, { _id: false });

const VoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, required: true, maxlength: 40 },
  optionIndex: { type: Number, required: true, min: 0, max: 5 },
  votedAt: { type: Date, default: Date.now },
}, { _id: false });

const TenantCommunicationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  type: { type: String, enum: ['message', 'poll'], required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
  message: { type: String, default: '', trim: true, maxlength: 3000 },
  audience: { type: String, enum: ['all', 'staff', 'parents'], required: true, default: 'all', index: true },
  priority: { type: String, enum: ['normal', 'important', 'urgent'], default: 'normal' },
  startsAt: { type: Date, default: Date.now, required: true },
  expiresAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  options: {
    type: [{ type: String, trim: true, maxlength: 80 }],
    default: [],
    validate: {
      validator(items) {
        return this.type !== 'poll' || (Array.isArray(items) && items.length >= 2 && items.length <= 6);
      },
      message: 'A poll must contain between 2 and 6 options.',
    },
  },
  status: { type: String, enum: ['active', 'archived'], default: 'active', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  readBy: { type: [ReceiptSchema], default: [] },
  votes: { type: [VoteSchema], default: [] },
}, { timestamps: true, strict: 'throw' });

TenantCommunicationSchema.index({ organizationId: 1, branchId: 1, type: 1, status: 1, audience: 1, startsAt: 1 });

module.exports = mongoose.model('TenantCommunication', TenantCommunicationSchema);
