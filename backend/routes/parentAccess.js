'use strict';

const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Student = require('../models/Student');
const Guardian = require('../models/Guardian');
const ChildGuardian = require('../models/ChildGuardian');
const OrganizationMembership = require('../models/OrganizationMembership');
const AuditEvent = require('../models/AuditEvent');
const ParentAccount = require('../models/ParentAccount');
const UserAccessAuditEvent = require('../models/UserAccessAuditEvent');
const {
  cleanText,
  normalizePhone,
  normalizeParentIdentifier,
  isEmail,
  isValidParentPhone,
  isValidParentPassword,
  phoneMatches,
  safeSchoolSlug,
  slugifySchoolName,
} = require('../utils/parentAccess');

const router = express.Router();

const signToken = (user) => jwt.sign(
  { user: { id: String(user._id), role: user.role, authVersion: Number.isInteger(user.authVersion) ? user.authVersion : 0 } },
  process.env.JWT_SECRET,
  { expiresIn: '1h' },
);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveSingleSchool() {
  // No Organization documents means the installation is still using the
  // original single-school data model. Do not create SaaS rows just for parents.
  const anyOrganization = await Organization.exists({});
  if (!anyOrganization) {
    const schoolName = cleanText(process.env.SINGLE_SCHOOL_NAME, 120) || 'Pre-School';
    return { mode: 'legacy_single_school', schoolName, slug: slugifySchoolName(schoolName) };
  }

  const configuredId = String(process.env.SINGLE_SCHOOL_ORGANIZATION_ID || '').trim();
  if (configuredId) {
    if (!mongoose.Types.ObjectId.isValid(configuredId)) {
      return { error: 'SINGLE_SCHOOL_ORGANIZATION_ID is not a valid organization ID.', status: 503 };
    }
    const organization = await Organization.findOne({ _id: configuredId, status: 'active' }).lean();
    return organization
      ? { mode: 'organization', organization }
      : { error: 'The configured preschool workspace is not active.', status: 503 };
  }

  const organizations = await Organization.find({ status: 'active' })
    .select('_id name slug status timezone locale currency contact settings createdBy')
    .sort({ createdAt: 1 })
    .limit(2)
    .lean();

  if (organizations.length !== 1) {
    return {
      error: organizations.length > 1
        ? 'More than one active preschool workspace exists. Configure SINGLE_SCHOOL_ORGANIZATION_ID before enabling parent self-registration.'
        : 'The preschool workspace is not configured yet. Ask the school administrator to complete setup.',
      status: 503,
    };
  }
  return { mode: 'organization', organization: organizations[0] };
}

function schoolPortalUrl(req, slug) {
  const configuredFrontend = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  const origin = configuredFrontend || String(req.get('origin') || '').trim().replace(/\/+$/, '');
  return origin ? origin + '/parent-access/' + encodeURIComponent(slug) : '/parent-access/' + encodeURIComponent(slug);
}

function contactValuesForStudent(student) {
  return [
    student.FatherMobileNumber,
    student.FatherPhoneNumber,
    student.EmergencyPhoneNumber,
    student.phoneNumber,
  ];
}

function genericMismatch(res) {
  return res.status(404).json({
    code: 'PARENT_RECORD_NOT_MATCHED',
    message: 'We could not verify those details. Check the GR number or registered parent email and the mobile number on your school record, or contact the school office.',
  });
}

function isLegacyStudentFilter(identifier) {
  const identifierIsEmail = isEmail(identifier);
  const exactIdentifier = new RegExp('^' + escapeRegex(identifier) + '$', 'i');
  return {
    $and: [
      { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] },
      {
        $or: [
          { stuNo: exactIdentifier },
          ...(identifierIsEmail ? [{ parentEmail: exactIdentifier }] : []),
        ],
      },
    ],
  };
}


async function createAutomaticParentUser({ session, organizationId = null, normalizedPhone, identifier, students = [], preferredUserIds = [] }) {
  const userIds = [...new Set(preferredUserIds.filter(Boolean).map(String))];
  if (userIds.length > 1) {
    const conflict = new Error('This mobile number is linked to more than one parent account. Contact the preschool office to consolidate the family record.');
    conflict.code = 'MULTIPLE_PARENT_ACCOUNTS';
    throw conflict;
  }

  const withSession = (query) => (session ? query.session(session) : query);
  let user = userIds.length ? await withSession(User.findById(userIds[0])) : null;
  if (!user) {
    const savedEmail = students
      .map((student) => String(student.parentEmail || '').trim().toLowerCase())
      .find((email) => isEmail(email));
    const familyKey = savedEmail || (isEmail(identifier) ? identifier : students
      .map((student) => String(student._id || student.stuNo || ''))
      .filter(Boolean)
      .sort()
      .join('|'));
    const identityHash = crypto.createHash('sha256')
      .update([String(organizationId || 'legacy-single-school'), normalizedPhone, familyKey || identifier].join('|'))
      .digest('hex')
      .slice(0, 40);
    const email = 'parent-' + identityHash + '@parent-login.invalid';
    user = await withSession(User.findOne({ email }));
    if (!user) {
      const nameSource = students.find((student) => student.FatherName || student.MotherName);
      const username = cleanText(nameSource?.FatherName || nameSource?.MotherName || 'Parent / Guardian', 80);
      const userData = {
        username,
        email,
        password: crypto.randomBytes(48).toString('base64url'),
        role: 'parent',
        status: 'active',
      };
      if (session) {
        const [createdUser] = await User.create([userData], { session });
        user = createdUser;
      } else {
        user = await User.create(userData);
      }
    }
  }

  if (user.status === 'suspended') {
    const suspended = new Error('Parent portal access is suspended. Contact the preschool office.');
    suspended.code = 'PARENT_ACCOUNT_INACTIVE';
    throw suspended;
  }
  if (user.role !== 'parent') {
    const roleConflict = new Error('These family details are already connected to a non-parent account. Contact the preschool office.');
    roleConflict.code = 'STAFF_MEMBERSHIP_EXISTS';
    throw roleConflict;
  }
  return user;
}

