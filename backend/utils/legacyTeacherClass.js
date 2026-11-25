'use strict';

const Teacher = require('../models/Teacher');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTeacherProfileFilter(email) {
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  if (!normalizedEmail || normalizedEmail.length > 254) return null;
  return { Email: { $regex: '^' + escapeRegExp(normalizedEmail) + '$', $options: 'i' } };
}

function resolveTeacherClassAccess(role, teacherStandard, requestedStandard) {
  if (role !== 'teacher') {
    return { allowed: true, isTeacher: false, standard: requestedStandard ? String(requestedStandard).trim() : '' };
  }

  const assignedStandard = typeof teacherStandard === 'string' ? teacherStandard.trim() : '';
  if (!assignedStandard) {
    return {
      allowed: false,
      code: 'TEACHER_CLASS_NOT_ASSIGNED',
      message: 'Your teacher profile does not have a class assigned. Contact the preschool administrator.',
    };
  }

  const requested = typeof requestedStandard === 'string' ? requestedStandard.trim() : '';
  if (requested && requested !== assignedStandard) {
    return {
      allowed: false,
      code: 'TEACHER_CLASS_FORBIDDEN',
      message: 'You can only access records for your assigned class (' + assignedStandard + ').',
    };
  }

  return { allowed: true, isTeacher: true, standard: assignedStandard };
}

async function getLegacyTeacherScope(user, requestedStandard) {
  if (user?.role !== 'teacher') {
    return resolveTeacherClassAccess(user?.role, '', requestedStandard);
  }

  const filter = buildTeacherProfileFilter(user.email);
  if (!filter) {
    return {
      allowed: false,
      code: 'TEACHER_PROFILE_MISSING',
      message: 'Your login is not linked to a teacher profile. Contact the preschool administrator.',
    };
  }

  const linkedProfile = user?._id
    ? await Teacher.findOne({ userId: user._id }).select('standard').lean()
    : null;
  // Older records are matched by exact email only while they remain unlinked.
  // Never grant access through a profile explicitly assigned to another login.
  const legacyProfile = linkedProfile ? null : await Teacher.findOne({
    ...filter,
    $or: [{ userId: null }, { userId: { $exists: false } }],
  }).select('standard').lean();
  const profile = linkedProfile || legacyProfile;
  return resolveTeacherClassAccess('teacher', profile?.standard, requestedStandard);
}

module.exports = {
  escapeRegExp,
  buildTeacherProfileFilter,
  resolveTeacherClassAccess,
  getLegacyTeacherScope,
};
