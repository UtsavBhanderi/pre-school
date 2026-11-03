'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const ParentAccount = require('../models/ParentAccount');

test('parent account schema requires a user and registered phone', () => {
  const account = new ParentAccount({ studentIds: [] });
  const validation = account.validateSync();
  assert.ok(validation.errors.userId);
  assert.ok(validation.errors.registeredPhone);
});

test('parent account schema stores only supported status values', () => {
  const account = new ParentAccount({
    userId: new mongoose.Types.ObjectId(),
    studentIds: [new mongoose.Types.ObjectId()],
    registeredPhone: '9876543210',
    status: 'active',
  });
  assert.equal(account.validateSync(), undefined);
});
