'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('single-school calendar events respect parent and teacher visibility while admins manage all audiences', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_calendar_audience_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Student = require('../models/Student');
  const ParentAccount = require('../models/ParentAccount');
  const Teacher = require('../models/Teacher');
  const Calendar = require('../models/Calendar');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const admin = await User.create({ username: 'Calendar Admin ' + tag, email: 'calendar-admin-' + tag + '@example.test', password: 'CalendarAdminPassword123', role: 'admin' });
  const teacher = await User.create({ username: 'Calendar Teacher ' + tag, email: 'calendar-teacher-' + tag + '@example.test', password: 'CalendarTeacherPassword123', role: 'teacher' });
  const parent = await User.create({ username: 'Calendar Parent ' + tag, email: 'calendar-parent-' + tag + '@example.test', password: 'CalendarParentPassword123', role: 'parent' });
  await Teacher.create({ Email: teacher.email, standard: 'Nursery' });
  const student = await Student.create({
    firstName: 'Calendar', lastName: 'Child', standard: 'Nursery',
    stuNo: 'CAL-' + tag, parentEmail: parent.email,
  });
  await ParentAccount.create({ userId: parent._id, studentIds: [student._id], registeredPhone: '9876543210' });

  const tokenFor = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role, authVersion: 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  const tokens = { admin: tokenFor(admin), teacher: tokenFor(teacher), parent: tokenFor(parent) };

  async function api(pathname, { role, method = 'GET', body, params } = {}) {
    const url = new URL(pathname, 'http://127.0.0.1:' + server.address().port);
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
    const response = await fetch(url, {
      method,
      headers: {
        'x-auth-token': tokens[role],
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }

  t.after(async () => {
    await Promise.allSettled([
      mongoose.connection.dropDatabase(),
      new Promise((resolve) => server.close(resolve)),
    ]);
    await mongoose.disconnect();
  });

  const start = (daysAhead) => {
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    date.setHours(9, 0, 0, 0);
    return date;
  };
  const createEvent = async (title, audience, standards = []) => {
    const startsAt = start(4);
    const endsAt = new Date(startsAt);
    endsAt.setHours(endsAt.getHours() + 1);
    return api('/api/events', {
      role: 'admin', method: 'POST',
      body: { title, audience, standards, start: startsAt.toISOString(), end: endsAt.toISOString(), color: '#3788d8' },
    });
  };

  await t.test('admin creates events for each audience and can see every event', async () => {
    for (const [title, audience] of [['Parents only', 'parents'], ['Teachers only', 'teachers'], ['Everyone', 'all']]) {
      const response = await createEvent(title, audience);
      assert.equal(response.status, 201);
      assert.equal(response.data.audience, audience);
    }
    const adminEvents = await api('/api/events', { role: 'admin' });
    assert.equal(adminEvents.status, 200);
    assert.deepEqual(adminEvents.data.map((event) => event.audience).sort(), ['all', 'parents', 'teachers']);
  });

  const calendarFrom = new Date().toISOString().slice(0, 10);
  const calendarToDate = new Date();
  calendarToDate.setDate(calendarToDate.getDate() + 10);
  const calendarTo = calendarToDate.toISOString().slice(0, 10);
  const calendarParams = { from: calendarFrom, to: calendarTo };


  await t.test('administrator can target events to selected standards only', async () => {
    const nursery = await createEvent('Nursery selected standards', 'all', ['Nursery']);
    const junior = await createEvent('Junior selected standards', 'all', ['ENG JR.']);
    assert.equal(nursery.status, 201);
    assert.deepEqual(nursery.data.standards, ['Nursery']);
    assert.equal(junior.status, 201);
    assert.deepEqual(junior.data.standards, ['ENG JR.']);

    const parentCalendar = await api('/api/parent-portal/calendar', { role: 'parent', params: calendarParams });
    const teacherCalendar = await api('/api/teacher-portal/calendar', { role: 'teacher', params: calendarParams });
    const parentTitles = parentCalendar.data.events.map((event) => event.title);
    const teacherTitles = teacherCalendar.data.events.map((event) => event.title);
    assert.ok(parentTitles.includes('Nursery selected standards'));
    assert.ok(!parentTitles.includes('Junior selected standards'));
    assert.ok(teacherTitles.includes('Nursery selected standards'));
    assert.ok(!teacherTitles.includes('Junior selected standards'));
  });

  await t.test('parents and teachers see only the events addressed to their audience', async () => {
    const parentCalendar = await api('/api/parent-portal/calendar', { role: 'parent', params: calendarParams });
    const teacherCalendar = await api('/api/teacher-portal/calendar', { role: 'teacher', params: calendarParams });
    assert.equal(parentCalendar.status, 200);
    assert.equal(teacherCalendar.status, 200);

    const parentTitles = parentCalendar.data.events.map((event) => event.title);
    const teacherTitles = teacherCalendar.data.events.map((event) => event.title);
    assert.deepEqual(parentTitles.sort(), ['Everyone', 'Nursery selected standards', 'Parents only']);
    assert.deepEqual(teacherTitles.sort(), ['Everyone', 'Nursery selected standards', 'Teachers only']);
  });

  await t.test('administrator can change event visibility and still retain full calendar access', async () => {
    const events = await api('/api/events', { role: 'admin' });
    const parentOnly = events.data.find((event) => event.title === 'Parents only');
    const updated = await api('/api/events/' + parentOnly._id, {
      role: 'admin', method: 'PUT', body: { audience: 'teachers' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.audience, 'teachers');

    const refreshedParents = await api('/api/parent-portal/calendar', { role: 'parent', params: calendarParams });
    const refreshedTeachers = await api('/api/teacher-portal/calendar', { role: 'teacher', params: calendarParams });
    assert.ok(refreshedParents.data.events.every((event) => event.title !== 'Parents only'));
    assert.ok(refreshedTeachers.data.events.some((event) => event.title === 'Parents only'));

    // A FullCalendar drag/resize update sends only the new dates. It must keep
    // the existing audience instead of silently broadening the event to everyone.
    const dragged = await api('/api/events/' + parentOnly._id, {
      role: 'admin',
      method: 'PUT',
      body: {
        start: new Date(new Date(parentOnly.start).getTime() + 86400000).toISOString(),
        end: new Date(new Date(parentOnly.end).getTime() + 86400000).toISOString(),
      },
    });
    assert.equal(dragged.status, 200);
    assert.equal(dragged.data.audience, 'teachers');

    const refreshedAfterDragParents = await api('/api/parent-portal/calendar', { role: 'parent', params: calendarParams });
    const refreshedAfterDragTeachers = await api('/api/teacher-portal/calendar', { role: 'teacher', params: calendarParams });
    assert.ok(refreshedAfterDragParents.data.events.every((event) => event.title !== 'Parents only'));
    assert.ok(refreshedAfterDragTeachers.data.events.some((event) => event.title === 'Parents only'));

    const refreshedAdmin = await api('/api/events', { role: 'admin' });
    assert.equal(refreshedAdmin.data.length, 5);
  });

  await t.test('a parent cannot read the teacher calendar endpoint or administer events', async () => {
    const deniedTeacherCalendar = await api('/api/teacher-portal/calendar', { role: 'parent' });
    const deniedAdminCalendar = await api('/api/events', { role: 'teacher' });
    assert.equal(deniedTeacherCalendar.status, 403);
    assert.equal(deniedAdminCalendar.status, 403);
  });
});
