'use strict';

const REQUIRED_COLLECTIONS = ['users', 'students', 'teachers'];

function hasUniqueIndex(indexes, expectedKeys) {
  return Array.isArray(indexes) && indexes.some((index) =>
    index.unique === true &&
    JSON.stringify(Object.entries(index.key || {})) === JSON.stringify(Object.entries(expectedKeys))
  );
}

function validateSingleSchoolSnapshot({
  collectionNames = [],
  activeAdministratorCount = 0,
  organizationCount = 0,
  membershipCount = 0,
  userIndexes = [],
  studentIndexes = [],
  teacherIndexes = [],
} = {}) {
  const errors = [];
  const names = new Set(collectionNames);
  const missingCollections = REQUIRED_COLLECTIONS.filter((name) => !names.has(name));

  if (missingCollections.length) {
    errors.push('Missing core single-school collections: ' + missingCollections.join(', ') + '.');
  }
  if (!Number.isInteger(activeAdministratorCount) || activeAdministratorCount < 1) {
    errors.push('The restored single-school database must contain at least one active administrator account.');
  }
  if (!Number.isInteger(organizationCount) || organizationCount < 0 ||
      !Number.isInteger(membershipCount) || membershipCount < 0) {
    errors.push('The restored database contains invalid organization or membership counts.');
  } else if (organizationCount > 0 || membershipCount > 0) {
    errors.push('The backup contains SaaS organization records; this release requires a single-school database with no organizations or memberships.');
  }

  const requiredIndexes = [
    { label: 'users.email', indexes: userIndexes, keys: { email: 1 } },
    { label: 'students.stuNo', indexes: studentIndexes, keys: { stuNo: 1 } },
    { label: 'teachers.GR_No', indexes: teacherIndexes, keys: { GR_No: 1 } },
  ];
  for (const requirement of requiredIndexes) {
    if (!hasUniqueIndex(requirement.indexes, requirement.keys)) {
      errors.push('Missing required unique identity index for ' + requirement.label + '.');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { REQUIRED_COLLECTIONS, hasUniqueIndex, validateSingleSchoolSnapshot };