async function activateLegacyParent({ req, res, school, identifier, submittedPhone, normalizedPhone, parentName, loginEmail, password, automatic = false }) {
  const candidates = await Student.find(isLegacyStudentFilter(identifier))
    .select('_id stuNo firstName middleName lastName standard parentEmail phoneNumber FatherName MotherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber')
    .limit(100)
    .lean();

  const directMatches = candidates.filter((student) =>
    phoneMatches(contactValuesForStudent(student), submittedPhone)
  );
  if (!directMatches.length) return genericMismatch(res);

  // Link siblings automatically only when both the same saved parent email and
  // the same registered phone match. Without a shared email, link only the
  // specifically verified GR record.
  const siblingEmails = [...new Set(directMatches
    .map((student) => String(student.parentEmail || '').trim().toLowerCase())
    .filter(Boolean))];
  let matchedStudents = [...directMatches];
  if (siblingEmails.length) {
    const siblings = await Student.find({
      $and: [
        { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] },
        { parentEmail: { $in: siblingEmails } },
      ],
    })
      .select('_id stuNo firstName middleName lastName standard parentEmail phoneNumber FatherName MotherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber')
      .limit(100)
      .lean();
    const matchedIds = new Set(directMatches.map((student) => String(student._id)));
    for (const sibling of siblings) {
      if (phoneMatches(contactValuesForStudent(sibling), submittedPhone)) matchedIds.add(String(sibling._id));
    }
    matchedStudents = siblings.filter((student) => matchedIds.has(String(student._id)));
    for (const student of directMatches) {
      if (!matchedIds.has(String(student._id))) matchedStudents.push(student);
    }
  }
  const uniqueStudents = [...new Map(matchedStudents.map((student) => [String(student._id), student])).values()];

  let session;
  try {
    session = await mongoose.startSession();
    let activeUser;
    await session.withTransaction(async () => {
      let user;
      if (automatic) {
        const linkedAccounts = await ParentAccount.find({
          studentIds: { $in: uniqueStudents.map((student) => student._id) },
          registeredPhone: normalizedPhone,
        }).select('userId').session(session).lean();
        user = await createAutomaticParentUser({
          session,
          normalizedPhone,
          identifier,
          students: uniqueStudents,
          preferredUserIds: linkedAccounts.map((account) => account.userId),
        });
      } else {
        user = await User.findOne({ email: loginEmail }).session(session);
        if (user) {
          if (user.status === 'suspended' || !(await user.matchPassword(password))) {
            const error = new Error('This sign-in email already has an account. Enter that account’s current password, or use another email address.');
            error.code = 'EXISTING_ACCOUNT_PASSWORD';
            throw error;
          }
        } else {
          if (!isValidParentPassword(password)) {
            const error = new Error('New parent accounts require a password with at least 12 characters.');
            error.code = 'NEW_PASSWORD_TOO_SHORT';
            throw error;
          }
          const [createdUser] = await User.create([{
            username: parentName,
            email: loginEmail,
            password,
            role: 'parent',
            status: 'active',
          }], { session });
          user = createdUser;
        }
      }

      let parentAccount = await ParentAccount.findOne({ userId: user._id })
        .select('+registeredPhone')
        .session(session);
      if (parentAccount && parentAccount.status !== 'active') {
        const inactive = new Error('Parent portal access is inactive. Contact the preschool office to restore it.');
        inactive.code = 'PARENT_ACCOUNT_INACTIVE';
        throw inactive;
      }
      if (parentAccount && normalizePhone(parentAccount.registeredPhone) !== normalizedPhone) {
        const phoneMismatch = new Error('This login is already linked to a different registered mobile number. Contact the preschool office to update the family link.');
        phoneMismatch.code = 'PARENT_PHONE_CHANGE_REQUIRED';
        throw phoneMismatch;
      }

      const familyAlreadyActivated = await ParentAccount.findOne({
        userId: { $ne: user._id },
        studentIds: { $in: uniqueStudents.map((student) => student._id) },
        registeredPhone: normalizedPhone,
        status: 'active',
      }).session(session).select('userId').lean();
      if (familyAlreadyActivated) {
        const duplicate = new Error('This child and mobile number are already linked to another parent login. Use that login or contact the school office if you need account recovery.');
        duplicate.code = 'FAMILY_ALREADY_ACTIVATED';
        throw duplicate;
      }

      const studentIds = [...new Set([
        ...(parentAccount?.studentIds || []).map(String),
        ...uniqueStudents.map((student) => String(student._id)),
      ])].map((id) => new mongoose.Types.ObjectId(id));

      if (parentAccount) {
        parentAccount.studentIds = studentIds;
        parentAccount.lastVerifiedAt = new Date();
        await parentAccount.save({ session });
      } else {
        await ParentAccount.create([{
          userId: user._id,
          studentIds,
          registeredPhone: normalizedPhone,
          status: 'active',
          activatedAt: new Date(),
          lastVerifiedAt: new Date(),
        }], { session });
      }

      await UserAccessAuditEvent.create([{
        actorUserId: user._id,
        targetUserId: user._id,
        targetName: user.username,
        targetEmail: user.email,
        action: 'parent.access_activated',
        previousRole: user.role,
        role: user.role,
        previousStatus: 'active',
        status: 'active',
        reason: 'Parent self-service access activated after matching the school GR/email and registered mobile number.',
        changedFields: ['parentAccount', 'linkedChildren'],
        ipAddress: String(req.ip || '').slice(0, 64),
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      }], { session });

      activeUser = user;
    });

    return res.status(automatic ? 200 : 201).json({
      message: automatic ? 'You are signed in to your family portal.' : 'Parent access is ready. You are now signed in.',
      token: signToken(activeUser),
      user: {
        id: String(activeUser._id),
        username: activeUser.username,
        email: activeUser.email,
        role: activeUser.role,
        parentAccount: { mode: 'legacy_single_school', studentCount: uniqueStudents.length },
      },
      school: { name: school.schoolName, slug: school.slug },
    });
  } catch (error) {
    if (error.code === 'EXISTING_ACCOUNT_PASSWORD') return res.status(401).json({ code: error.code, message: error.message });
    if (error.code === 'NEW_PASSWORD_TOO_SHORT') return res.status(400).json({ code: error.code, message: error.message });
    if (error.code === 'PARENT_ACCOUNT_INACTIVE' || error.code === 'PARENT_PHONE_CHANGE_REQUIRED' ||
        error.code === 'FAMILY_ALREADY_ACTIVATED' || error.code === 'MULTIPLE_PARENT_ACCOUNTS') {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    if (error.code === 11000) return res.status(409).json({ message: 'This parent login was created in another request. Please sign in with your email and password.' });
    console.error('Unable to activate standalone parent account:', {
      name: error?.name || 'activation_error',
      code: error?.code || null,
      message: String(error?.message || 'Unknown database error').slice(0, 500),
    });
    return res.status(503).json({ message: 'Parent access could not be activated safely. Please contact the preschool office.' });
  } finally {
    if (session) await session.endSession();
  }
}


