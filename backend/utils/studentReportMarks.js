'use strict';

function isValidDateOnly(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateStudentReportMarks(subjectData, allowedSubjects, outOfMarks) {
  const maximumMark = Number(outOfMarks);
  if (!Array.isArray(allowedSubjects) || !allowedSubjects.length || allowedSubjects.length > 100) {
    return { valid: false, message: 'No valid subjects are configured for this class. Configure subjects before entering marks.' };
  }
  if (!Number.isFinite(maximumMark) || maximumMark <= 0 || maximumMark > 10000) {
    return { valid: false, message: 'The report template has an invalid maximum mark value. Update the template before entering marks.' };
  }
  const subjects = allowedSubjects.map((subject) => typeof subject === 'string' ? subject.trim() : '');
  if (subjects.some((subject) => !subject) || new Set(subjects).size !== subjects.length) {
    return { valid: false, message: 'The configured subject list contains an empty or duplicate subject.' };
  }
  if (!Array.isArray(subjectData) || subjectData.length !== subjects.length) {
    return { valid: false, message: 'Enter marks for every configured subject in this report.' };
  }

  const entries = new Map();
  for (const item of subjectData) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.subject !== 'string') {
      return { valid: false, message: 'An assessment entry is invalid. Refresh the page and try again.' };
    }
    const subject = item.subject.trim();
    if (!subjects.includes(subject)) return { valid: false, message: 'Marks can only be saved for subjects configured for this class.' };
    if (entries.has(subject)) return { valid: false, message: 'A subject can appear only once in a report.' };

    const rawMark = item.mark;
    if (rawMark === '' || rawMark === null || rawMark === undefined) {
      return { valid: false, message: 'Enter a mark for every subject. Use 0 when no marks were earned.' };
    }
    const mark = Number(rawMark);
    if (!Number.isFinite(mark) || mark < 0 || mark > maximumMark || Math.abs(mark * 100 - Math.round(mark * 100)) > 1e-7) {
      return { valid: false, message: 'Each subject mark must be between 0 and ' + maximumMark + ', with at most two decimal places.' };
    }

    const date = item.date === undefined || item.date === null ? '' : item.date;
    if (!isValidDateOnly(date)) return { valid: false, message: 'Assessment dates must be valid calendar dates.' };
    entries.set(subject, { subject, mark: Math.round(mark * 100) / 100, date });
  }

  if (entries.size !== subjects.length) return { valid: false, message: 'Enter a mark for every configured subject.' };
  return { valid: true, value: subjects.map((subject) => entries.get(subject)) };
}

function calculateStudentReportResult(subjectData, outOfMarks) {
  const totalPaise = subjectData.reduce((sum, item) => sum + Math.round(item.mark * 100), 0);
  const total = totalPaise / 100;
  const maximumTotalPaise = subjectData.length * Math.round(Number(outOfMarks) * 100);
  const percentage = maximumTotalPaise > 0 ? Number(((totalPaise / maximumTotalPaise) * 100).toFixed(2)) : 0;
  let grade = 'E';
  if (percentage >= 90) grade = 'A+';
  else if (percentage >= 80) grade = 'A';
  else if (percentage >= 70) grade = 'B';
  else if (percentage >= 60) grade = 'C';
  else if (percentage >= 50) grade = 'D';
  return { total, percentage, grade };
}

module.exports = { isValidDateOnly, validateStudentReportMarks, calculateStudentReportResult };
