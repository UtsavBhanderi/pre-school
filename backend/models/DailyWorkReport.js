const mongoose = require('mongoose');

const DailyWorkReportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: false
  },
  TimeIn: {
    type: String, // or Date if you prefer
    required: true
  },
  TimeOut: {
    type: String, // or Date if you prefer
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  standard: {
    type: String,
    required: true
  },
  date: {
    type: String,
    default: () => new Date().toISOString().split('T')[0], // Today's date as a string
    required: true
  },
  branch: {
    type: String,
    required: false
  },
  dailyWorkReport: {
    type: String,
    required: true
  },
  totalStudents: {
    type: Number,
    required: true
  },
  todaysWorkingHours: {
    type: Number,
    default: function() {
      // Calculate the difference between TimeIn and TimeOut
      const timeIn = new Date(`1970-01-01T${this.TimeIn}:00Z`);
      const timeOut = new Date(`1970-01-01T${this.TimeOut}:00Z`);
      return (timeOut - timeIn) / (1000 * 60 * 60); // Difference in hours
    }
  }
});

// // Create a virtual field for userName that will be populated from the User model
// DailyWorkReportSchema.virtual('userName', {
//   ref: 'User', 
//   localField: 'user', 
//   foreignField: '_id', 
//   justOne: true 
// });

const DailyWorkReport = mongoose.model('DailyWorkReport', DailyWorkReportSchema);

module.exports = DailyWorkReport;