/**
 * Legacy single-school direct parent sign-in.
 *
 * This path intentionally does not use MongoDB transactions because many
 * single-school/self-hosted MongoDB deployments run as standalone servers.
 * Every write is idempotent and the parent allow-list is written only after
 * both the GR/email and saved mobile number have matched.
 */
async function loginLegacyParent({ req, res, school, identifier, submittedPhone, normalizedPhone }) {
  const candidates = await Student.find(isLegacyStudentFilter(identifier))
    .select('_id stuNo firstName middleName lastName standard parentEmail phoneNumber FatherName MotherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber')
    .limit(100)
    .lean();

  const directMatches = candidates.filter((student) =>
    phoneMatches(contactValuesForStudent(student), submittedPhone)
  );
  if (!directMatches.length) return genericMismatch(res);

  const siblingEmails = [...new Set(directMatches
    .map((student) => String(student.parentEmail || '').trim().toLowerCase())
    .filter(Boolean))];
  let matchedStudents = [...directMatches];

  if (siblingEmails.length) {
    const siblings = await Student.find({
      $and: [
        { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] },
        { parentEmail: { $in: siblingEmails } },
      ],
    })
      .select('_id stuNo firstName middleName lastName standard parentEmail phoneNumber FatherName MotherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber')
      .limit(100)
      .lean();

    const matchedIds = new Set(directMatches.map((student) => String(student._id)));
    for (const sibling of siblings) {
      if (phoneMatches(contactValuesForStudent(sibling), submittedPhone)) {
        matchedIds.add(String(sibling._id));
      }
    }
    matchedStudents = siblings.filter((student) => matchedIds.has(String(student._id)));
    for (const student of directMatches) {
      if (!matchedIds.has(String(student._id))) matchedStudents.push(student);
    }
  }

  const uniqueStudents = [...new Map(
    matchedStudents.map((student) => [String(student._id), student])
  ).values()];
  const studentIds = uniqueStudents.map((student) => student._id);

  const existingFamilyAccounts = await ParentAccount.find({
    studentIds: { $in: studentIds },
  })
    .select('userId status studentIds')
    .select('+registeredPhone')
    .lean();

  const matchingFamilyAccounts = existingFamilyAccounts.filter((account) =>
    normalizePhone(account.registeredPhone) === normalizedPhone
  );
  const linkedUserIds = [...new Set(matchingFamilyAccounts.map((account) => String(account.userId)))];

  if (linkedUserIds.length > 1) {
    return res.status(409).json({
      code: 'MULTIPLE_PARENT_ACCOUNTS',
      message: 'These family records are linked to multiple parent accounts. Contact the preschool office to consolidate them.',
    });
  }

  const user = await createAutomaticParentUser({
    session: null,
    normalizedPhone,
    identifier,
    students: uniqueStudents,
    preferredUserIds: linkedUserIds,
  });

  const existingParentAccount = await ParentAccount.findOne({ userId: user._id })
    .select('studentIds status activatedAt')
    .select('+registeredPhone');

  if (existingParentAccount && existingParentAccount.status !== 'active') {
    return res.status(403).json({
      code: 'PARENT_ACCESS_INACTIVE',
      message: 'Parent portal access is inactive. Contact the preschool office to restore it.',
    });
  }

  if (existingParentAccount &&
      normalizePhone(existingParentAccount.registeredPhone) !== normalizedPhone) {
    return res.status(409).json({
      code: 'PARENT_PHONE_CHANGE_REQUIRED',
      message: 'This parent account is linked to a different mobile number. Contact the preschool office to update the family record.',
    });
  }

  const mergedStudentIds = [...new Set([
    ...(existingParentAccount?.studentIds || []).map(String),
    ...studentIds.map(String),
  ])];

  // The unique userId index makes this upsert safe to retry after a partial
  // deployment/network failure. Repeated parent sign-ins do not create extras.
  await ParentAccount.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        studentIds: mergedStudentIds,
        registeredPhone: normalizedPhone,
        status: 'active',
        lastVerifiedAt: new Date(),
      },
      $setOnInsert: { activatedAt: new Date() },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  try {
    await UserAccessAuditEvent.create({
      actorUserId: user._id,
      targetUserId: user._id,
      targetName: user.username,
      targetEmail: user.email,
      action: 'parent.access_activated',
      previousRole: user.role,
      role: user.role,
      previousStatus: 'active',
      status: 'active',
      reason: 'Direct parent sign-in succeeded after matching the school GR/email and registered mobile number.',
      changedFields: ['parentAccount', 'linkedChildren'],
      ipAddress: String(req.ip || '').slice(0, 64),
      userAgent: String(req.get('user-agent') || '').slice(0, 300),
    });
  } catch (auditError) {
    // An audit-store outage must not leave a verified parent unable to sign in.
    console.error('Unable to record parent sign-in audit event:', {
      name: auditError?.name || 'audit_error',
      code: auditError?.code || null,
    });
  }

  return res.status(200).json({
    message: 'You are signed in to your family portal.',
    token: signToken(user),
    user: {
      id: String(user._id),
      username: user.username,
      email: user.email,
      role: user.role,
      parentAccount: { mode: 'legacy_single_school', studentCount: mergedStudentIds.length },
    },
    school: { name: school.schoolName, slug: school.slug },
  });
}

