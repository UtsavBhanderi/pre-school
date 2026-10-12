'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCell, createCsv } = require('../utils/reportCsv');

test('CSV escaping preserves commas, quotes, and newlines', () => {
  assert.equal(csvCell('Surat, Gujarat'), '"Surat, Gujarat"');
  assert.equal(csvCell('School "A"'), '"School ""A"""');
  assert.equal(csvCell('line one\nline two'), '"line one\nline two"');
});

test('CSV cells neutralize spreadsheet formulas but leave numeric values usable', () => {
  assert.equal(csvCell('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(csvCell('  +SUM(A1:A2)'), '"\'  +SUM(A1:A2)"');
  assert.equal(csvCell('@command'), '"\'@command"');
  assert.equal(csvCell('\n=SUM(A1:A2)'), '"\'\n=SUM(A1:A2)"');
  assert.equal(csvCell(-10), '-10');
  assert.equal(csvCell(1200.5), '1200.5');
});

test('CSV reports include a Unicode BOM and require a consistent row width', () => {
  const csv = createCsv(['Name', 'Amount'], [['બાળક', 1200.5], ['Parent', null]]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.ok(csv.includes('"બાળક",1200.5'));
  assert.ok(csv.includes('"Parent",""'));
  assert.throws(() => createCsv(['Name', 'Amount'], [['Only one value']]), /row must match/);
});
