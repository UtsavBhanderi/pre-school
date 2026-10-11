const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: String,
  start: Date,
  end: Date,
  color: String,
});

// module.exports = mongoose.model('Event', eventSchema);
module.exports = mongoose.model('Calendar', eventSchema);
