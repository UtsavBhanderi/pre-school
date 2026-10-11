// const mongoose = require('mongoose');

// const VideoSchema = new mongoose.Schema({
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

// module.exports = mongoose.model('Video', VideoSchema);



// backend/models/Video.js
const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: String,
  standard: String,
  subject: String,
  chapter: String,
  url: String,
  filePath: String,
});

module.exports = mongoose.model('Video', videoSchema);
