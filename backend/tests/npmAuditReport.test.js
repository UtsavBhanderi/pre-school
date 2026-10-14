'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeAudit } = require('../scripts/reportNpmAudit');

test('audit summary sorts severe findings first and keeps fix/advisory details', () => {
  const report = summarizeAudit({
    metadata: { vulnerabilities: { total: 2, critical: 1, high: 1, moderate: 0, low: 0, info: 0 } },
    vulnerabilities: {
      lodash: {
        severity: 'high',
        isDirect: false,
        range: '>=4.0.0 <4.17.21',
        fixAvailable: { name: 'lodash', version: '4.17.21', isSemVerMajor: false },
        via: [{ title: 'Prototype Pollution', url: 'https://example.test/advisory', range: '>=4 <4.17.21' }],
      },
      example: { severity: 'critical', isDirect: true, range: '<1.2.0', fixAvailable: false, via: [] },
    },
  });

  assert.equal(report.counts.total, 2);
  assert.equal(report.items[0].name, 'example');
  assert.equal(report.items[0].fixAvailable, false);
  assert.equal(report.items[1].name, 'lodash');
  assert.equal(report.items[1].advisories[0].title, 'Prototype Pollution');
  assert.equal(report.items[1].advisories[0].url, 'https://example.test/advisory');
});

test('audit summary handles empty or partial npm audit documents', () => {
  const report = summarizeAudit({});
  assert.equal(report.counts.total, 0);
  assert.deepEqual(report.items, []);
});
