'use strict';

// Create the first organization owner without opening public registration.
// This command is intended for a trusted operator on a controlled machine.
// All credentials are read from environment variables, never command-line args.

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const OrganizationMembership = require('../models/OrganizationMembership');
const AuditEvent = require('../models/AuditEvent');
const { validateOrganizationRegistration } = require('../utils/tenantRegistration');

const requiredEnvironment = [
  'MONGO_URI',
  'JWT_SECRET',
  'PROVISION_ORGANIZATION_NAME',
  'PROVISION_BRANCH_NAME',
  'PROVISION_BRANCH_CODE',
  'PROVISION_OWNER_NAME',
  'PROVISION_OWNER_EMAIL',
  'PROVISION_OWNER_PASSWORD',
];

function readConfiguration() {
  const missing = requiredEnvironment.filter((key) => !String(process.env[key] || '').trim());
  if (missing.length) {
    throw new Error('Missing required environment setting(s): ' + missing.join(', '));
  }

  const validation = validateOrganizationRegistration({
    organizationName: process.env.PROVISION_ORGANIZATION_NAME,
    branchName: process.env.PROVISION_BRANCH_NAME,
    branchCode: process.env.PROVISION_BRANCH_CODE,
    username: process.env.PROVISION_OWNER_NAME,
    email: process.env.PROVISION_OWNER_EMAIL,
    password: process.env.PROVISION_OWNER_PASSWORD,
    timezone: process.env.PROVISION_TIMEZONE || 'Asia/Kolkata',
  });
  if (!validation.valid) {
    throw new Error('Invalid provisioning settings: ' + Object.values(validation.errors).join(' '));
  }
  return validation.value;
}

async function provision() {
  const config = readConfiguration();
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const existingUser = await User.findOne({ email: config.email }).select('_id').lean();
  if (existingUser) {
    throw new Error('An account with the owner email already exists. No organization was created.');
  }

  let session;
  let result;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const [owner] = await User.create([{
        username: config.username,
        email: config.email,
        password: config.password,
        role: 'admin',
      }], { session });

      const slug = config.organizationSlugBase + '-' + require('crypto').randomBytes(4).toString('hex');
      const [organization] = await Organization.create([{
        name: config.organizationName,
        slug,
        timezone: config.timezone,
        createdBy: owner._id,
        subscription: { plan: 'trial', status: 'trial' },
      }], { session });

      const [branch] = await Branch.create([{
        organizationId: organization._id,
        name: config.branchName,
        code: config.branchCode,
        timezone: config.timezone,
        openedAt: new Date(),
        createdBy: owner._id,
      }], { session });

      await OrganizationMembership.create([{
        organizationId: organization._id,
        userId: owner._id,
        role: 'organization_owner',
        branchIds: [branch._id],
        accessAllBranches: true,
        status: 'active',
        activatedAt: new Date(),
      }], { session });

      await AuditEvent.create([{
        organizationId: organization._id,
        branchId: branch._id,
        actorUserId: owner._id,
        action: 'organization.provisioned',
        resourceType: 'organization',
        resourceId: String(organization._id),
        summary: 'Organization provisioned through the trusted operator CLI.',
      }], { session });

      result = {
        organizationId: String(organization._id),
        organizationName: organization.name,
        organizationSlug: organization.slug,
        branchId: String(branch._id),
        branchName: branch.name,
        branchCode: branch.code,
        ownerUserId: String(owner._id),
        ownerEmail: owner.email,
      };
    });

    return result;
  } finally {
    if (session) await session.endSession();
    await mongoose.disconnect();
  }
}

provision()
  .then((result) => {
    console.log('Organization provisioned successfully.');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(async (error) => {
    console.error('Organization provisioning failed:', error.message);
    try {
      await mongoose.disconnect();
    } catch {
      // Preserve the original provisioning error.
    }
    process.exitCode = 1;
  });
