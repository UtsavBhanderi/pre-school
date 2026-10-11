// models/subjectModel.js
const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  standard: {
    type: String, // e.g., Standard 1, 2, 3, etc.
    required: true
  },
  subjects: {
    type: [String], // Array of subject names for that standard
    // type: [], // Array of subject names for that standard
    required: true
  }
});

const Subject = mongoose.model('Subject', subjectSchema);

module.exports = Subject;
