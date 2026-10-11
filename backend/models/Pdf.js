// const mongoose = require('mongoose');

// const PdfSchema = new mongoose.Schema({
//   standard: {
//     type: Number,
//     required: true,
//   },
//   subject: {
//     type: String,
//     required: true,
//   },
//   chapter: {
//     type: String,
//   },
//   title: {
//     type: String,
//     required: true,
//   },
//   url: {
//     type: String,
//     required: true,
//   },
// });

// module.exports = mongoose.model('Pdf', PdfSchema);
// backend/models/pdf.js
const mongoose = require('mongoose');

const pdfSchema = new mongoose.Schema({
  title: String,
  standard: String,
  subject: String,
  chapter: String,
  url: String,
  filePath: String,
});

module.exports = mongoose.model('PDF', pdfSchema);
