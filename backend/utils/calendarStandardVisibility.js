'use strict';

function normalizeCalendarStandards(standards = []) {
  if (!Array.isArray(standards)) return [];
  return [...new Set(standards
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))];
}

// Events with no explicit class list remain visible to the selected audience.
// A teacher without a class assignment can therefore see school-wide events,
// but never events addressed to a specific class.
function buildCalendarStandardVisibilityFilter(standards = []) {
  const allowed = normalizeCalendarStandards(standards);
  const anyStandard = [
    { standards: { $exists: false } },
    { standards: { $size: 0 } },
  ];
  if (allowed.length) anyStandard.push({ standards: { $in: allowed } });
  return { $or: anyStandard };
}

module.exports = { normalizeCalendarStandards, buildCalendarStandardVisibilityFilter };
