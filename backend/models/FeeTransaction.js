'use strict';

const mongoose = require('mongoose');

const FeeTransactionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeInvoice', required: true, immutable: true, index: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true, index: true },
  receiptNumber: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  type: { type: String, enum: ['payment', 'refund'], required: true, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, max: 100000000000, immutable: true },
  method: { type: String, enum: ['cash', 'upi', 'bank_transfer', 'card', 'online', 'cheque', 'other'], required: true, immutable: true },
  reference: { type: String, trim: true, maxlength: 160, default: '', immutable: true },
  transactionAt: { type: Date, required: true, default: Date.now, immutable: true },
  relatedTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeTransaction', default: null, immutable: true },
  reason: { type: String, trim: true, maxlength: 500, default: '', immutable: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });

FeeTransactionSchema.index({ organizationId: 1, branchId: 1, receiptNumber: 1 }, { unique: true });
FeeTransactionSchema.index({ organizationId: 1, branchId: 1, invoiceId: 1, transactionAt: -1 });
FeeTransactionSchema.index({ organizationId: 1, branchId: 1, transactionAt: -1 });

module.exports = mongoose.model('FeeTransaction', FeeTransactionSchema);
