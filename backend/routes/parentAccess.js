'use strict';

const express = require('express');
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
    .select('_id name slug status timezone locale currency contact settings')
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

function isActiveBranchId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function contactValuesForStudent(student) {
  return [
    student.FatherMobileNumber,
    student.FatherPhoneNumber,
    student.EmergencyPhoneNumber,
    student.phoneNumber,
  ];
}

function childName(student) {
  return [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ').trim();
}

function genericMismatch(res) {
  return res.status(404).json({
    code: 'PARENT_RECORD_NOT_MATCHED',
    message: 'We could not verify those details. Check the GR number or registered parent email and the mobile number on your school record, or contact the school office.',
  });
}

async function activateLegacyParent({ req, res, school, identifier, submittedPhone, normalizedPhone, parentName, loginEmail, password }) {
  const identifierIsEmail = isEmail(identifier);
  const exactIdentifier = new RegExp('^' + escapeRegex(identifier) + '
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
      loginUrl: (String(process.env.FRONTEND_URL || '').trim().replace(/\\/+$/, '') || '') + '/login',
      mode: result.mode,
    });
  } catch (error) {
    console.error('Unable to load parent access configuration:', error?.name || 'config_error');
    return res.status(503).json({ message: 'Parent access is not available right now. Please contact the school office.' });
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

  let session;
  try {
    const schoolResult = await resolveSingleSchool();
    if (schoolResult.error) {
      return res.status(schoolResult.status || 503).json({ message: schoolResult.error });
    }
    if (schoolSlug && !safeSchoolSlug(schoolSlug)) {
      return res.status(404).json({ message: 'This parent portal link is invalid.' });
    }
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

    const identifierIsEmail = isEmail(identifier);
    const exactIdentifier = new RegExp('^' + escapeRegex(identifier) + '$', 'i');
    const studentFilter = {
      organizationId: organization._id,
      $or: [
        { stuNo: exactIdentifier },
        ...(identifierIsEmail ? [{ parentEmail: identifier }] : []),
      ],
    };
    const candidateStudents = await Student.find(studentFilter)
      .select('_id organizationId branchId stuNo firstName middleName lastName standard parentEmail phoneNumber MotherName FatherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber')
      .limit(100)
      .lean();

    let emailGuardians = [];
    if (identifierIsEmail) {
      emailGuardians = await Guardian.find({
        organizationId: organization._id,
        email: identifier,
      }).select('_id fullName email phone alternatePhone portalUserId').lean();
    }

    const candidateStudentIds = candidateStudents.map((student) => student._id);
    const emailGuardianIds = emailGuardians.map((guardian) => guardian._id);
    const relevantLinks = (candidateStudentIds.length || emailGuardianIds.length)
      ? await ChildGuardian.find({
        organizationId: organization._id,
        $or: [
          ...(candidateStudentIds.length ? [{ childId: { $in: candidateStudentIds } }] : []),
          ...(emailGuardianIds.length ? [{ guardianId: { $in: emailGuardianIds } }] : []),
        ],
      })
        .select('childId guardianId branchId relationship isPrimaryContact isBillingContact')
        .populate({ path: 'guardianId', select: 'fullName email phone alternatePhone portalUserId' })
        .lean()
      : [];

    const candidateIds = new Set(candidateStudentIds.map(String));
    const emailGuardianIdSet = new Set(emailGuardianIds.map(String));
    const linksByChild = new Map();
    const matchedGuardianIds = new Set();
    const linkedStudentIds = new Set();

    for (const link of relevantLinks) {
      const childId = String(link.childId);
      const guardian = link.guardianId;
      if (!linksByChild.has(childId)) linksByChild.set(childId, []);
      linksByChild.get(childId).push(link);
      if (!guardian) continue;

      const guardianId = String(guardian._id);
      const linkedByStudentIdentifier = candidateIds.has(childId);
      const linkedByParentEmail = identifierIsEmail && emailGuardianIdSet.has(guardianId);
      if ((linkedByStudentIdentifier || linkedByParentEmail) &&
          phoneMatches([guardian.phone, guardian.alternatePhone], submittedPhone)) {
        matchedGuardianIds.add(guardianId);
        linkedStudentIds.add(childId);
      }
    }

    const matchedDirectStudents = candidateStudents.filter((student) => {
      const id = String(student._id);
      // When a child already has family links, only the linked guardian's
      // registered mobile may activate access. Legacy fields are a fallback
      // only for children that have not yet been given a Guardian link.
      return !(linksByChild.get(id) || []).length &&
        phoneMatches(contactValuesForStudent(student), submittedPhone);
    });
    const matchedStudentIds = new Set([...linkedStudentIds, ...matchedDirectStudents.map((student) => String(student._id))]);

    if (matchedGuardianIds.size) {
      const allFamilyLinks = await ChildGuardian.find({
        organizationId: organization._id,
        guardianId: { $in: [...matchedGuardianIds] },
      }).select('childId guardianId branchId').lean();
      for (const link of allFamilyLinks) {
        matchedStudentIds.add(String(link.childId));
      }
    }

    // Legacy student records may contain the registered parent phone but not
    // a separate Guardian/ChildGuardian record yet. Auto-link sibling records
    // only when both the stored parent email and registered phone also match.
    const siblingEmails = [...new Set(matchedDirectStudents
      .map((student) => String(student.parentEmail || '').trim().toLowerCase())
      .filter(Boolean))];
    if (siblingEmails.length) {
      const siblings = await Student.find({
        organizationId: organization._id,
        parentEmail: { $in: siblingEmails },
      }).select('_id organizationId branchId stuNo firstName middleName lastName standard parentEmail phoneNumber MotherName FatherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber').limit(100).lean();
      for (const sibling of siblings) {
        const id = String(sibling._id);
        if (!(linksByChild.get(id) || []).length && phoneMatches(contactValuesForStudent(sibling), submittedPhone)) {
          matchedStudentIds.add(id);
        }
      }
    }

    if (!matchedStudentIds.size) return genericMismatch(res);

    const matchedStudents = await Student.find({
      _id: { $in: [...matchedStudentIds] },
      organizationId: organization._id,
    }).select('_id organizationId branchId stuNo firstName middleName lastName standard parentEmail MotherName FatherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber').lean();
    if (!matchedStudents.length || matchedStudents.some((student) => !student.branchId || !isActiveBranchId(student.branchId))) {
      return genericMismatch(res);
    }

    const branchIds = [...new Set(matchedStudents.map((student) => String(student.branchId)))];
    const activeBranches = await Branch.find({
      _id: { $in: branchIds },
      organizationId: organization._id,
      status: 'active',
    }).select('_id').lean();
    if (activeBranches.length !== branchIds.length) return genericMismatch(res);

    const existingGuardianIds = new Set([...matchedGuardianIds]);
    const guardiansToCreateFor = [];
    for (const student of matchedStudents) {
      const linksForChild = await ChildGuardian.find({
        organizationId: organization._id,
        childId: student._id,
      }).select('_id').lean();
      if (linksForChild.length) continue;

      const email = String(student.parentEmail || '').trim().toLowerCase();
      const fallbackName = student.FatherName || student.MotherName || parentName;
      let guardian = await Guardian.findOne({
        organizationId: organization._id,
        phone: normalizePhone(submittedPhone),
        ...(email ? { email } : {}),
      }).select('_id portalUserId').lean();

      if (guardian) {
        existingGuardianIds.add(String(guardian._id));
        // A matching legacy contact may already be connected to children.
        const linked = await ChildGuardian.find({
          organizationId: organization._id,
          guardianId: guardian._id,
        }).select('childId').lean();
        for (const link of linked) matchedStudentIds.add(String(link.childId));
      } else {
        guardiansToCreateFor.push({
          student,
          fullName: cleanText(fallbackName, 120) || parentName,
          email,
        });
      }
    }

    if (!existingGuardianIds.size && !guardiansToCreateFor.length) return genericMismatch(res);

    session = await mongoose.startSession();
    let activatedUser;
    let membershipId;
    let createdGuardianIds = [];
    await session.withTransaction(async () => {
      let user = await User.findOne({ email: loginEmail }).session(session);
      if (user) {
        if (user.status === 'suspended' || !(await user.matchPassword(password))) {
          const error = new Error('The sign-in email already has an account. Enter that account’s current password, or use another email address.');
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

      const existingMembership = await OrganizationMembership.findOne({
        organizationId: organization._id,
        userId: user._id,
      }).session(session);

      if (existingMembership && existingMembership.role !== 'parent') {
        const alreadyStaff = new Error('This email is already connected to a staff workspace. Contact the school office to link parent access to the correct account.');
        alreadyStaff.code = 'STAFF_MEMBERSHIP_EXISTS';
        throw alreadyStaff;
      }
      if (existingMembership && existingMembership.status !== 'active') {
        const suspended = new Error('This parent account is not active. Contact the school office to restore access.');
        suspended.code = 'PARENT_MEMBERSHIP_INACTIVE';
        throw suspended;
      }

      const guardians = existingGuardianIds.size
        ? await Guardian.find({
          _id: { $in: [...existingGuardianIds] },
          organizationId: organization._id,
        }).session(session)
        : [];
      const guardianIds = new Set([...existingGuardianIds]);

      for (const item of guardiansToCreateFor) {
        let guardian = await Guardian.findOne({
          organizationId: organization._id,
          phone: normalizePhone(submittedPhone),
          ...(item.email ? { email: item.email } : {}),
        }).session(session);
        if (!guardian) {
          const [createdGuardian] = await Guardian.create([{
            organizationId: organization._id,
            fullName: item.fullName,
            email: item.email,
            phone: normalizePhone(submittedPhone),
            preferredLanguage: 'en',
            createdBy: organization.createdBy,
          }], { session });
          guardian = createdGuardian;
        }
        guardianIds.add(String(guardian._id));
        await ChildGuardian.updateOne({
          organizationId: organization._id,
          branchId: item.student.branchId,
          childId: item.student._id,
          guardianId: guardian._id,
        }, {
          $setOnInsert: {
            organizationId: organization._id,
            branchId: item.student.branchId,
            childId: item.student._id,
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
      }

      const finalGuardianIds = [...guardianIds];
      if (!finalGuardianIds.length) {
        const noGuardian = new Error('The matching family contact could not be linked. Contact the school office.');
        noGuardian.code = 'NO_GUARDIAN_LINK';
        throw noGuardian;
      }

      const guardiansOwnedByAnotherUser = await Guardian.find({
        _id: { $in: finalGuardianIds },
        organizationId: organization._id,
        portalUserId: { $ne: null },
        portalUserId: { $ne: user._id },
      }).select('_id').session(session).lean();
      if (guardiansOwnedByAnotherUser.length) {
        const alreadyLinked = new Error('This family contact is already connected to another parent login. Contact the school office.');
        alreadyLinked.code = 'GUARDIAN_ALREADY_LINKED';
        throw alreadyLinked;
      }

      const duplicateFamily = await OrganizationMembership.findOne({
        organizationId: organization._id,
        role: 'parent',
        status: 'active',
        userId: { $ne: user._id },
        guardianIds: { $in: finalGuardianIds },
      }).session(session).select('_id').lean();
      if (duplicateFamily) {
        const alreadyConnected = new Error('This family contact is already connected to a parent login. Contact the school office if you need to recover that account.');
        alreadyConnected.code = 'FAMILY_ALREADY_CONNECTED';
        throw alreadyConnected;
      }

      const allLinks = await ChildGuardian.find({
        organizationId: organization._id,
        guardianId: { $in: finalGuardianIds },
      }).session(session).select('branchId childId').lean();
      const finalBranchIds = [...new Set(allLinks.map((link) => String(link.branchId)))];
      if (!finalBranchIds.length) {
        const noChildren = new Error('No child records are connected to the verified family contact.');
        noChildren.code = 'NO_CHILD_LINKS';
        throw noChildren;
      }

      let membership = existingMembership;
      if (membership) {
        membership.guardianIds = [...new Set([
          ...(membership.guardianIds || []).map(String),
          ...finalGuardianIds,
        ])].map((id) => new mongoose.Types.ObjectId(id));
        membership.branchIds = [...new Set([
          ...(membership.branchIds || []).map(String),
          ...finalBranchIds,
        ])].map((id) => new mongoose.Types.ObjectId(id));
        await membership.save({ session });
      } else {
        const [createdMembership] = await OrganizationMembership.create([{
          organizationId: organization._id,
          userId: user._id,
          role: 'parent',
          branchIds: finalBranchIds,
          guardianIds: finalGuardianIds,
          classNames: [],
          accessAllBranches: false,
          status: 'active',
          activatedAt: new Date(),
        }], { session });
        membership = createdMembership;
      }
      membershipId = membership._id;

      await AuditEvent.create([{
        organizationId: organization._id,
        branchId: finalBranchIds[0] || null,
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

      activatedUser = user;
      createdGuardianIds = finalGuardianIds;
    });

    return res.status(201).json({
      message: 'Parent access is ready. You are now signed in.',
      token: signToken(activatedUser),
      user: {
        id: String(activatedUser._id),
        username: activatedUser.username,
        email: activatedUser.email,
        role: activatedUser.role,
        organizationId: String(organization._id),
        membershipId: String(membershipId),
      },
      school: { name: organization.name, slug: organization.slug },
    });
  } catch (error) {
    if (error.code === 'EXISTING_ACCOUNT_PASSWORD') {
      return res.status(401).json({ code: error.code, message: error.message });
    }
    if (error.code === 'NEW_PASSWORD_TOO_SHORT') {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    if (error.code === 'STAFF_MEMBERSHIP_EXISTS' || error.code === 'PARENT_MEMBERSHIP_INACTIVE' ||
        error.code === 'GUARDIAN_ALREADY_LINKED' || error.code === 'FAMILY_ALREADY_CONNECTED' ||
        error.code === 'NO_GUARDIAN_LINK' || error.code === 'NO_CHILD_LINKS') {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This parent login was created in another request. Please sign in with your email and password.' });
    }
    console.error('Unable to activate parent access:', error?.name || 'activation_error');
    return res.status(503).json({ message: 'Parent access could not be activated safely. Please contact the preschool office.' });
  } finally {
    if (session) await session.endSession();
  }
});

module.exports = router;
, 'i');
  const candidates = await Student.find({
    $and: [
      { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] },
      { $or: [
        { stuNo: exactIdentifier },
        ...(identifierIsEmail ? [{ parentEmail: identifier }] : []),
      ] },
    ],
  })
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
      let user = await User.findOne({ email: loginEmail }).session(session);
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
      activeUser = user;
    });

    return res.status(201).json({
      message: 'Parent access is ready. You are now signed in.',
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
    if (error.code === 'PARENT_ACCOUNT_INACTIVE' || error.code === 'PARENT_PHONE_CHANGE_REQUIRED') {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    if (error.code === 11000) return res.status(409).json({ message: 'This parent login was created in another request. Please sign in with your email and password.' });
    console.error('Unable to activate standalone parent account:', error?.name || 'activation_error');
    return res.status(503).json({ message: 'Parent access could not be activated safely. Please contact the preschool office.' });
  } finally {
    if (session) await session.endSession();
  }
}

router.get('/config', async (req, res) => {
  try {
    const result = await resolveSingleSchool();
    if (!result.organization) return res.status(result.status || 503).json({ message: result.error });
    const organization = result.organization;
    return res.json({
      school: {
        name: organization.name,
        slug: organization.slug,
        timezone: organization.timezone || 'Asia/Kolkata',
        contactEmail: organization.contact?.email || '',
        contactPhone: organization.contact?.phone || '',
        city: organization.contact?.address?.city || '',
      },
      parentAccessUrl: schoolPortalUrl(req, organization.slug),
      loginUrl: (String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '') || '') + '/login',
      mode: 'single_school',
    });
  } catch (error) {
    console.error('Unable to load parent access configuration:', error?.name || 'config_error');
    return res.status(503).json({ message: 'Parent access is not available right now. Please contact the school office.' });
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

  let session;
  try {
    const schoolResult = await resolveSingleSchool();
    if (!schoolResult.organization) {
      return res.status(schoolResult.status || 503).json({ message: schoolResult.error });
    }
    const organization = schoolResult.organization;
    if (schoolSlug && schoolSlug !== organization.slug) {
      return res.status(404).json({ message: 'This parent portal link does not belong to the configured preschool.' });
    }

    const identifierIsEmail = isEmail(identifier);
    const exactIdentifier = new RegExp('^' + escapeRegex(identifier) + '$', 'i');
    const studentFilter = {
      organizationId: organization._id,
      $or: [
        { stuNo: exactIdentifier },
        ...(identifierIsEmail ? [{ parentEmail: identifier }] : []),
      ],
    };
    const candidateStudents = await Student.find(studentFilter)
      .select('_id organizationId branchId stuNo firstName middleName lastName standard parentEmail phoneNumber MotherName FatherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber')
      .limit(100)
      .lean();

    let emailGuardians = [];
    if (identifierIsEmail) {
      emailGuardians = await Guardian.find({
        organizationId: organization._id,
        email: identifier,
      }).select('_id fullName email phone alternatePhone portalUserId').lean();
    }

    const candidateStudentIds = candidateStudents.map((student) => student._id);
    const emailGuardianIds = emailGuardians.map((guardian) => guardian._id);
    const relevantLinks = (candidateStudentIds.length || emailGuardianIds.length)
      ? await ChildGuardian.find({
        organizationId: organization._id,
        $or: [
          ...(candidateStudentIds.length ? [{ childId: { $in: candidateStudentIds } }] : []),
          ...(emailGuardianIds.length ? [{ guardianId: { $in: emailGuardianIds } }] : []),
        ],
      })
        .select('childId guardianId branchId relationship isPrimaryContact isBillingContact')
        .populate({ path: 'guardianId', select: 'fullName email phone alternatePhone portalUserId' })
        .lean()
      : [];

    const candidateIds = new Set(candidateStudentIds.map(String));
    const emailGuardianIdSet = new Set(emailGuardianIds.map(String));
    const linksByChild = new Map();
    const matchedGuardianIds = new Set();
    const linkedStudentIds = new Set();

    for (const link of relevantLinks) {
      const childId = String(link.childId);
      const guardian = link.guardianId;
      if (!linksByChild.has(childId)) linksByChild.set(childId, []);
      linksByChild.get(childId).push(link);
      if (!guardian) continue;

      const guardianId = String(guardian._id);
      const linkedByStudentIdentifier = candidateIds.has(childId);
      const linkedByParentEmail = identifierIsEmail && emailGuardianIdSet.has(guardianId);
      if ((linkedByStudentIdentifier || linkedByParentEmail) &&
          phoneMatches([guardian.phone, guardian.alternatePhone], submittedPhone)) {
        matchedGuardianIds.add(guardianId);
        linkedStudentIds.add(childId);
      }
    }

    const matchedDirectStudents = candidateStudents.filter((student) => {
      const id = String(student._id);
      // When a child already has family links, only the linked guardian's
      // registered mobile may activate access. Legacy fields are a fallback
      // only for children that have not yet been given a Guardian link.
      return !(linksByChild.get(id) || []).length &&
        phoneMatches(contactValuesForStudent(student), submittedPhone);
    });
    const matchedStudentIds = new Set([...linkedStudentIds, ...matchedDirectStudents.map((student) => String(student._id))]);

    if (matchedGuardianIds.size) {
      const allFamilyLinks = await ChildGuardian.find({
        organizationId: organization._id,
        guardianId: { $in: [...matchedGuardianIds] },
      }).select('childId guardianId branchId').lean();
      for (const link of allFamilyLinks) {
        matchedStudentIds.add(String(link.childId));
      }
    }

    // Legacy student records may contain the registered parent phone but not
    // a separate Guardian/ChildGuardian record yet. Auto-link sibling records
    // only when both the stored parent email and registered phone also match.
    const siblingEmails = [...new Set(matchedDirectStudents
      .map((student) => String(student.parentEmail || '').trim().toLowerCase())
      .filter(Boolean))];
    if (siblingEmails.length) {
      const siblings = await Student.find({
        organizationId: organization._id,
        parentEmail: { $in: siblingEmails },
      }).select('_id organizationId branchId stuNo firstName middleName lastName standard parentEmail phoneNumber MotherName FatherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber').limit(100).lean();
      for (const sibling of siblings) {
        const id = String(sibling._id);
        if (!(linksByChild.get(id) || []).length && phoneMatches(contactValuesForStudent(sibling), submittedPhone)) {
          matchedStudentIds.add(id);
        }
      }
    }

    if (!matchedStudentIds.size) return genericMismatch(res);

    const matchedStudents = await Student.find({
      _id: { $in: [...matchedStudentIds] },
      organizationId: organization._id,
    }).select('_id organizationId branchId stuNo firstName middleName lastName standard parentEmail MotherName FatherName FatherMobileNumber FatherPhoneNumber EmergencyPhoneNumber').lean();
    if (!matchedStudents.length || matchedStudents.some((student) => !student.branchId || !isActiveBranchId(student.branchId))) {
      return genericMismatch(res);
    }

    const branchIds = [...new Set(matchedStudents.map((student) => String(student.branchId)))];
    const activeBranches = await Branch.find({
      _id: { $in: branchIds },
      organizationId: organization._id,
      status: 'active',
    }).select('_id').lean();
    if (activeBranches.length !== branchIds.length) return genericMismatch(res);

    const existingGuardianIds = new Set([...matchedGuardianIds]);
    const guardiansToCreateFor = [];
    for (const student of matchedStudents) {
      const linksForChild = await ChildGuardian.find({
        organizationId: organization._id,
        childId: student._id,
      }).select('_id').lean();
      if (linksForChild.length) continue;

      const email = String(student.parentEmail || '').trim().toLowerCase();
      const fallbackName = student.FatherName || student.MotherName || parentName;
      let guardian = await Guardian.findOne({
        organizationId: organization._id,
        phone: normalizePhone(submittedPhone),
        ...(email ? { email } : {}),
      }).select('_id portalUserId').lean();

      if (guardian) {
        existingGuardianIds.add(String(guardian._id));
        // A matching legacy contact may already be connected to children.
        const linked = await ChildGuardian.find({
          organizationId: organization._id,
          guardianId: guardian._id,
        }).select('childId').lean();
        for (const link of linked) matchedStudentIds.add(String(link.childId));
      } else {
        guardiansToCreateFor.push({
          student,
          fullName: cleanText(fallbackName, 120) || parentName,
          email,
        });
      }
    }

    if (!existingGuardianIds.size && !guardiansToCreateFor.length) return genericMismatch(res);

    session = await mongoose.startSession();
    let activatedUser;
    let membershipId;
    let createdGuardianIds = [];
    await session.withTransaction(async () => {
      let user = await User.findOne({ email: loginEmail }).session(session);
      if (user) {
        if (user.status === 'suspended' || !(await user.matchPassword(password))) {
          const error = new Error('The sign-in email already has an account. Enter that account’s current password, or use another email address.');
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

      const existingMembership = await OrganizationMembership.findOne({
        organizationId: organization._id,
        userId: user._id,
      }).session(session);

      if (existingMembership && existingMembership.role !== 'parent') {
        const alreadyStaff = new Error('This email is already connected to a staff workspace. Contact the school office to link parent access to the correct account.');
        alreadyStaff.code = 'STAFF_MEMBERSHIP_EXISTS';
        throw alreadyStaff;
      }
      if (existingMembership && existingMembership.status !== 'active') {
        const suspended = new Error('This parent account is not active. Contact the school office to restore access.');
        suspended.code = 'PARENT_MEMBERSHIP_INACTIVE';
        throw suspended;
      }

      const guardians = existingGuardianIds.size
        ? await Guardian.find({
          _id: { $in: [...existingGuardianIds] },
          organizationId: organization._id,
        }).session(session)
        : [];
      const guardianIds = new Set([...existingGuardianIds]);

      for (const item of guardiansToCreateFor) {
        let guardian = await Guardian.findOne({
          organizationId: organization._id,
          phone: normalizePhone(submittedPhone),
          ...(item.email ? { email: item.email } : {}),
        }).session(session);
        if (!guardian) {
          const [createdGuardian] = await Guardian.create([{
            organizationId: organization._id,
            fullName: item.fullName,
            email: item.email,
            phone: normalizePhone(submittedPhone),
            preferredLanguage: 'en',
            createdBy: organization.createdBy,
          }], { session });
          guardian = createdGuardian;
        }
        guardianIds.add(String(guardian._id));
        await ChildGuardian.updateOne({
          organizationId: organization._id,
          branchId: item.student.branchId,
          childId: item.student._id,
          guardianId: guardian._id,
        }, {
          $setOnInsert: {
            organizationId: organization._id,
            branchId: item.student.branchId,
            childId: item.student._id,
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
      }

      const finalGuardianIds = [...guardianIds];
      if (!finalGuardianIds.length) {
        const noGuardian = new Error('The matching family contact could not be linked. Contact the school office.');
        noGuardian.code = 'NO_GUARDIAN_LINK';
        throw noGuardian;
      }

      const guardiansOwnedByAnotherUser = await Guardian.find({
        _id: { $in: finalGuardianIds },
        organizationId: organization._id,
        portalUserId: { $ne: null },
        portalUserId: { $ne: user._id },
      }).select('_id').session(session).lean();
      if (guardiansOwnedByAnotherUser.length) {
        const alreadyLinked = new Error('This family contact is already connected to another parent login. Contact the school office.');
        alreadyLinked.code = 'GUARDIAN_ALREADY_LINKED';
        throw alreadyLinked;
      }

      const duplicateFamily = await OrganizationMembership.findOne({
        organizationId: organization._id,
        role: 'parent',
        status: 'active',
        userId: { $ne: user._id },
        guardianIds: { $in: finalGuardianIds },
      }).session(session).select('_id').lean();
      if (duplicateFamily) {
        const alreadyConnected = new Error('This family contact is already connected to a parent login. Contact the school office if you need to recover that account.');
        alreadyConnected.code = 'FAMILY_ALREADY_CONNECTED';
        throw alreadyConnected;
      }

      const allLinks = await ChildGuardian.find({
        organizationId: organization._id,
        guardianId: { $in: finalGuardianIds },
      }).session(session).select('branchId childId').lean();
      const finalBranchIds = [...new Set(allLinks.map((link) => String(link.branchId)))];
      if (!finalBranchIds.length) {
        const noChildren = new Error('No child records are connected to the verified family contact.');
        noChildren.code = 'NO_CHILD_LINKS';
        throw noChildren;
      }

      let membership = existingMembership;
      if (membership) {
        membership.guardianIds = [...new Set([
          ...(membership.guardianIds || []).map(String),
          ...finalGuardianIds,
        ])].map((id) => new mongoose.Types.ObjectId(id));
        membership.branchIds = [...new Set([
          ...(membership.branchIds || []).map(String),
          ...finalBranchIds,
        ])].map((id) => new mongoose.Types.ObjectId(id));
        await membership.save({ session });
      } else {
        const [createdMembership] = await OrganizationMembership.create([{
          organizationId: organization._id,
          userId: user._id,
          role: 'parent',
          branchIds: finalBranchIds,
          guardianIds: finalGuardianIds,
          classNames: [],
          accessAllBranches: false,
          status: 'active',
          activatedAt: new Date(),
        }], { session });
        membership = createdMembership;
      }
      membershipId = membership._id;

      await AuditEvent.create([{
        organizationId: organization._id,
        branchId: finalBranchIds[0] || null,
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

      activatedUser = user;
      createdGuardianIds = finalGuardianIds;
    });

    return res.status(201).json({
      message: 'Parent access is ready. You are now signed in.',
      token: signToken(activatedUser),
      user: {
        id: String(activatedUser._id),
        username: activatedUser.username,
        email: activatedUser.email,
        role: activatedUser.role,
        organizationId: String(organization._id),
        membershipId: String(membershipId),
      },
      school: { name: organization.name, slug: organization.slug },
    });
  } catch (error) {
    if (error.code === 'EXISTING_ACCOUNT_PASSWORD') {
      return res.status(401).json({ code: error.code, message: error.message });
    }
    if (error.code === 'NEW_PASSWORD_TOO_SHORT') {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    if (error.code === 'STAFF_MEMBERSHIP_EXISTS' || error.code === 'PARENT_MEMBERSHIP_INACTIVE' ||
        error.code === 'GUARDIAN_ALREADY_LINKED' || error.code === 'FAMILY_ALREADY_CONNECTED' ||
        error.code === 'NO_GUARDIAN_LINK' || error.code === 'NO_CHILD_LINKS') {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This parent login was created in another request. Please sign in with your email and password.' });
    }
    console.error('Unable to activate parent access:', error?.name || 'activation_error');
    return res.status(503).json({ message: 'Parent access could not be activated safely. Please contact the preschool office.' });
  } finally {
    if (session) await session.endSession();
  }
});

module.exports = router;
