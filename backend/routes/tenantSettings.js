'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const FeeInvoice = require('../models/FeeInvoice');
const FeeTransaction = require('../models/FeeTransaction');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext } = require('../middleware/tenantContext');
const { hasTenantRole } = require('../utils/tenantAuthorization');
const {
  validateOrganizationProfile,
  validateBranchProfile,
} = require('../utils/organizationSettings');

const router = express.Router();
const EDIT_ROLES = ['organization_owner', 'head_office_admin'];

router.use(tenantContext);

function clean(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function canEdit(req, res) {
  if (hasTenantRole(req.tenant?.membership, EDIT_ROLES)) return true;
  res.status(403).json({ message: 'Only the organization owner or a head-office administrator can change these settings.' });
  return false;
}

async function writeAudit(req, session, { action, resourceType, resourceId, branchId = null, summary, changedFields, reason = '' }) {
  const [event] = await AuditEvent.create([{
    organizationId: req.tenant.organization._id,
    branchId,
    actorUserId: req.user._id,
    action,
    resourceType,
    resourceId: String(resourceId || ''),
    summary: clean(summary, 500),
    reason: clean(reason, 500),
    changedFields: changedFields || [],
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  }], { session });
  return event;
}

async function withTransaction(work) {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    if (session) await session.endSession();
  }
}

function toOrganizationResponse(org) {
  return {
    id: String(org._id),
    name: org.name,
    slug: org.slug,
    timezone: org.timezone,
    locale: org.locale,
    currency: org.currency,
    contact: {
      email: org.contact?.email || '',
      phone: org.contact?.phone || '',
      website: org.contact?.website || '',
      address: {
        line1: org.contact?.address?.line1 || '',
        line2: org.contact?.address?.line2 || '',
        city: org.contact?.address?.city || '',
        state: org.contact?.address?.state || '',
        postalCode: org.contact?.address?.postalCode || '',
        country: org.contact?.address?.country || 'India',
      },
    },
    settings: {
      academicYearStartMonth: org.settings?.academicYearStartMonth || 4,
      dateFormat: org.settings?.dateFormat || 'DD-MM-YYYY',
      defaultLanguage: org.settings?.defaultLanguage || 'en',
    },
    status: org.status,
    onboardingCompletedAt: org.onboardingCompletedAt || null,
    subscription: {
      plan: org.subscription?.plan || 'trial',
      status: org.subscription?.status || 'trial',
      trialEndsAt: org.subscription?.trialEndsAt || null,
    },
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  };
}

function toBranchResponse(branch) {
  return {
    id: String(branch._id),
    name: branch.name,
    code: branch.code,
    status: branch.status,
    timezone: branch.timezone || 'Asia/Kolkata',
    phone: branch.phone || '',
    email: branch.email || '',
    website: branch.website || '',
    address: {
      line1: branch.address?.line1 || '',
      line2: branch.address?.line2 || '',
      city: branch.address?.city || '',
      state: branch.address?.state || '',
      postalCode: branch.address?.postalCode || '',
      country: branch.address?.country || 'India',
    },
    openedAt: branch.openedAt || null,
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
  };
}

router.get('/organization', async (req, res) => {
  try {
    const organization = await Organization.findOne({
      _id: req.tenant.organization._id,
      status: 'active',
    }).lean();
    if (!organization) return res.status(404).json({ message: 'Organization not found.' });
    return res.json(toOrganizationResponse(organization));
  } catch (error) {
    console.error('Unable to load organization profile:', error);
    return res.status(503).json({ message: 'Organization settings could not be loaded.' });
  }
});

