const mongoose = require('mongoose');
const Fee = require('./Fee');

const MarkSchema = new mongoose.Schema({
  subject: { type: String },
  mark: { type: Number },
  date: { type: String }  // Add date field to each subject's mark
});

const studentSchema = new mongoose.Schema({
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

// const standardFees = {
//   "ENG Play Group": 23500,  19,900
//   "ENG NR.": 23500,       19,900
//   "ENG JR.": 25000,    20,900
//   "ENG SR.": 25000,   20,900
//   "GUJ Play Group": 20500,    14,500
//   "GUJ NR.": 20500,   14,500 
//   "GUJ JR.": 21500,   15000
//   "GUJ SR.": 21500,   15000
// };
const standardFees = {
  "ENG Play Group": 23500,
  "ENG NR.": 23500,
  "ENG JR.": 25000,
  "ENG SR.": 25000,
  "GUJ Play Group": 20500,
  "GUJ NR.": 20500, 
  "GUJ JR.": 21500,
  "GUJ SR.": 21500,
};
studentSchema.pre('save', function (next) {
  this.wasNew = this.isNew;  // Set a flag before saving
  next();
});

// Middleware to sync with fees collection on create
studentSchema.post('save', async function (doc) {
  // studentSchema.post('createCollection', async function(doc) {
  // Check if the document is newly created
  // if (this.isNew) {
  if (this.wasNew) {

    // try {
    //   // Only sync fees collection on document creation
    //   await syncFeesCollection(doc);
    // }
    try {
      const fees = standardFees[doc.standard]

      await Fee.create({
        studentName: doc.firstName + " " + doc.middleName + " " + doc.lastName,
        studentPhoneNumber: doc.phoneNumber,
        ParentsMobileNumber: doc.FatherMobileNumber,
        ParentsPhoneNumber: doc.FatherPhoneNumber,
        EmergencyPhoneNumber: doc.EmergencyPhoneNumber,
        parentEmail: doc.parentEmail,
        batchYear: doc.batchYear,
        // batchYear: "2026-2027",

        standard: doc.standard,
        stuNo: doc.stuNo,
        totalStandardFees: fees,
        totalFeesPaid: 0,
        totalFeesRemaining: fees,
        // totalFeesRemaining: fees - doc.totalFeesPaid - doc.discount,
        // discount: doc.discount,
        paymentDetails: []
      });

      // await syncFeesCollection(doc);
    }
    catch (error) {
      console.error('Error creating fee record:', error);
    }
  }
});

// Middleware to sync with fees collection on update
studentSchema.pre('findOneAndUpdate', async function (next) {

  const update = this.getUpdate();
  const studentNumber = update.stuNo;

  // Find the updated student data
  const updatedStudent = await this.model.findOne(this.getQuery());

  const fees2 = standardFees[update.standard || updatedStudent.standard];

  if (updatedStudent) {
    try {
      // Construct the update object for the fee document
      const updatedFee = {
        studentName: update.firstName + " " + update.middleName + " " + update.lastName || updatedStudent.firstName + " " + updatedStudent.middleName + " " + updatedStudent.lastName,
        studentPhoneNumber: update.phoneNumber || updatedStudent.phoneNumber,
        ParentsMobileNumber: update.FatherMobileNumber || updatedStudent.FatherMobileNumber,
        ParentsPhoneNumber: update.FatherPhoneNumber || updatedStudent.FatherPhoneNumber,
        EmergencyPhoneNumber: update.EmergencyPhoneNumber || updatedStudent.EmergencyPhoneNumber,
        parentEmail: update.parentEmail || updatedStudent.parentEmail,
        // batchYear: update.batchYear || updatedStudent.batchYear,
        batchYear: "2026-2027",
        standard: update.standard || updatedStudent.standard,
        totalStandardFees: fees2,
        totalFeesPaid: 0,
        totalFeesRemaining: fees2,
        // totalFeesRemaining: fees - doc.totalFeesPaid - doc.discount,
        // discount: doc.discount,
        discount: 0,
        paymentDetails: []
      }

      // Update the corresponding fee document
      await Fee.findOneAndUpdate(
        { stuNo: studentNumber },
        updatedFee,
        { new: true }
      );
    } catch (error) {
      console.error('Error updating fee record:', error);
    }
  }
  next();
});

// const sequenceSchema = new mongoose.Schema({
//   year: { type: String, unique: true },
//   sequenceNumber: { type: Number, default: 0 }
// });

// const Sequence = mongoose.model('Sequence', sequenceSchema);
// const Student = mongoose.model('Student', studentSchema);

module.exports = mongoose.model('Student', studentSchema);


// module.exports = { Student, Sequence };
// -------------------------------------------
