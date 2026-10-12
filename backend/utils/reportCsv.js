'use strict';

function csvCell(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);

  let text = String(value);
  // Excel and similar spreadsheet apps may execute cells beginning with formula characters.
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""').replace(/\r\n|\r|\n/g, '\n') + '"';
}

function createCsv(headers, rows) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    throw new TypeError('CSV headers and rows must be arrays.');
  }
  const width = headers.length;
  const lines = [headers, ...rows].map((row) => {
    if (!Array.isArray(row) || row.length !== width) {
      throw new TypeError('Every CSV row must match the header width.');
    }
    return row.map(csvCell).join(',');
  });
  // UTF-8 BOM improves reliable opening of Gujarati/Hindi/other Unicode text in Excel.
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

module.exports = { csvCell, createCsv };