async function activateOrganizationParent({ req, res, organization, identifier, submittedPhone, parentName, loginEmail, password, automatic = false }) {
  const identifierIsEmail = isEmail(identifier);
  const exactIdentifier = new RegExp('^' + escapeRegex(identifier) + '$', 'i');
  const candidateStudents = await Student.find({
    organizationId: organization._id,
    $or: [
      { stuNo: exactIdentifier },
      ...(identifierIsEmail ? [{ parentEmail: exactIdentifier }] : []),
    ],
  })
    .select('_id organizationId branchId stuNo firstName middleName lastName standard parentEmail phoneNumber MotherName FatherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber')
    .limit(100)
    .lean();

  const emailGuardians = identifierIsEmail
    ? await Guardian.find({ organizationId: organization._id, email: identifier })
      .select('_id fullName email phone alternatePhone portalUserId')
      .lean()
    : [];
  const candidateIds = new Set(candidateStudents.map((student) => String(student._id)));
  const emailGuardianIds = new Set(emailGuardians.map((guardian) => String(guardian._id)));
  const relevantLinks = (candidateStudents.length || emailGuardians.length)
    ? await ChildGuardian.find({
      organizationId: organization._id,
      $or: [
        ...(candidateStudents.length ? [{ childId: { $in: candidateStudents.map((student) => student._id) } }] : []),
        ...(emailGuardians.length ? [{ guardianId: { $in: emailGuardians.map((guardian) => guardian._id) } }] : []),
      ],
    })
      .select('childId guardianId branchId')
      .populate({ path: 'guardianId', select: 'fullName email phone alternatePhone portalUserId' })
      .lean()
    : [];

  const linksByChild = new Map();
  const matchedGuardianIds = new Set();
  const matchedStudentIds = new Set();
  for (const link of relevantLinks) {
    const childId = String(link.childId);
    if (!linksByChild.has(childId)) linksByChild.set(childId, []);
    linksByChild.get(childId).push(link);
    const guardian = link.guardianId;
    if (!guardian) continue;
    const guardianId = String(guardian._id);
    const isRelated = candidateIds.has(childId) || (identifierIsEmail && emailGuardianIds.has(guardianId));
    if (isRelated && phoneMatches([guardian.phone, guardian.alternatePhone], submittedPhone)) {
      matchedGuardianIds.add(guardianId);
      matchedStudentIds.add(childId);
    }
  }

  const directStudents = candidateStudents.filter((student) => {
    const id = String(student._id);
    return !(linksByChild.get(id) || []).length &&
      phoneMatches(contactValuesForStudent(student), submittedPhone);
  });
  for (const student of directStudents) matchedStudentIds.add(String(student._id));

  if (matchedGuardianIds.size) {
    const familyLinks = await ChildGuardian.find({
      organizationId: organization._id,
      guardianId: { $in: [...matchedGuardianIds] },
    }).select('childId').lean();
    for (const link of familyLinks) matchedStudentIds.add(String(link.childId));
  }

  const siblingEmails = [...new Set(directStudents
    .map((student) => String(student.parentEmail || '').trim().toLowerCase())
    .filter(Boolean))];
  if (siblingEmails.length) {
    const siblings = await Student.find({
      organizationId: organization._id,
      parentEmail: { $in: siblingEmails },
    }).select('_id parentEmail branchId').limit(100).lean();
    for (const sibling of siblings) {
      if (phoneMatches(contactValuesForStudent(sibling), submittedPhone)) {
        matchedStudentIds.add(String(sibling._id));
      }
    }
  }
  if (!matchedStudentIds.size) return genericMismatch(res);

  // Reload links for every provisionally matched child (including siblings),
  // so we never create a second guardian record or trust legacy phone fields
  // where an authoritative guardian link already exists.
  const completeFamilyLinks = await ChildGuardian.find({
    organizationId: organization._id,
    childId: { $in: [...matchedStudentIds] },
  }).select('childId guardianId branchId')
    .populate({ path: 'guardianId', select: 'fullName email phone alternatePhone portalUserId' })
    .lean();
  const childLinkMap = new Map();
  const verifiedLinkedChildren = new Set();
  for (const link of completeFamilyLinks) {
    const childId = String(link.childId);
    if (!childLinkMap.has(childId)) childLinkMap.set(childId, []);
    childLinkMap.get(childId).push(link);
    const guardian = link.guardianId;
    if (guardian && phoneMatches([guardian.phone, guardian.alternatePhone], submittedPhone)) {
      matchedGuardianIds.add(String(guardian._id));
      verifiedLinkedChildren.add(childId);
    }
  }
  const directVerifiedChildren = new Set();
  const allProvisionalStudents = await Student.find({
    _id: { $in: [...matchedStudentIds] },
    organizationId: organization._id,
  }).select('_id parentEmail branchId').lean();
  for (const student of allProvisionalStudents) {
    const id = String(student._id);
    if ((childLinkMap.get(id) || []).length) continue;
    const original = candidateStudents.find((item) => String(item._id) === id) ||
      await Student.findById(id).select('FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber phoneNumber').lean();
    if (original && phoneMatches(contactValuesForStudent(original), submittedPhone)) directVerifiedChildren.add(id);
  }
  for (const id of [...matchedStudentIds]) {
    if (!verifiedLinkedChildren.has(id) && !directVerifiedChildren.has(id)) matchedStudentIds.delete(id);
  }
  if (!matchedStudentIds.size) return genericMismatch(res);

  if (matchedGuardianIds.size) {
    const expandedLinks = await ChildGuardian.find({
      organizationId: organization._id,
      guardianId: { $in: [...matchedGuardianIds] },
    }).select('childId').lean();
    for (const link of expandedLinks) matchedStudentIds.add(String(link.childId));
  }

  const students = await Student.find({
    _id: { $in: [...matchedStudentIds] },
    organizationId: organization._id,
  }).select('_id branchId').lean();
  if (!students.length || students.some((student) => !student.branchId)) return genericMismatch(res);

  const directStudentIds = students
    .filter((student) => !(childLinkMap.get(String(student._id)) || []).length)
    .map((student) => String(student._id));
  const branchIdsForDirectStudents = students
    .filter((student) => directStudentIds.includes(String(student._id)))
    .map((student) => String(student.branchId));
  const activeDirectBranches = branchIdsForDirectStudents.length
    ? await Branch.find({ _id: { $in: branchIdsForDirectStudents }, organizationId: organization._id, status: 'active' }).select('_id').lean()
    : [];
  if (activeDirectBranches.length !== new Set(branchIdsForDirectStudents).size) return genericMismatch(res);

  let session;
  try {
    session = await mongoose.startSession();
    let activeUser;
    await session.withTransaction(async () => {
      let user;
      if (automatic) {
        const linkedGuardians = matchedGuardianIds.size
          ? await Guardian.find({
            _id: { $in: [...matchedGuardianIds] },
            organizationId: organization._id,
          }).select('portalUserId').session(session).lean()
          : [];
        const linkedMemberships = matchedGuardianIds.size
          ? await OrganizationMembership.find({
            organizationId: organization._id,
            role: 'parent',
            guardianIds: { $in: [...matchedGuardianIds] },
          }).select('userId').session(session).lean()
          : [];
        user = await createAutomaticParentUser({
          session,
          organizationId: organization._id,
          normalizedPhone: normalizePhone(submittedPhone),
          identifier,
          students: candidateStudents,
          preferredUserIds: [
            ...linkedGuardians.map((guardian) => guardian.portalUserId),
            ...linkedMemberships.map((membership) => membership.userId),
          ],
        });
      } else {
        user = await User.findOne({ email: loginEmail }).session(session);
        if (user) {
          if (user.status === 'suspended' || !(await user.matchPassword(password))) {
            const error = new Error('This sign-in email already has an account. Enter that account’s current password, or use another email address.');
            error.code = 'EXISTING_ACCOUNT_PASSWORD';
            throw error;
          }
        } else {
          if (!isValidParentPassword(password)) {
            const error = new Error('New parent accounts require a password with at least 12 characters.');
            error.code = 'NEW_PASSWORD_TOO_SHORT';
            throw error;
          }
          const [createdUser] = await User.create([{
            username: parentName,
            email: loginEmail,
            password,
            role: 'parent',
            status: 'active',
          }], { session });
          user = createdUser;
        }
      }

      const existingMembership = await OrganizationMembership.findOne({
        organizationId: organization._id,
        userId: user._id,
      }).session(session);

      if (existingMembership && existingMembership.role !== 'parent') {
        const staffMembership = new Error('This email is already connected to a staff workspace. Contact the school office to link parent access to the correct account.');
        staffMembership.code = 'STAFF_MEMBERSHIP_EXISTS';
        throw staffMembership;
      }
      if (existingMembership && existingMembership.status !== 'active') {
        const inactive = new Error('Parent portal access is inactive. Contact the school office to restore it.');
        inactive.code = 'PARENT_MEMBERSHIP_INACTIVE';
        throw inactive;
      }

      const newGuardianDocuments = [];
      for (const student of students.filter((item) => directStudentIds.includes(String(item._id)))) {
        const source = candidateStudents.find((candidate) => String(candidate._id) === String(student._id)) ||
          await Student.findById(student._id).select('parentEmail FatherName MotherName').session(session).lean();
        const email = String(source?.parentEmail || '').trim().toLowerCase();
        let guardianCandidates = await Guardian.find({
          organizationId: organization._id,
          ...(email ? { email } : {}),
        }).session(session).select('_id phone alternatePhone portalUserId fullName').lean();
        let guardian = guardianCandidates.find((item) => phoneMatches([item.phone, item.alternatePhone], submittedPhone));
        if (!guardian) {
          const [createdGuardian] = await Guardian.create([{
            organizationId: organization._id,
            fullName: cleanText(source?.FatherName || source?.MotherName || parentName, 120),
            email,
            phone: normalizePhone(submittedPhone),
            preferredLanguage: 'en',
            createdBy: organization.createdBy,
          }], { session });
          guardian = createdGuardian;
        }
        await ChildGuardian.updateOne({
          organizationId: organization._id,
          branchId: student.branchId,
          childId: student._id,
          guardianId: guardian._id,
        }, {
          $setOnInsert: {
            organizationId: organization._id,
            branchId: student.branchId,
            childId: student._id,
            guardianId: guardian._id,
            relationship: 'guardian',
            isPrimaryContact: true,
            isBillingContact: true,
            isEmergencyContact: false,
            authorizedPickup: false,
            receivesSchoolUpdates: true,
            createdBy: organization.createdBy,
          },
        }, { upsert: true, session, setDefaultsOnInsert: true });
        newGuardianDocuments.push(guardian);
      }

      const guardians = matchedGuardianIds.size
        ? await Guardian.find({ _id: { $in: [...matchedGuardianIds] }, organizationId: organization._id }).session(session).lean()
        : [];
      for (const guardian of newGuardianDocuments) guardians.push(guardian);

      const allGuardianIds = [...new Set(guardians.map((item) => String(item._id)))];
      if (!allGuardianIds.length) {
        const missing = new Error('The matching family contact could not be linked. Contact the school office.');
        missing.code = 'NO_GUARDIAN_LINK';
        throw missing;
      }

      const ownedByOther = await Guardian.find({
        _id: { $in: allGuardianIds },
        organizationId: organization._id,
        portalUserId: { $exists: true, $nin: [null, user._id] },
      }).select('_id').session(session).lean();
      if (ownedByOther.length) {
        const linked = new Error('This family contact is already connected to another parent login. Contact the school office.');
        linked.code = 'GUARDIAN_ALREADY_LINKED';
        throw linked;
      }

      const duplicateMembership = await OrganizationMembership.findOne({
        organizationId: organization._id,
        role: 'parent',
        status: 'active',
        userId: { $ne: user._id },
        guardianIds: { $in: allGuardianIds },
      }).session(session).select('_id').lean();
      if (duplicateMembership) {
        const linked = new Error('This family contact is already connected to a parent login. Contact the school office if you need to recover that account.');
        linked.code = 'FAMILY_ALREADY_CONNECTED';
        throw linked;
      }

      // Bind verified guardian contacts to the parent account so another login
      // cannot later claim the same family record through the setup page.
      await Guardian.updateMany({
        _id: { $in: allGuardianIds },
        organizationId: organization._id,
        $or: [{ portalUserId: null }, { portalUserId: user._id }],
      }, {
        $set: { portalUserId: user._id },
      }, { session });

      const familyLinks = await ChildGuardian.find({
        organizationId: organization._id,
        guardianId: { $in: allGuardianIds },
      }).session(session).select('branchId guardianId').lean();
      const branchIds = [...new Set(familyLinks.map((item) => String(item.branchId)))];
      const activeBranches = await Branch.find({
        _id: { $in: branchIds },
        organizationId: organization._id,
        status: 'active',
      }).session(session).select('_id').lean();
      const activeBranchIds = new Set(activeBranches.map((item) => String(item._id)));
      const allowedGuardianIds = allGuardianIds.filter((guardianId) =>
        familyLinks.some((link) =>
          String(link.guardianId) === guardianId && activeBranchIds.has(String(link.branchId))
        )
      );
      const allowedBranchIds = branchIds.filter((id) => activeBranchIds.has(id));
      if (!allowedGuardianIds.length || !allowedBranchIds.length) {
        const missing = new Error('No active child records are connected to the verified family contact.');
        missing.code = 'NO_CHILD_LINKS';
        throw missing;
      }

      let membership = existingMembership;
      if (membership) {
        membership.guardianIds = [...new Set([...(membership.guardianIds || []).map(String), ...allowedGuardianIds])]
          .map((id) => new mongoose.Types.ObjectId(id));
        membership.branchIds = [...new Set([...(membership.branchIds || []).map(String), ...allowedBranchIds])]
          .map((id) => new mongoose.Types.ObjectId(id));
        await membership.save({ session });
      } else {
        const [createdMembership] = await OrganizationMembership.create([{
          organizationId: organization._id,
          userId: user._id,
          role: 'parent',
          branchIds: allowedBranchIds,
          guardianIds: allowedGuardianIds,
          classNames: [],
          accessAllBranches: false,
          status: 'active',
          activatedAt: new Date(),
        }], { session });
        membership = createdMembership;
      }

      await AuditEvent.create([{
        organizationId: organization._id,
        branchId: allowedBranchIds[0],
        actorUserId: null,
        action: 'parent_access.activated',
        resourceType: 'parent_account',
        resourceId: String(user._id),
        outcome: 'success',
        reason: 'Self-service parent access activated after matching the school record identifier and registered phone.',
        summary: 'Parent portal access activated for a verified family contact.',
        ipAddress: String(req.ip || '').slice(0, 64),
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      }], { session });
      activeUser = user;
    });

    return res.status(automatic ? 200 : 201).json({
      message: automatic ? 'You are signed in to your family portal.' : 'Parent access is ready. You are now signed in.',
      token: signToken(activeUser),
      user: {
        id: String(activeUser._id),
        username: activeUser.username,
        email: activeUser.email,
        role: activeUser.role,
        organizationId: String(organization._id),
      },
      school: { name: organization.name, slug: organization.slug },
    });
  } catch (error) {
    if (error.code === 'EXISTING_ACCOUNT_PASSWORD') return res.status(401).json({ code: error.code, message: error.message });
    if (error.code === 'NEW_PASSWORD_TOO_SHORT') return res.status(400).json({ code: error.code, message: error.message });
    if (error.code === 'STAFF_MEMBERSHIP_EXISTS' || error.code === 'PARENT_MEMBERSHIP_INACTIVE' ||
        error.code === 'GUARDIAN_ALREADY_LINKED' || error.code === 'FAMILY_ALREADY_CONNECTED' ||
        error.code === 'MULTIPLE_PARENT_ACCOUNTS' ||
        error.code === 'NO_GUARDIAN_LINK' || error.code === 'NO_CHILD_LINKS') {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    if (error.code === 11000) return res.status(409).json({ message: 'This parent login was created in another request. Please sign in with your email and password.' });
    console.error('Unable to activate organization parent access:', error?.name || 'activation_error');
    return res.status(503).json({ message: 'Parent access could not be activated safely. Please contact the preschool office.' });
  } finally {
    if (session) await session.endSession();
  }
}

router.get('/config', async (req, res) => {
  try {
    const result = await resolveSingleSchool();
    if (result.error) return res.status(result.status || 503).json({ message: result.error });
    const organization = result.organization || null;
    const schoolName = organization?.name || result.schoolName;
    const slug = organization?.slug || result.slug;
    return res.json({
      school: {
        name: schoolName,
        slug,
        timezone: organization?.timezone || 'Asia/Kolkata',
        contactEmail: organization?.contact?.email || '',
        contactPhone: organization?.contact?.phone || '',
        city: organization?.contact?.address?.city || '',
      },
      parentAccessUrl: schoolPortalUrl(req, slug),
      loginUrl: (String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '') || '') + '/login',
      mode: result.mode,
    });
  } catch (error) {
    console.error('Unable to load parent access configuration:', error?.name || 'config_error');
    return res.status(503).json({ message: 'Parent access is not available right now. Please contact the school office.' });
  }
});


