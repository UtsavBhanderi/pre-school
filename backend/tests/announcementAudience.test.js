'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { audiencesForAnnouncementRole } = require('../utils/announcementAudience');

test('school notices are visible only to their intended authenticated audiences', () => {
  assert.deepEqual(audiencesForAnnouncementRole('parent'), ['all', 'parents', 'both']);
  assert.deepEqual(audiencesForAnnouncementRole('teacher'), ['all', 'teachers', 'both']);
  assert.deepEqual(audiencesForAnnouncementRole('admin'), ['all', 'teachers', 'parents', 'both']);
  assert.equal(audiencesForAnnouncementRole('guest'), null);
  assert.equal(audiencesForAnnouncementRole(undefined), null);
});
