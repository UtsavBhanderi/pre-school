'use strict';

const fs = require('node:fs');

function main() {
  const reportPath = process.argv[2];
  if (!reportPath || !fs.existsSync(reportPath)) {
    console.error('Usage: node summarize-npm-audit.cjs /path/to/npm-audit.json');
    process.exitCode = 2;
    return;
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (error) {
    console.error('Could not parse npm audit JSON:', error.message);
    process.exitCode = 2;
    return;
  }

  const counts = report.metadata?.vulnerabilities || {};
  console.log('AUDIT_TOTALS ' + JSON.stringify({
    info: counts.info || 0,
    low: counts.low || 0,
    moderate: counts.moderate || 0,
    high: counts.high || 0,
    critical: counts.critical || 0,
    total: counts.total || 0,
  }));

  const priority = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
  const issues = Object.values(report.vulnerabilities || {})
    .sort((a, b) => (priority[a.severity] ?? 9) - (priority[b.severity] ?? 9) || a.name.localeCompare(b.name));

  for (const issue of issues.slice(0, 100)) {
    const advisories = (issue.via || []).map((entry) => {
      if (typeof entry === 'string') return entry;
      return [entry.title, entry.range ? 'range=' + entry.range : '', entry.url || ''].filter(Boolean).join(' | ');
    }).join(' ; ');
    let fix = 'not listed';
    if (issue.fixAvailable === false) fix = 'no automatic fix reported';
    else if (issue.fixAvailable === true) fix = 'automatic fix reported';
    else if (issue.fixAvailable && typeof issue.fixAvailable === 'object') {
      fix = 'target=' + issue.fixAvailable.name + '@' + issue.fixAvailable.version +
        (issue.fixAvailable.isSemVerMajor ? ' (major update)' : '');
    }
    console.log('AUDIT_ISSUE ' + JSON.stringify({
      package: issue.name,
      severity: issue.severity,
      direct: Boolean(issue.isDirect),
      installedRange: issue.range || '',
      fix,
      advisories,
    }));
  }
  if (issues.length > 100) console.log('AUDIT_ISSUES_TRUNCATED total=' + issues.length);
}

main();
