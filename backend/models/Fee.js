const mongoose = require('mongoose');

const PaymentDetailSchema = new mongoose.Schema({
  date: { type: String, required: false },
  time: { type: String, required: false },
  amount: { type: Number, required: false },
});

const FeesSchema = new mongoose.Schema({
  studentName: { type: String, required: false },
  studentPhoneNumber: { type: String, required: false },
  ParentsPhoneNumber: { type: String, required: false },
  ParentsMobileNumber: { type: String, required: false },
  EmergencyMobileNumber: { type: String, required: false },
  parentEmail: { type: String, required: false },
  batchYear: { type: String, required: false },
  standard: { type: String, required: false },
  stuNo: { type: String, required: false },
  totalStandardFees: { type: Number, required: false },
  totalFeesPaid: { type: Number, required: false },
  totalFeesRemaining: { type: Number, required: false },
  paymentDetails: [PaymentDetailSchema],
  discount: {type: Number, default:0}
});

module.exports = mongoose.model('Fees', FeesSchema);


// ParentsPhoneNumber: MotherMobileNumber
// ParentsMobileNumber: FatherMobileNumber