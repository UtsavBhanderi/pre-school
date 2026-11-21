'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('class subject configuration is validated and locked after academic history exists', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_subject_config_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Subject = require('../models/Subject');
  const Student = require('../models/Student');
  const ReportCard = require('../models/ReportCard');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const admin = await User.create({
    username: 'Subject Admin ' + tag,
    email: 'subject-admin-' + tag + '@example.test',
    password: 'SubjectAdminPassword123',
    role: 'admin',
  });
  const token = jwt.sign(
    { user: { id: String(admin._id), role: 'admin', authVersion: 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function api(pathname, { method = 'GET', body } = {}) {
    const response = await fetch(new URL(pathname, 'http://127.0.0.1:' + server.address().port), {
      method,
      headers: {
        'x-auth-token': token,
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

  await t.test('subject names must be non-empty, bounded and unique', async () => {
    const invalid = await api('/api/subjects', {
      method: 'POST',
      body: { standard: 'ENG JR.', subjects: ['English', ' english '] },
    });
    assert.equal(invalid.status, 400);

    const created = await api('/api/subjects', {
      method: 'POST',
      body: { standard: 'ENG JR.', subjects: ['English', 'Mathematics'] },
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.data.subjects, ['English', 'Mathematics']);

    const duplicate = await api('/api/subjects', {
      method: 'POST',
      body: { standard: 'eng jr.', subjects: ['English'] },
    });
    assert.equal(duplicate.status, 409);
  });

  await t.test('unused subject configuration can be updated and retrieved', async () => {
    const updated = await api('/api/subjects/ENG%20JR.', {
      method: 'PUT',
      body: { subjects: ['English', 'Gujarati'] },
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.data.subjects, ['English', 'Gujarati']);
    assert.equal(updated.data.hasSavedMarks, false);

    const retrieved = await api('/api/subjects/ENG%20JR.');
    assert.equal(retrieved.status, 200);
    assert.deepEqual(retrieved.data.subjects, ['English', 'Gujarati']);

    const listed = await api('/api/subjects');
    assert.equal(listed.status, 200);
    assert.equal(listed.data.length, 1);
  });

  await t.test('saved marks lock the subject list and preserve historical reports', async () => {
    const student = await Student.create({
      firstName: 'Aarav',
      standard: 'ENG JR.',
      stuNo: 'SUB-' + tag,
      marks: [{
        reportId: new mongoose.Types.ObjectId(),
        subjectData: [{ subject: 'English', mark: 9, date: '2026-11-21' }],
        total: 9,
        percentage: 90,
        grade: 'A',
      }],
    });

    const update = await api('/api/subjects/ENG%20JR.', {
      method: 'PUT',
      body: { subjects: ['English', 'Mathematics'] },
    });
    assert.equal(update.status, 409);
    assert.equal(update.data.code, 'SUBJECT_HISTORY_PRESERVED');

    const remove = await api('/api/subjects/ENG%20JR.', { method: 'DELETE' });
    assert.equal(remove.status, 409);
    assert.equal(remove.data.code, 'SUBJECT_HISTORY_PRESERVED');

    const usage = await api('/api/subjects/ENG%20JR.');
    assert.equal(usage.status, 200);
    assert.equal(usage.data.hasSavedMarks, true);
    assert.ok(await Student.exists({ _id: student._id }));
  });

  await t.test('a subject configuration referenced by a report template cannot be deleted', async () => {
    const config = await Subject.create({ standard: 'GUJ SR.', subjects: ['Gujarati'] });
    await ReportCard.create({
      reportName: 'Term 1 ' + tag,
      standard: config.standard,
      description: '100',
      students: [],
    });
    const remove = await api('/api/subjects/GUJ%20SR.', { method: 'DELETE' });
    assert.equal(remove.status, 409);
    assert.equal(remove.data.code, 'SUBJECT_HISTORY_PRESERVED');
  });

  await t.test('unused subject configuration can be deleted', async () => {
    await Subject.create({ standard: 'ENG SR.', subjects: ['English'] });
    const remove = await api('/api/subjects/ENG%20SR.', { method: 'DELETE' });
    assert.equal(remove.status, 200);
    assert.equal(await Subject.exists({ standard: 'ENG SR.' }), null);
  });
});
