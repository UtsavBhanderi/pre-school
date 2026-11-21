'use strict';

function parseClockTime(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function validateDailyWorkReport(input = {}, assignedStandard = '') {
  const timeIn = typeof input.TimeIn === 'string' ? input.TimeIn.trim() : '';
  const timeOut = typeof input.TimeOut === 'string' ? input.TimeOut.trim() : '';
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const standard = typeof input.standard === 'string' ? input.standard.trim() : '';
  const branch = typeof input.branch === 'string' ? input.branch.trim() : '';
  const dailyWorkReport = typeof input.dailyWorkReport === 'string' ? input.dailyWorkReport.trim() : '';
  const totalStudents = Number(input.totalStudents);
  const startMinutes = parseClockTime(timeIn);
  const endMinutes = parseClockTime(timeOut);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return { valid: false, message: 'Enter valid working hours. Time out must be later than time in.' };
  }
  if (subject.length < 2 || subject.length > 100) {
    return { valid: false, message: 'Enter a subject or activity between 2 and 100 characters.' };
  }
  if (!standard || standard.length > 60) {
    return { valid: false, message: 'Choose a valid class for this work report.' };
  }
  if (assignedStandard && standard !== assignedStandard) {
    return { valid: false, code: 'TEACHER_CLASS_FORBIDDEN', message: 'You can only submit a work report for your assigned class (' + assignedStandard + ').' };
  }
  if (dailyWorkReport.length < 5 || dailyWorkReport.length > 2000) {
    return { valid: false, message: 'Describe the work completed in 5 to 2,000 characters.' };
  }
  if (!Number.isInteger(totalStudents) || totalStudents < 0 || totalStudents > 500) {
    return { valid: false, message: 'Enter a student count between 0 and 500.' };
  }
  if (branch.length > 100) return { valid: false, message: 'The branch name is too long.' };

  return {
    valid: true,
    value: { TimeIn: timeIn, TimeOut: timeOut, subject, standard, branch, dailyWorkReport, totalStudents },
  };
}

module.exports = { parseClockTime, validateDailyWorkReport };
