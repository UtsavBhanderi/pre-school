'use strict';

function audiencesForAnnouncementRole(role) {
  if (role === 'admin') return ['all', 'teachers', 'parents', 'both'];
  if (role === 'teacher') return ['all', 'teachers', 'both'];
  if (role === 'parent') return ['all', 'parents', 'both'];
  return null;
}

module.exports = { audiencesForAnnouncementRole };
