'use strict';

const mongoose = require('mongoose');

const AllergySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  reaction: { type: String, trim: true, maxlength: 500, default: '' },
  severity: { type: String, enum: ['unknown', 'mild', 'moderate', 'severe'], default: 'unknown' },
  emergencyAction: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const MedicationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  dosage: { type: String, trim: true, maxlength: 100, default: '' },
  instructions: { type: String, trim: true, maxlength: 500, default: '' },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  administerAtSchool: { type: Boolean, default: false },
  parentAuthorizationRecorded: { type: Boolean, default: false },
  authorizationNotes: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const DietaryRestrictionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  details: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const ChildHealthRecordSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true, index: true },
  allergies: {
    type: [AllergySchema],
    default: [],
    validate: { validator: (items) => Array.isArray(items) && items.length <= 20, message: 'A child may have at most 20 allergy entries.' },
  },
  medications: {
    type: [MedicationSchema],
    default: [],
    validate: { validator: (items) => Array.isArray(items) && items.length <= 20, message: 'A child may have at most 20 medication entries.' },
  },
  dietaryRestrictions: {
    type: [DietaryRestrictionSchema],
    default: [],
    validate: { validator: (items) => Array.isArray(items) && items.length <= 20, message: 'A child may have at most 20 dietary restriction entries.' },
  },
  specialCareInstructions: { type: String, trim: true, maxlength: 1500, default: '' },
  emergencyInstructions: { type: String, trim: true, maxlength: 1500, default: '' },
  physicianName: { type: String, trim: true, maxlength: 120, default: '' },
  physicianPhone: { type: String, trim: true, maxlength: 30, default: '' },
  medicalNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw' });

ChildHealthRecordSchema.index({ organizationId: 1, branchId: 1, childId: 1 }, { unique: true });
ChildHealthRecordSchema.index({ organizationId: 1, branchId: 1, updatedAt: -1 });

module.exports = mongoose.model('ChildHealthRecord', ChildHealthRecordSchema);
