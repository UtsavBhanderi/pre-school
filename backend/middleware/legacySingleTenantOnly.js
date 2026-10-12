'use strict';

const OrganizationMembership = require('../models/OrganizationMembership');

// The legacy school APIs are not tenant-scoped yet. Fail closed for an account
// that belongs to a SaaS organization rather than exposing all legacy records.
// Remove this guard from a module only after that module's queries, writes,
// exports and media have organization/branch scope and automated isolation tests.
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
    return next();
  } catch (error) {
    console.error('Unable to verify organization membership for legacy API:', error);
    return res.status(503).json({ message: 'Access could not be verified. Please try again.' });
  }
};

module.exports = legacySingleTenantOnly;
