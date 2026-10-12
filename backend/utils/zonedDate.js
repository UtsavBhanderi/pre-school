'use strict';

const { parseDateOnly } = require('./dateOnly');

function partsAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function utcOffsetAt(instant, timeZone) {
  const parts = partsAt(instant, timeZone);
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return representedAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function localClockToUtc(year, month, day, hour, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const next = Date.UTC(year, month - 1, day, hour, 0, 0) - utcOffsetAt(new Date(guess), timeZone);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function getZonedDayBounds(dateString, timeZone = 'Asia/Kolkata') {
  const parsed = parseDateOnly(dateString);
  if (!parsed) return null;
  try {
    // Also validates the timezone before calculating any boundaries.
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    return null;
  }
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: localClockToUtc(year, month, day, 0, timeZone),
    end: localClockToUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), 0, timeZone),
  };
}

function getTodayInTimeZone(timeZone = 'Asia/Kolkata', now = new Date()) {
  try {
    const parts = partsAt(now, timeZone);
    return parts.year + '-' + parts.month + '-' + parts.day;
  } catch {
    return null;
  }
}

module.exports = { getZonedDayBounds, getTodayInTimeZone };
