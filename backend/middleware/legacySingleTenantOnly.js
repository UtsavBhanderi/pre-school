'use strict';

const Organization = require('../models/Organization');
const OrganizationMembership = require('../models/OrganizationMembership');

// The legacy school APIs have no organization/branch filters. Until those
// endpoints are migrated, they may run only when the database contains no SaaS
// organizations and the current account has no organization membership.
// Otherwise even an account with no membership could use a global legacy query
// to discover another school's tenant-owned rows.
const legacySingleTenantOnly = async (req, res, next) => {
  if (!req.user?._id) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const membershipExists = await OrganizationMembership.exists({ userId: req.user._id });
    if (membershipExists) {
      return res.status(403).json({
        code: 'TENANT_MODULE_NOT_MIGRATED',
        message: 'This feature is being prepared for organization-scoped access. No school records were returned. Please use a feature enabled for your organization.',
      });
    }

    const anyOrganizationExists = await Organization.exists({});
    if (anyOrganizationExists) {
      return res.status(403).json({
        code: 'LEGACY_API_DISABLED_FOR_SAAS',
        message: 'This older school feature is not organization-scoped and is disabled while SaaS school data exists. No school records were returned.',
      });
    }

    return next();
  } catch (error) {
    console.error('Unable to verify legacy API isolation:', error);
    return res.status(503).json({ message: 'Access could not be verified. Please try again.' });
  }
};

module.exports = legacySingleTenantOnly;