router.put('/organization', async (req, res) => {
  if (!canEdit(req, res)) return;

  try {
    const current = await Organization.findOne({
      _id: req.tenant.organization._id,
      status: 'active',
    }).lean();
    if (!current) return res.status(404).json({ message: 'Organization not found.' });

    const validation = validateOrganizationProfile(req.body, current);
    if (!validation.valid) {
      return res.status(400).json({
        message: 'Please correct the organization profile details.',
        errors: validation.errors,
      });
    }

    const value = validation.value;
    if (value.currency && value.currency !== current.currency) {
      const [invoiceExists, transactionExists] = await Promise.all([
        FeeInvoice.exists({ organizationId: current._id }),
        FeeTransaction.exists({ organizationId: current._id }),
      ]);
      if (invoiceExists || transactionExists) {
        return res.status(409).json({
          code: 'CURRENCY_LOCKED_BY_FINANCIAL_HISTORY',
          message: 'Currency cannot be changed after fee invoices or payments have been recorded. This protects historical financial records.',
        });
      }
    }

    const updates = {};
    for (const field of ['name', 'timezone', 'locale', 'currency']) {
      if (Object.prototype.hasOwnProperty.call(value, field)) updates[field] = value[field];
    }
    if (value.contact) {
      updates.contact = {
        email: current.contact?.email || '',
        phone: current.contact?.phone || '',
        website: current.contact?.website || '',
        address: {
          line1: current.contact?.address?.line1 || '',
          line2: current.contact?.address?.line2 || '',
          city: current.contact?.address?.city || '',
          state: current.contact?.address?.state || '',
          postalCode: current.contact?.address?.postalCode || '',
          country: current.contact?.address?.country || 'India',
        },
        ...value.contact,
        address: {
          line1: current.contact?.address?.line1 || '',
          line2: current.contact?.address?.line2 || '',
          city: current.contact?.address?.city || '',
          state: current.contact?.address?.state || '',
          postalCode: current.contact?.address?.postalCode || '',
          country: current.contact?.address?.country || 'India',
          ...(value.contact.address || {}),
        },
      };
    }
    if (value.settings) {
      updates.settings = {
        academicYearStartMonth: current.settings?.academicYearStartMonth || 4,
        dateFormat: current.settings?.dateFormat || 'DD-MM-YYYY',
        defaultLanguage: current.settings?.defaultLanguage || 'en',
        ...value.settings,
      };
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'Choose at least one organization setting to update.' });
    }

    const saved = await withTransaction(async (session) => {
      const organization = await Organization.findOneAndUpdate(
        { _id: current._id, status: 'active' },
        { $set: updates },
        { new: true, runValidators: true, session },
      );
      if (!organization) {
        const notFound = new Error('Organization not found.');
        notFound.code = 'NOT_FOUND';
        throw notFound;
      }
      const changedFields = Object.keys(updates);
      if (value.contact) {
        for (const key of Object.keys(value.contact)) changedFields.push('contact.' + key);
      }
      if (value.settings) {
        for (const key of Object.keys(value.settings)) changedFields.push('settings.' + key);
      }
      await writeAudit(req, session, {
        action: 'organization.settings_updated',
        resourceType: 'organization',
        resourceId: organization._id,
        summary: 'Organization profile and preferences updated.',
        changedFields: [...new Set(changedFields)],
      });
      return organization;
    });

    return res.json({ message: 'Organization settings saved.', organization: toOrganizationResponse(saved) });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ message: error.message });
    console.error('Unable to update organization profile:', error.message);
    return res.status(503).json({ message: 'Organization settings could not be saved safely.' });
  }
});

router.get('/branches/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid branch.' });
  if (!req.tenant.membership.accessAllBranches && !req.tenant.membership.branchIds.some((id) => String(id) === req.params.id)) {
    return res.status(403).json({ message: 'You do not have access to this branch.' });
  }
  try {
    const branch = await Branch.findOne({
      _id: req.params.id,
      organizationId: req.tenant.organization._id,
      status: { $ne: 'closed' },
    }).lean();
    if (!branch) return res.status(404).json({ message: 'Branch not found in this organization.' });
    return res.json(toBranchResponse(branch));
  } catch (error) {
    console.error('Unable to load branch profile:', error);
    return res.status(503).json({ message: 'Branch settings could not be loaded.' });
  }
});

router.put('/branches/:id', async (req, res) => {
  if (!canEdit(req, res)) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid branch.' });

  try {
    const current = await Branch.findOne({
      _id: req.params.id,
      organizationId: req.tenant.organization._id,
      status: { $ne: 'closed' },
    }).lean();
    if (!current) return res.status(404).json({ message: 'Branch not found in this organization.' });

    const validation = validateBranchProfile(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        message: 'Please correct the branch profile details.',
        errors: validation.errors,
      });
    }

    const value = validation.value;
    const updates = {};
    for (const field of ['name', 'timezone', 'phone', 'email', 'website']) {
      if (Object.prototype.hasOwnProperty.call(value, field)) updates[field] = value[field];
    }
    if (value.address) {
      updates.address = {
        line1: current.address?.line1 || '',
        line2: current.address?.line2 || '',
        city: current.address?.city || '',
        state: current.address?.state || '',
        postalCode: current.address?.postalCode || '',
        country: current.address?.country || 'India',
        ...value.address,
      };
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'Choose at least one branch setting to update.' });
    }

    const saved = await withTransaction(async (session) => {
      const branch = await Branch.findOneAndUpdate(
        { _id: current._id, organizationId: req.tenant.organization._id, status: { $ne: 'closed' } },
        { $set: updates },
        { new: true, runValidators: true, session },
      );
      if (!branch) {
        const notFound = new Error('Branch not found in this organization.');
        notFound.code = 'NOT_FOUND';
        throw notFound;
      }
      await writeAudit(req, session, {
        action: 'branch.profile_updated',
        resourceType: 'branch',
        resourceId: branch._id,
        branchId: branch._id,
        summary: 'Branch profile updated.',
        changedFields: Object.keys(updates).concat(value.address ? Object.keys(value.address).map((field) => 'address.' + field) : []),
      });
      return branch;
    });

    return res.json({ message: 'Branch settings saved.', branch: toBranchResponse(saved) });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ message: error.message });
    console.error('Unable to update branch profile:', error.message);
    return res.status(503).json({ message: 'Branch settings could not be saved safely.' });
  }
});

module.exports = router;
