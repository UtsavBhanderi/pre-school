const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema({
  title: { type: String, required: false },
  description: { type: String, required: false },
  url: { type: String, required: false },
  sequence: { type: String, default: 0 } // New field for sequence
});

module.exports = mongoose.model('Photo', PhotoSchema);