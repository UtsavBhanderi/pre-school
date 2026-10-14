'use strict';

const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const OrganizationMembership = require('../models/OrganizationMembership');
const { canAccessBranch } = require('../utils/tenantAuthorization');
const { getSubscriptionState } = require('../utils/saasEntitlements');
const { isReadOnlyMaintenanceRequest } = require('../utils/tenantMaintenancePolicy');

const tenantContext = async (req, res, next) => {
  if (!req.user?._id) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const organizationId = String(req.get('x-organization-id') || '').trim();
  const branchId = String(req.get('x-branch-id') || '').trim();

  if (!organizationId || !mongoose.Types.ObjectId.isValid(organizationId)) {
    return res.status(400).json({ message: 'Choose a valid organization to continue.' });
  }

  try {
    const membership = await OrganizationMembership.findOne({
      organizationId,
      userId: req.user._id,
      status: 'active',
    }).lean();

    if (!membership) {
      return res.status(403).json({ message: 'You do not have active access to this organization.' });
    }

    const organization = await Organization.findOne({
      _id: organizationId,
      status: 'active',
    }).lean();

    if (!organization) {
      return res.status(403).json({ message: 'This organization is not available.' });
    }

    let branch = null;
    if (branchId) {
      if (!mongoose.Types.ObjectId.isValid(branchId)) {
        return res.status(400).json({ message: 'Choose a valid branch.' });
      }

      if (!canAccessBranch(membership, branchId)) {
        return res.status(403).json({ message: 'You do not have access to this branch.' });
      }

      branch = await Branch.findOne({
        _id: branchId,
        organizationId,
        status: 'active',
      }).lean();

      if (!branch) {
        return res.status(403).json({ message: 'This branch is not available in the selected organization.' });
      }
    }

    const subscriptionAccess = getSubscriptionState(organization);
    req.tenant = { organization, membership, branch, subscriptionAccess };

    // Preserve read access to existing records after a trial/plan problem, but
    // block every tenant-scoped mutation consistently across all SaaS modules.
    const safeMaintenance = isReadOnlyMaintenanceRequest({
      method: req.method,
      baseUrl: req.baseUrl,
      path: req.path,
      body: req.body,
    });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !subscriptionAccess.canWrite && !safeMaintenance) {
      return res.status(402).json({
        code: 'SUBSCRIPTION_READ_ONLY',
        message: subscriptionAccess.readOnlyReason || 'This subscription is currently read-only.',
        subscription: {
          plan: subscriptionAccess.plan,
          status: subscriptionAccess.status,
          trialEndsAt: subscriptionAccess.trialEndsAt,
        },
      });
    }

    return next();
  } catch (error) {
    console.error('Unable to resolve tenant context:', error);
    return res.status(503).json({ message: 'Organization access could not be verified. Please try again.' });
  }
};

const requireBranchContext = (req, res, next) => {
  if (!req.tenant?.organization || !req.tenant?.membership) {
    return res.status(500).json({ message: 'Tenant context must be resolved before branch access is checked.' });
  }
  if (!req.tenant.branch) {
    return res.status(400).json({ message: 'Choose a branch to continue.' });
  }
  return next();
};

module.exports = { tenantContext, requireBranchContext };
