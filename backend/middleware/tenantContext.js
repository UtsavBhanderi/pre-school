'use strict';

const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const OrganizationMembership = require('../models/OrganizationMembership');
const { canAccessBranch } = require('../utils/tenantAuthorization');

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

    req.tenant = { organization, membership, branch };
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
