'use strict';

const mongoose = require('mongoose');

const ChildHandoverStateSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true },
  state: { type: String, enum: ['outside', 'on_premises'], default: 'outside', required: true },
  version: { type: Number, min: 0, default: 0 },
  lastCompletedEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChildHandoverEvent', default: null },
  lastCompletedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });

ChildHandoverStateSchema.index({ organizationId: 1, branchId: 1, childId: 1 }, { unique: true });
ChildHandoverStateSchema.index({ organizationId: 1, branchId: 1, state: 1, updatedAt: -1 });

module.exports = mongoose.model('ChildHandoverState', ChildHandoverStateSchema);
