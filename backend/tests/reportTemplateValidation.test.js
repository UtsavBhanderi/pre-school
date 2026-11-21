'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReportTemplate } = require('../utils/reportTemplateValidation');

test('normalizes a valid report template', () => {
  const result = validateReportTemplate({ reportName: '  Term 1  ', standard: ' ENG JR. ', description: '100' });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, { reportName: 'Term 1', standard: 'ENG JR.', description: '100' });
});

test('rejects missing and overly long report details', () => {
  assert.equal(validateReportTemplate({ standard: 'ENG JR.', description: '100' }).valid, false);
  assert.equal(validateReportTemplate({ reportName: 'Term 1', description: '100' }).valid, false);
  assert.equal(validateReportTemplate({ reportName: 'x'.repeat(121), standard: 'ENG JR.', description: '100' }).valid, false);
});

test('rejects invalid or unsafe maximum marks values', () => {
  for (const description of ['', 'abc', '0', '-1', '10001', 'Infinity']) assert.equal(validateReportTemplate({ reportName: 'Term 1', standard: 'ENG JR.', description }).valid, false);
  assert.equal(validateReportTemplate({ reportName: 'Term 1', standard: 'ENG JR.', description: '100.5' }).valid, true);
});
