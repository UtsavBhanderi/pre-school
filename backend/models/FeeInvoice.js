'use strict';

const mongoose = require('mongoose');

const InvoiceLineItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  quantity: { type: Number, required: true, min: 1, max: 1000 },
  unitAmountPaise: { type: Number, required: true, min: 0, max: 100000000000 },
  lineTotalPaise: { type: Number, required: true, min: 0, max: 100000000000 },
});

const FeeInvoiceSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true, index: true },
  invoiceNumber: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  academicYear: { type: String, required: true, trim: true, maxlength: 20, immutable: true },
  lineItems: {
    type: [InvoiceLineItemSchema],
    required: true,
    validate: { validator: (items) => Array.isArray(items) && items.length > 0 && items.length <= 30, message: 'An invoice must have between 1 and 30 line items.' },
    immutable: true,
  },
  subtotalPaise: { type: Number, required: true, min: 0, max: 100000000000, immutable: true },
  discountPaise: { type: Number, required: true, min: 0, max: 100000000000, default: 0, immutable: true },
  totalAmountPaise: { type: Number, required: true, min: 0, max: 100000000000, immutable: true },
  dueDate: { type: Date, default: null },
  // Non-null only when imported from the legacy Fees collection.
  legacySourceFeeId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
  status: { type: String, enum: ['open', 'void'], default: 'open', index: true },
  ledgerVersion: { type: Number, min: 0, default: 0 },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  voidReason: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true, strict: 'throw' });

FeeInvoiceSchema.index({ organizationId: 1, branchId: 1, invoiceNumber: 1 }, { unique: true });
FeeInvoiceSchema.index({ organizationId: 1, branchId: 1, childId: 1, academicYear: 1, createdAt: -1 });
FeeInvoiceSchema.index({ organizationId: 1, branchId: 1, status: 1, dueDate: 1 });
FeeInvoiceSchema.index(
  { organizationId: 1, branchId: 1, legacySourceFeeId: 1 },
  { unique: true, partialFilterExpression: { legacySourceFeeId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('FeeInvoice', FeeInvoiceSchema);
