'use strict';

const mongoose = require('mongoose');

const MEMBERSHIP_ROLES = [
  'organization_owner',
  'head_office_admin',
  'branch_admin',
  'admissions',
  'teacher',
  'accountant',
  'hr_manager',
  'transport_staff',
  'parent',
];

const OrganizationMembershipSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  role: { type: String, enum: MEMBERSHIP_ROLES, required: true },
  branchIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
    default: [],
  },
  guardianIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Guardian' }], default: [] },
  classNames: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
  accessAllBranches: { type: Boolean, default: false },
  status: { type: String, enum: ['invited', 'active', 'suspended', 'removed'], default: 'active', index: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  activatedAt: { type: Date, default: Date.now },
}, { timestamps: true, strict: 'throw' });

OrganizationMembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
OrganizationMembershipSchema.index({ userId: 1, status: 1, organizationId: 1 });
OrganizationMembershipSchema.index({ organizationId: 1, role: 1, status: 1 });

module.exports = mongoose.model('OrganizationMembership', OrganizationMembershipSchema);
module.exports.MEMBERSHIP_ROLES = MEMBERSHIP_ROLES;