router.post('/login', async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Secure sign-in is not configured. Please contact the school office.' });
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const schoolSlug = cleanText(body.schoolSlug, 140).toLowerCase();
  const identifier = normalizeParentIdentifier(body.identifier);
  const submittedPhone = cleanText(body.phone, 30);
  const normalizedPhone = normalizePhone(submittedPhone);

  if (!identifier || identifier.length < 2) {
    return res.status(400).json({ message: 'Enter the student GR number or the registered parent email.' });
  }
  if (!isValidParentPhone(submittedPhone)) {
    return res.status(400).json({ message: 'Enter the 10-digit mobile number registered with the preschool.' });
  }

  const schoolResult = await resolveSingleSchool().catch((error) => {
    console.error('Unable to resolve parent sign-in school:', error?.name || 'lookup_error');
    return { error: 'Parent sign-in could not be completed. Please contact the school office.', status: 503 };
  });
  if (schoolResult.error) return res.status(schoolResult.status || 503).json({ message: schoolResult.error });
  if (schoolSlug && !safeSchoolSlug(schoolSlug)) {
    return res.status(404).json({ message: 'This parent portal link is invalid.' });
  }

  try {
    if (schoolResult.mode === 'legacy_single_school') {
      if (schoolSlug && schoolSlug !== schoolResult.slug) {
        return res.status(404).json({ message: 'This parent portal link does not belong to the configured preschool.' });
      }
      return await loginLegacyParent({
        req, res, school: schoolResult, identifier, submittedPhone, normalizedPhone,
      });
    }

    const organization = schoolResult.organization;
    if (schoolSlug && schoolSlug !== organization.slug) {
      return res.status(404).json({ message: 'This parent portal link does not belong to the configured preschool.' });
    }
    return await activateOrganizationParent({
      req, res, organization, identifier, submittedPhone,
      parentName: 'Parent / Guardian', loginEmail: '', password: '', automatic: true,
    });
  } catch (error) {
    console.error('Unable to complete parent sign-in:', {
      name: error?.name || 'lookup_error',
      code: error?.code || null,
      message: String(error?.message || 'Unknown parent sign-in error').slice(0, 500),
    });
    return res.status(503).json({ message: 'Parent sign-in could not be completed. Please try again or contact the school office.' });
  }
});

