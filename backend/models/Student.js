const mongoose = require('mongoose');
const Fee = require('./Fee');
const { STANDARD_FEES } = require('../config/standardFees');

const MarkSchema = new mongoose.Schema({
  subject: { type: String },
  mark: { type: Number },
  date: { type: String }  // Add date field to each subject's mark
});

const studentSchema = new mongoose.Schema({
  // Optional for the existing single-school data set; required by tenant APIs.
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  studentPhoto: { type: String, required: false },
  motherPhoto: { type: String, required: false },
  fatherPhoto: { type: String, required: false },
  firstName: { type: String, required: false },
  middleName: { type: String, required: false },
  lastName: { type: String, required: false },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: false },
  dob: { type: String, required: false },
  bloodGroup: { type: String, required: false },
  religion: { type: String, required: false },
  cast: { type: String, enum: ['SC', 'ST', 'OBC', 'General', 'Other'], required: false },
  // nationality: { type: String, required: false },
  motherTongue: { type: String, required: false },
  address: { type: String, required: false },
  phoneNumber: { type: String, required: false },
  standard: { type: String, required: false },
  stuNo: { type: String, unique: true, required: false },
  batchYear: { type: String, required: false },
  studentProblem: { type: String },
  studentAadharNo: { type: Number },
  // schoolName: { type: String, required: false },
  // schoolBoard: { type: String, enum: ['GSEB', 'CBSE', 'ICSE', 'Other'], required: false },
  MotherName: String,
  FatherName: String,
  FatherAge: Number,
  FatherEducationQualification: String,
  FatherOccupation: String,
  FatherDesignation: String,
  FatherAnnualIncome: Number,
  FatherMobileNumber: Number,
  FatherPhoneNumber: Number,
  EmergencyPhoneNumber: Number,
  parentEmail: { type: String },
  previousSchoolName: { type: String },
  previousStandardMarks: Number,
  previousSchoolBoard: { type: String, enum: ['GSEB', 'CBSE', 'ICSE', 'Other'] },
  siblingName: String,
  siblingAge: Number,
  siblingSchoolName: String,
  siblingStandard: String,
  // marks: [{
  //   reportId: {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: 'ReportCard',
  //   },
  //   // subjectMarks: [{
  //   //   subject: String,
  //   //   date:String,
  //   //   mark: Number,
  //   // }]
  //   subjectData: [MarkSchema]
  // }]
  // -------------------
  // ----- down done -----
  marks: [{
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReportCard',
    },
    subjectData: [MarkSchema],
    // subjectData: {
    //   type: [MarkSchema],  // Array of marks data
    //   required: false,     // Not required
    //   default: [],         // Default value is an empty array
    // },
    total: { type: Number },
    percentage: { type: Number },
    grade: { type: String }
  }]

});


studentSchema.index({ organizationId: 1, branchId: 1, standard: 1, middleName: 1 });
studentSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

studentSchema.pre('save', function (next) {
  this.wasNew = this.isNew;
  next();
});

// Initialize a fee record only when a student is first created.
studentSchema.post('save', async function (doc) {
  // Tenant-aware students use FeeInvoice/FeeTransaction. Never create a legacy\n  // global fee record for a tenant record.\n  if (!doc.wasNew || doc.organizationId) return;

  try {
    const totalStandardFees = Number(STANDARD_FEES[doc.standard] || 0);
    const studentName = [doc.firstName, doc.middleName, doc.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    await Fee.findOneAndUpdate(
      { stuNo: doc.stuNo },
      {
        $setOnInsert: {
          studentName,
          studentPhoneNumber: doc.phoneNumber || '',
          ParentsMobileNumber: doc.FatherMobileNumber ? String(doc.FatherMobileNumber) : '',
          ParentsPhoneNumber: doc.FatherPhoneNumber ? String(doc.FatherPhoneNumber) : '',
          EmergencyMobileNumber: doc.EmergencyPhoneNumber ? String(doc.EmergencyPhoneNumber) : '',
          parentEmail: doc.parentEmail || '',
          batchYear: doc.batchYear || '',
          standard: doc.standard || '',
          stuNo: doc.stuNo,
          totalStandardFees,
          totalFeesPaid: 0,
          totalFeesRemaining: totalStandardFees,
          discount: 0,
          paymentDetails: [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // Preserve the student record if fee initialization fails; log for administrators.
    console.error('Unable to initialize the student fee record:', error);
  }
});

// Keep the linked fee record in sync with student details without overwriting
// payment history, discounts, or amounts already paid.
studentSchema.post('findOneAndUpdate', async function (doc) {
  // Tenant records are reconciled only through organization-scoped APIs.\n  if (!doc || !doc.stuNo || doc.organizationId) return;

  try {
    const feeRecord = await Fee.findOne({ stuNo: doc.stuNo });
    const configuredFee = STANDARD_FEES[doc.standard];
    const totalStandardFees = Number.isFinite(configuredFee)
      ? configuredFee
      : Number(feeRecord?.totalStandardFees || 0);
    const totalFeesPaid = Number(feeRecord?.totalFeesPaid || 0);
    const discount = Number(feeRecord?.discount || 0);
    const studentName = [doc.firstName, doc.middleName, doc.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const feeFields = {
      studentName,
      studentPhoneNumber: doc.phoneNumber || '',
      ParentsMobileNumber: doc.FatherMobileNumber ? String(doc.FatherMobileNumber) : '',
      ParentsPhoneNumber: doc.FatherPhoneNumber ? String(doc.FatherPhoneNumber) : '',
      EmergencyMobileNumber: doc.EmergencyPhoneNumber ? String(doc.EmergencyPhoneNumber) : '',
      parentEmail: doc.parentEmail || '',
      batchYear: doc.batchYear || '',
      standard: doc.standard || '',
      stuNo: doc.stuNo,
      totalStandardFees,
      totalFeesRemaining: Math.max(0, totalStandardFees - totalFeesPaid - discount),
    };

    if (!feeRecord) {
      await Fee.create({
        ...feeFields,
        totalFeesPaid: 0,
        totalFeesRemaining: totalStandardFees,
        discount: 0,
        paymentDetails: [],
      });
    } else {
      await Fee.findByIdAndUpdate(feeRecord._id, { $set: feeFields }, { runValidators: true });
    }
  } catch (error) {
    console.error('Unable to synchronize the student fee record:', error);
  }
});

module.exports = mongoose.model('Student', studentSchema);
