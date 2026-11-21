const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: String,
  start: Date,
  end: Date,
  color: String,
  // Admin chooses whether an event is visible to everyone, parents or teachers.
  // Missing values in older records are treated as "all" by the portal queries.
  audience: { type: String, enum: ['all', 'parents', 'teachers'], default: 'all', index: true },
});

// module.exports = mongoose.model('Event', eventSchema);
module.exports = mongoose.model('Calendar', eventSchema);
