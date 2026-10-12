'use strict';

const mongoose = require('mongoose');

const ChildHandoverEventSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true, index: true },
  eventType: { type: String, enum: ['check_in', 'check_out'], required: true, immutable: true, index: true },
  outcome: { type: String, enum: ['completed', 'refused'], required: true, immutable: true, index: true },
  eventAt: { type: Date, required: true, default: Date.now, immutable: true, index: true },
  method: { type: String, enum: ['family', 'school_transport', 'other'], required: true, immutable: true },
  guardianId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guardian', default: null, immutable: true, index: true },
  guardianNameSnapshot: { type: String, trim: true, maxlength: 120, default: '', immutable: true },
  relationshipSnapshot: { type: String, trim: true, maxlength: 30, default: '', immutable: true },
  personName: { type: String, trim: true, maxlength: 120, default: '', immutable: true },
  authorizationVerified: { type: Boolean, default: false, immutable: true },
  idChecked: { type: Boolean, default: false, immutable: true },
  refusalReason: {
    type: String,
    enum: ['', 'ALREADY_ON_PREMISES', 'CHILD_NOT_ON_PREMISES', 'UNAUTHORIZED_PICKUP', 'ID_NOT_VERIFIED'],
    default: '',
    immutable: true,
  },
  staffNote: { type: String, trim: true, maxlength: 500, default: '', immutable: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });

ChildHandoverEventSchema.index({ organizationId: 1, branchId: 1, childId: 1, eventAt: -1 });
ChildHandoverEventSchema.index({ organizationId: 1, branchId: 1, eventAt: -1 });

module.exports = mongoose.model('ChildHandoverEvent', ChildHandoverEventSchema);
