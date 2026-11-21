'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

test('student admission schema retains school fields submitted by the registration form', () => {
  const student = new Student({
    firstName: 'Aarav',
    nationality: 'Indian',
    schoolName: 'Blooming Buds Preschool',
    schoolBoard: 'GSEB',
  });

  const savedShape = student.toObject();
  assert.equal(savedShape.nationality, 'Indian');
  assert.equal(savedShape.schoolName, 'Blooming Buds Preschool');
  assert.equal(savedShape.schoolBoard, 'GSEB');
});

test('student contact numbers preserve leading zeroes as strings', () => {
  const student = new Student({
    firstName: 'Aarav',
    FatherMobileNumber: '09876543210',
    FatherPhoneNumber: '02611234567',
    EmergencyPhoneNumber: '09870001122',
    studentAadharNo: '001234567890',
  });

  assert.equal(student.FatherMobileNumber, '09876543210');
  assert.equal(student.FatherPhoneNumber, '02611234567');
  assert.equal(student.EmergencyPhoneNumber, '09870001122');
  assert.equal(student.studentAadharNo, '001234567890');
  assert.equal(Student.schema.path('FatherMobileNumber').instance, 'String');
});

test('teacher contact numbers and driving licence preserve exact digits', () => {
  const teacher = new Teacher({
    RegisterPhoneNumber: '09876543210',
    MotherMobileNumber: '09870000001',
    FatherMobileNumber: '02611234567',
    EmergencyPhoneNumber: '09870000002',
    drivingLicence: 'GJ0520200012345',
  });

  assert.equal(teacher.RegisterPhoneNumber, '09876543210');
  assert.equal(teacher.MotherMobileNumber, '09870000001');
  assert.equal(teacher.FatherMobileNumber, '02611234567');
  assert.equal(teacher.EmergencyPhoneNumber, '09870000002');
  assert.equal(teacher.drivingLicence, 'GJ0520200012345');
  assert.equal(Teacher.schema.path('FatherMobileNumber').instance, 'String');
});