router.post('/activate', async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Secure sign-in is not configured. Please contact the school office.' });
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const schoolSlug = cleanText(body.schoolSlug, 140).toLowerCase();
  const identifier = normalizeParentIdentifier(body.identifier);
  const submittedPhone = cleanText(body.phone, 30);
  const normalizedPhone = normalizePhone(submittedPhone);
  const parentName = cleanText(body.fullName, 120);
  const loginEmail = cleanText(body.email, 254).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!identifier || identifier.length < 2) {
    return res.status(400).json({ message: 'Enter the student GR number or the registered parent email.' });
  }
  if (!isValidParentPhone(submittedPhone)) {
    return res.status(400).json({ message: 'Enter the 10-digit mobile number registered with the preschool.' });
  }
  if (parentName.length < 2) {
    return res.status(400).json({ message: 'Enter the parent or guardian full name.' });
  }
  if (!isEmail(loginEmail)) {
    return res.status(400).json({ message: 'Enter a valid email address for your parent login.' });
  }
  if (password.length < 8 || password.length > 128 || !password.trim()) {
    return res.status(400).json({ message: 'Enter your current account password, or create a password with at least 12 characters.' });
  }

  const schoolResult = await resolveSingleSchool().catch((error) => {
    console.error('Unable to resolve single school:', error?.name || 'lookup_error');
    return { error: 'Parent access could not be verified. Please contact the school office.', status: 503 };
  });
  if (schoolResult.error) return res.status(schoolResult.status || 503).json({ message: schoolResult.error });

  if (schoolSlug && !safeSchoolSlug(schoolSlug)) {
    return res.status(404).json({ message: 'This parent portal link is invalid.' });
  }

  try {
    if (schoolResult.mode === 'legacy_single_school') {
      if (schoolSlug && schoolSlug !== schoolResult.slug) {
        return res.status(404).json({ message: 'This parent portal link does not belong to the configured preschool.' });
      }
      return await activateLegacyParent({
        req, res, school: schoolResult, identifier, submittedPhone, normalizedPhone,
        parentName, loginEmail, password,
      });
    }

    const organization = schoolResult.organization;
    if (schoolSlug && schoolSlug !== organization.slug) {
      return res.status(404).json({ message: 'This parent portal link does not belong to the configured preschool.' });
    }

    return await activateOrganizationParent({
      req, res, organization, identifier, submittedPhone, parentName, loginEmail, password,
    });
  } catch (error) {
    console.error('Unable to look up parent school records:', error?.name || 'lookup_error');
    return res.status(503).json({ message: 'Parent access could not be verified. Please try again or contact the school office.' });
  }
});

module.exports = router;
