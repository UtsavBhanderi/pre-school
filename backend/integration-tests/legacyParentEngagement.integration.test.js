'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('single-school parent engagement supports homework, private messages and polls', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_parent_engagement_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';
  process.env.SINGLE_SCHOOL_NAME = 'Engagement Test School';

  const { app } = require('../server');
  const User = require('../models/User');
  const Student = require('../models/Student');
  const ParentAccount = require('../models/ParentAccount');
  const HomeworkAssignment = require('../models/HomeworkAssignment');
  const ParentComplaint = require('../models/ParentComplaint');
  const ParentPoll = require('../models/ParentPoll');
  const SchoolMessage = require('../models/SchoolMessage');

  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const tag = crypto.randomBytes(5).toString('hex');
  const admin = await User.create({ username: 'School Admin ' + tag, email: 'admin-' + tag + '@example.test', password: 'admin-test-password-123', role: 'admin' });
  const parent = await User.create({ username: 'Family Parent ' + tag, email: 'parent-' + tag + '@example.test', password: 'parent-test-password-123', role: 'parent' });
  const outsider = await User.create({ username: 'Other Parent ' + tag, email: 'other-' + tag + '@example.test', password: 'other-test-password-123', role: 'parent' });
  const student = await Student.create({
    stuNo: 'GR-' + tag, firstName: 'Aarav', middleName: 'Family', lastName: 'Child',
    standard: 'Nursery', batchYear: '2026-2027', parentEmail: parent.email,
    FatherName: parent.username, FatherMobileNumber: 9876543210,
  });
  const otherStudent = await Student.create({
    stuNo: 'GR-OTHER-' + tag, firstName: 'Other', lastName: 'Child',
    standard: 'Nursery', batchYear: '2026-2027', parentEmail: outsider.email,
    FatherName: outsider.username, FatherMobileNumber: 9123456789,
  });
  await ParentAccount.create({ userId: parent._id, studentIds: [student._id], registeredPhone: '9876543210' });
  await ParentAccount.create({ userId: outsider._id, studentIds: [otherStudent._id], registeredPhone: '9123456789' });

  const tokenFor = (user) => jwt.sign({ user: { id: String(user._id), role: user.role, authVersion: 0 } }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const adminToken = tokenFor(admin);
  const parentToken = tokenFor(parent);
  const outsiderToken = tokenFor(outsider);
  const teacherToken = tokenFor(teacher);
  async function api(path, { token, method = 'GET', body } = {}) {
    const response = await fetch(new URL(path, 'http://127.0.0.1:' + server.address().port), {
      method,
      headers: { ...(token ? { 'x-auth-token': token } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  }

  t.after(async () => {
    await Promise.allSettled([
      HomeworkAssignment.deleteMany({}), ParentComplaint.deleteMany({}), ParentPoll.deleteMany({}), SchoolMessage.deleteMany({}),
      ParentAccount.deleteMany({}), Student.deleteMany({ _id: { $in: [student._id, otherStudent._id] } }),
      User.deleteMany({ _id: { $in: [admin._id, parent._id, outsider._id, teacher._id] } }),
      mongoose.connection.dropDatabase(),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  let homeworkId;
  await t.test('staff publishes class homework and parents see only linked children', async () => {
    const published = await api('/api/school-engagement/staff/homework', {
      token: adminToken, method: 'POST',
      body: { title: 'Practice colours', instructions: 'Name three colours at home.', standard: 'Nursery', dueDate: new Date(Date.now() + 86400000).toISOString() },
    });
    assert.equal(published.status, 201);
    homeworkId = published.data.homeworkId;
    const list = await api('/api/school-engagement/parent/homework', { token: parentToken });
    assert.equal(list.status, 200);
    assert.equal(list.data.homework.length, 1);
    assert.equal(list.data.homework[0].children.length, 1);
    assert.equal(list.data.homework[0].children[0].name, 'Aarav Family Child');
    const outsiderList = await api('/api/school-engagement/parent/homework', { token: outsiderToken });
    assert.equal(outsiderList.data.homework[0].children[0].name, 'Other Child');
    const completed = await api('/api/school-engagement/parent/homework/' + homeworkId + '/submissions', {
      token: parentToken, method: 'POST', body: { studentId: String(student._id), responseText: 'We practised red, blue and green.' },
    });
    assert.equal(completed.status, 200);
    const after = await api('/api/school-engagement/parent/homework', { token: parentToken });
    assert.equal(after.data.homework[0].children[0].submitted, true);
    assert.equal(after.data.homework[0].children[0].responseText, 'We practised red, blue and green.');
  });

  let complaintId;
  await t.test('parents can create private child-linked complaints and staff can respond', async () => {
    const created = await api('/api/school-engagement/parent/complaints', {
      token: parentToken, method: 'POST',
      body: { studentId: String(student._id), category: 'classroom', subject: 'Classroom concern', message: 'Please call me about the classroom activity.' },
    });
    assert.equal(created.status, 201);
    complaintId = created.data.complaintId;
    const parentList = await api('/api/school-engagement/parent/complaints', { token: parentToken });
    assert.equal(parentList.data.complaints.length, 1);
    const outsiderList = await api('/api/school-engagement/parent/complaints', { token: outsiderToken });
    assert.equal(outsiderList.data.complaints.length, 0);
    const staffList = await api('/api/school-engagement/staff/complaints', { token: adminToken });
    assert.equal(staffList.data.complaints.length, 1);
    const reply = await api('/api/school-engagement/staff/complaints/' + complaintId, {
      token: adminToken, method: 'PATCH',
      body: { status: 'resolved', schoolReply: 'Thank you. The class teacher will call you today.' },
    });
    assert.equal(reply.status, 200);
    const updated = await api('/api/school-engagement/parent/complaints', { token: parentToken });
    assert.equal(updated.data.complaints[0].status, 'resolved');
    assert.match(updated.data.complaints[0].schoolReply, /class teacher/);
  });

  let pollId;
  await t.test('parents can vote once and only aggregate poll results are returned', async () => {
    const created = await api('/api/school-engagement/staff/polls', {
      token: adminToken, method: 'POST',
      body: { question: 'Which day suits the family picnic?', options: ['Saturday', 'Sunday'], standard: 'all', endsAt: new Date(Date.now() + 86400000).toISOString() },
    });
    assert.equal(created.status, 201);
    pollId = created.data.pollId;
    const list = await api('/api/school-engagement/parent/polls', { token: parentToken });
    assert.equal(list.status, 200);
    assert.equal(list.data.polls.length, 1);
    const vote = await api('/api/school-engagement/parent/polls/' + pollId + '/votes', { token: parentToken, method: 'POST', body: { optionIndex: 1 } });
    assert.equal(vote.status, 200);
    assert.equal(vote.data.poll.results[1], 1);
    const secondVote = await api('/api/school-engagement/parent/polls/' + pollId + '/votes', { token: parentToken, method: 'POST', body: { optionIndex: 0 } });
    assert.equal(secondVote.status, 409);
    const staffPolls = await api('/api/school-engagement/staff/polls', { token: adminToken });
    assert.equal(staffPolls.data.polls[0].totalVotes, 1);
    assert.equal(JSON.stringify(staffPolls.data.polls[0]).includes(String(parent._id)), false);
  });

  await t.test('admin messages and teacher polls are delivered only to their selected audiences', async () => {
    const teachersOnly = await api('/api/school-engagement/staff/messages', {
      token: adminToken, method: 'POST',
      body: { title: 'Teacher briefing', message: 'Staff meeting at 8:30 AM.', audience: 'teachers', priority: 'important' },
    });
    assert.equal(teachersOnly.status, 201);
    const teacherList = await api('/api/school-engagement/staff/messages', { token: teacherToken });
    assert.equal(teacherList.status, 200);
    assert.ok(teacherList.data.messages.some((item) => item.id === teachersOnly.data.item.id));
    const parentList = await api('/api/school-engagement/parent/messages', { token: parentToken });
    assert.equal(parentList.status, 200);
    assert.ok(parentList.data.messages.every((item) => item.id !== teachersOnly.data.item.id));

    const read = await api('/api/school-engagement/staff/messages/' + teachersOnly.data.item.id + '/read', {
      token: teacherToken, method: 'POST',
    });
    assert.equal(read.status, 200);
    const teacherAfterRead = await api('/api/school-engagement/staff/messages', { token: teacherToken });
    assert.equal(teacherAfterRead.data.messages.find((item) => item.id === teachersOnly.data.item.id).hasRead, true);

    const everyone = await api('/api/school-engagement/staff/messages', {
      token: adminToken, method: 'POST',
      body: { title: 'School holiday update', message: 'The school will remain closed tomorrow.', audience: 'all' },
    });
    assert.equal(everyone.status, 201);
    const parentUpdates = await api('/api/school-engagement/parent/messages', { token: parentToken });
    const teacherUpdates = await api('/api/school-engagement/staff/messages', { token: teacherToken });
    assert.ok(parentUpdates.data.messages.some((item) => item.id === everyone.data.item.id));
    assert.ok(teacherUpdates.data.messages.some((item) => item.id === everyone.data.item.id));

    const teacherBroadcastDenied = await api('/api/school-engagement/staff/messages', {
      token: teacherToken, method: 'POST',
      body: { title: 'Not permitted', message: 'Teachers cannot send school-wide notices.', audience: 'all' },
    });
    assert.equal(teacherBroadcastDenied.status, 403);

    const teacherPoll = await api('/api/school-engagement/staff/polls', {
      token: adminToken, method: 'POST',
      body: {
        question: 'Which staff training time works best?',
        options: ['Before school', 'After school'],
        standard: 'all',
        audience: 'teachers',
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    assert.equal(teacherPoll.status, 201);
    const teacherPolls = await api('/api/school-engagement/staff/polls', { token: teacherToken });
    assert.ok(teacherPolls.data.polls.some((item) => item.id === teacherPoll.data.pollId));
    const parentPolls = await api('/api/school-engagement/parent/polls', { token: parentToken });
    assert.ok(parentPolls.data.polls.every((item) => item.id !== teacherPoll.data.pollId));

    const teacherVote = await api('/api/school-engagement/staff/polls/' + teacherPoll.data.pollId + '/votes', {
      token: teacherToken, method: 'POST', body: { optionIndex: 1 },
    });
    assert.equal(teacherVote.status, 200);
    const repeatTeacherVote = await api('/api/school-engagement/staff/polls/' + teacherPoll.data.pollId + '/votes', {
      token: teacherToken, method: 'POST', body: { optionIndex: 0 },
    });
    assert.equal(repeatTeacherVote.status, 409);
    const parentCannotVote = await api('/api/school-engagement/parent/polls/' + teacherPoll.data.pollId + '/votes', {
      token: parentToken, method: 'POST', body: { optionIndex: 0 },
    });
    assert.equal(parentCannotVote.status, 404);
  });

  await t.test('parent cannot submit homework for a child outside its saved allow-list', async () => {
    const response = await api('/api/school-engagement/parent/homework/' + homeworkId + '/submissions', {
      token: parentToken, method: 'POST', body: { studentId: String(otherStudent._id), responseText: 'Not my child' },
    });
    assert.equal(response.status, 403);
  });
});
