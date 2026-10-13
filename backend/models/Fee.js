'use strict';

const mongoose = require('mongoose');

const PaymentDetailSchema = new mongoose.Schema({
  date: { type: String, default: '' },
  time: { type: String, default: '' },
  amount: { type: Number, min: 0, default: 0 },
});

const FeesSchema = new mongoose.Schema({
  // Optional tenant ownership added for explicit legacy migration. Existing
  // records remain unscoped until a signed-off migration assigns both fields.
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  studentName: { type: String, default: '' },
  studentPhoneNumber: { type: String, default: '' },
  ParentsPhoneNumber: { type: String, default: '' },
  ParentsMobileNumber: { type: String, default: '' },
  EmergencyMobileNumber: { type: String, default: '' },
  parentEmail: { type: String, default: '' },
  batchYear: { type: String, default: '' },
  standard: { type: String, default: '' },
  stuNo: { type: String, default: '', index: true },
  totalStandardFees: { type: Number, min: 0, default: 0 },
  totalFeesPaid: { type: Number, min: 0, default: 0 },
  totalFeesRemaining: { type: Number, min: 0, default: 0 },
  paymentDetails: { type: [PaymentDetailSchema], default: [] },
  discount: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Fees', FeesSchema);
