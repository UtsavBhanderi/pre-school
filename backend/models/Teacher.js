const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  selfPhoto: { type: String, required: false },
  motherPhoto: { type: String, required: false },
  fatherPhoto: { type: String, required: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: undefined },
  firstName: { type: String, required: false },
  middleName: { type: String, required: false },
  lastName: { type: String, required: false },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: false },
  dob: { type: String, required: false },
  bloodGroup: { type: String, required: false },
  religion: { type: String, required: false },
  cast: { type: String, enum: ['SC', 'ST', 'OBC', 'General', 'Other'], required: false },
  motherTongue: { type: String, required: false },
  address: { type: String, required: false },
  RegisterPhoneNumber: { type: String, required: false },
  standard: { type: String, required: false },
  GR_No: { type: String, unique: true, required: false },
  batchYear: { type: String, required: false },
  Problem: { type: String },
  MotherMobileNumber: { type: String, trim: true },
  FatherMobileNumber: { type: String, trim: true },
  EmergencyPhoneNumber: { type: String, trim: true },
  Email: { type: String },
  Village: { type: String },
  Taluka: { type: String },
  District: { type: String },
  drivingLicence: { type: String, trim: true },
  vehical: { type: String, required: false },
  married: { type: Boolean }
});

teacherSchema.index({ userId: 1 }, {
  unique: true,
  partialFilterExpression: { userId: { $type: 'objectId' } },
});

module.exports = mongoose.model('Teacher', teacherSchema);

