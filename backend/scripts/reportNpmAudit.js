'use strict';

const fs = require('node:fs');

function summarizeAudit(audit) {
  const summary = audit?.metadata?.vulnerabilities || {};
  const vulnerabilities = audit?.vulnerabilities && typeof audit.vulnerabilities === 'object'
    ? audit.vulnerabilities
    : {};
  const items = Object.entries(vulnerabilities).map(([name, finding]) => ({
    name,
    severity: finding.severity || 'unknown',
    direct: Boolean(finding.isDirect),
    range: finding.range || '',
    fixAvailable: finding.fixAvailable ?? null,
    advisories: (Array.isArray(finding.via) ? finding.via : [])
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        title: String(item.title || 'Unnamed advisory'),
        url: String(item.url || ''),
        range: String(item.range || ''),
      })),
  })).sort((left, right) => {
    const order = { critical: 0, high: 1, moderate: 2, low: 3, unknown: 4 };
    return (order[left.severity] ?? 4) - (order[right.severity] ?? 4) || left.name.localeCompare(right.name);
  });

  return {
    counts: {
      total: Number(summary.total || items.length),
      critical: Number(summary.critical || 0),
      high: Number(summary.high || 0),
      moderate: Number(summary.moderate || 0),
      low: Number(summary.low || 0),
      info: Number(summary.info || 0),
    },
    items,
  };
}

function printAuditReport(report) {
  const { counts, items } = report;
  console.log('Backend dependency audit (informational; remediation is tracked separately)');
  console.log(
    'Total: ' + counts.total +
    ' | critical: ' + counts.critical +
    ' | high: ' + counts.high +
    ' | moderate: ' + counts.moderate +
    ' | low: ' + counts.low +
    ' | info: ' + counts.info
  );

  if (!items.length) {
    console.log('No package advisories were listed by npm audit.');
    return;
  }

  for (const item of items) {
    console.log(
      '\n[' + item.severity.toUpperCase() + '] ' + item.name +
      (item.direct ? ' (direct dependency)' : ' (transitive dependency)') +
      (item.range ? ' | affected range: ' + item.range : '')
    );
    console.log('  Fix available: ' + JSON.stringify(item.fixAvailable));
    for (const advisory of item.advisories) {
      console.log('  - ' + advisory.title +
        (advisory.range ? ' | advisory range: ' + advisory.range : '') +
        (advisory.url ? ' | ' + advisory.url : ''));
    }
  }
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/reportNpmAudit.js <npm-audit-json-file>');
    process.exitCode = 2;
  } else {
    try {
      const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
      printAuditReport(summarizeAudit(audit));
    } catch (error) {
      console.error('Could not read npm audit JSON: ' + error.message);
      process.exitCode = 2;
    }
  }
}

module.exports = { summarizeAudit, printAuditReport };
