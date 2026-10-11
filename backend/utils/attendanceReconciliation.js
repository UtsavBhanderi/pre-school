'use strict';

// The caller sorts records newest-first. If legacy duplicates exist, retain the
// newest status per child and update it instead of creating a second entry.
const reconcileAttendanceEntries = (studentDetails, records) => {
  const incomingIds = new Set((studentDetails || []).map((detail) => String(detail.studentId)));
  const latestEntryByStudent = new Map();

  for (const record of records || []) {
    for (const entry of record.studentDetails || []) {
      const studentId = String(entry.studentId);
      if (incomingIds.has(studentId) && !latestEntryByStudent.has(studentId)) {
        latestEntryByStudent.set(studentId, { record, entry });
      }
    }
  }

  const recordsToSave = new Map();
  const newEntries = [];
  let updatedCount = 0;

  for (const detail of studentDetails || []) {
    const studentId = String(detail.studentId);
    const existing = latestEntryByStudent.get(studentId);
    const reason = detail.status === 'absent' ? String(detail.reason || '').trim() : '';

    if (existing) {
      existing.entry.status = detail.status;
      existing.entry.reason = reason;
      recordsToSave.set(String(existing.record._id), existing.record);
      updatedCount += 1;
    } else {
      newEntries.push({ studentId: detail.studentId, status: detail.status, reason });
    }
  }

  return {
    recordsToSave: [...recordsToSave.values()],
    newEntries,
    updatedCount,
  };
};

module.exports = { reconcileAttendanceEntries };
