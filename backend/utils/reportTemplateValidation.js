'use strict';

function validateReportTemplate(input = {}) {
  const reportName = typeof input.reportName === 'string' ? input.reportName.trim() : '';
  const standard = typeof input.standard === 'string' ? input.standard.trim() : '';
  const rawMarks = typeof input.description === 'string' || typeof input.description === 'number' ? String(input.description).trim() : '';
  const outOfMarks = Number(rawMarks);
  if (!reportName) return { valid: false, message: 'Enter a report name.' };
  if (reportName.length > 120) return { valid: false, message: 'The report name must be 120 characters or fewer.' };
  if (!standard) return { valid: false, message: 'Choose a class for this report.' };
  if (standard.length > 60) return { valid: false, message: 'The class name is too long.' };
  if (!rawMarks || !Number.isFinite(outOfMarks) || outOfMarks <= 0 || outOfMarks > 10000) return { valid: false, message: 'Out of marks must be a number between 1 and 10,000.' };
  return { valid: true, value: { reportName, standard, description: String(outOfMarks) } };
}

module.exports = { validateReportTemplate };
