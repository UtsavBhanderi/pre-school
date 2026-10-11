const mongoose = require('mongoose');

const reportCardSchema = new mongoose.Schema({
  reportName: {
    type: String,
    required: true,
  },
  standard: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }]
});

module.exports = mongoose.model('ReportCard', reportCardSchema);
