'use strict';

function getAssignedClasses(membership) {
  if (membership?.role !== 'teacher' || membership?.status !== 'active') return [];
  return Array.isArray(membership.classNames)
    ? [...new Set(membership.classNames.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim()))]
    : [];
}

function canAccessAssignedClass(membership, className) {
  if (!membership || membership.status !== 'active' || typeof className !== 'string' || !className.trim()) return false;
  if (membership.role !== 'teacher') return true;
  return getAssignedClasses(membership).includes(className.trim());
}

module.exports = { getAssignedClasses, canAccessAssignedClass };
