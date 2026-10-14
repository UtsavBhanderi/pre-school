'use strict';

const mongoose = require('mongoose');

const uri = String(process.env.MONGO_RESTORE_TARGET_URI || '').trim();

function fail(message) {
  console.error('Restore verification failed: ' + message);
  process.exitCode = 1;
}

function matchesIndex(indexes, expectedKeys) {
  return indexes.some((index) =>
    index.unique === true &&
    JSON.stringify(Object.entries(index.key || {})) === JSON.stringify(Object.entries(expectedKeys))
  );
}

function organizationAndBranchIntegrityPipeline() {
  return [
    { $match: { organizationId: { $type: 'objectId' } } },
    {
      $lookup: {
        from: 'organizations',
        let: { tenantOrgId: '$organizationId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$tenantOrgId'] } } },
          { $project: { _id: 1 } },
        ],
        as: '__restore_org',
      },
    },
    {
      $lookup: {
        from: 'branches',
        let: { tenantBranchId: '$branchId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$tenantBranchId'] } } },
          { $project: { _id: 1, organizationId: 1 } },
        ],
        as: '__restore_branch',
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: [{ $size: '$__restore_org' }, 1] },
            { $ne: [{ $type: '$branchId' }, 'objectId'] },
            { $ne: [{ $size: '$__restore_branch' }, 1] },
            { $ne: [{ $arrayElemAt: ['$__restore_branch.organizationId', 0] }, '$organizationId'] },
          ],
        },
      },
    },
  ];
}

function membershipIntegrityPipeline() {
  return [
    { $match: { organizationId: { $type: 'objectId' } } },
    {
      $lookup: {
        from: 'organizations',
        let: { tenantOrgId: '$organizationId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$tenantOrgId'] } } },
          { $project: { _id: 1 } },
        ],
        as: '__restore_org',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { memberUserId: '$userId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$memberUserId'] } } },
          { $project: { _id: 1 } },
        ],
        as: '__restore_user',
      },
    },
    {
      $lookup: {
        from: 'branches',
        let: { memberBranchIds: { $ifNull: ['$branchIds', []] } },
        pipeline: [
          { $match: { $expr: { $in: ['$_id', '$$memberBranchIds'] } } },
          { $project: { _id: 1, organizationId: 1 } },
        ],
        as: '__restore_branches',
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: [{ $size: '$__restore_org' }, 1] },
            { $ne: [{ $size: '$__restore_user' }, 1] },
            {
              $ne: [
                { $size: { $ifNull: ['$branchIds', []] } },
                { $size: '$__restore_branches' },
              ],
            },
            {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: '$__restore_branches',
                      as: 'restoreBranch',
                      cond: { $ne: ['$$restoreBranch.organizationId', '$organizationId'] },
                    },
                  },
                },
                0,
              ],
            },
          ],
        },
      },
    },
  ];
}

function guardianIntegrityPipeline() {
  return [
    { $match: { organizationId: { $type: 'objectId' } } },
    {
      $lookup: {
        from: 'organizations',
        let: { tenantOrgId: '$organizationId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$tenantOrgId'] } } },
          { $project: { _id: 1 } },
        ],
        as: '__restore_org',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { portalUserId: '$portalUserId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$portalUserId'] } } },
          { $project: { _id: 1 } },
        ],
        as: '__restore_portal_user',
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: [{ $size: '$__restore_org' }, 1] },
            {
              $and: [
                { $eq: [{ $type: '$portalUserId' }, 'objectId'] },
                { $ne: [{ $size: '$__restore_portal_user' }, 1] },
              ],
            },
          ],
        },
      },
    },
  ];
}

function childGuardianIntegrityPipeline() {
  return [
    { $match: { organizationId: { $type: 'objectId' } } },
    {
      $lookup: {
        from: 'students',
        let: { childId: '$childId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$childId'] } } },
          { $project: { _id: 1, organizationId: 1, branchId: 1 } },
        ],
        as: '__restore_child',
      },
    },
    {
      $lookup: {
        from: 'guardians',
        let: { guardianId: '$guardianId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$guardianId'] } } },
          { $project: { _id: 1, organizationId: 1 } },
        ],
        as: '__restore_guardian',
      },
    },
    {
      $lookup: {
        from: 'branches',
        let: { branchId: '$branchId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$branchId'] } } },
          { $project: { _id: 1, organizationId: 1 } },
        ],
        as: '__restore_branch',
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: [{ $size: '$__restore_child' }, 1] },
            { $ne: [{ $size: '$__restore_guardian' }, 1] },
            { $ne: [{ $size: '$__restore_branch' }, 1] },
            { $ne: [{ $arrayElemAt: ['$__restore_child.organizationId', 0] }, '$organizationId'] },
            { $ne: [{ $arrayElemAt: ['$__restore_child.branchId', 0] }, '$branchId'] },
            { $ne: [{ $arrayElemAt: ['$__restore_guardian.organizationId', 0] }, '$organizationId'] },
            { $ne: [{ $arrayElemAt: ['$__restore_branch.organizationId', 0] }, '$organizationId'] },
          ],
        },
      },
    },
  ];
}

function attendanceChildIntegrityPipeline() {
  return [
    { $match: { organizationId: { $type: 'objectId' } } },
    { $unwind: { path: '$studentDetails', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'students',
        let: { childId: '$studentDetails.studentId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$childId'] } } },
          { $project: { _id: 1, organizationId: 1, branchId: 1 } },
        ],
        as: '__restore_child',
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: [{ $size: '$__restore_child' }, 1] },
            { $ne: [{ $arrayElemAt: ['$__restore_child.organizationId', 0] }, '$organizationId'] },
            { $ne: [{ $arrayElemAt: ['$__restore_child.branchId', 0] }, '$branchId'] },
            { $ne: [{ $type: '$branchId' }, 'objectId'] },
          ],
        },
      },
    },
  ];
}

function invoiceChildIntegrityPipeline() {
  return [
    { $match: { organizationId: { $type: 'objectId' } } },
    {
      $lookup: {
        from: 'students',
        let: { childId: '$childId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$childId'] } } },
          { $project: { _id: 1, organizationId: 1, branchId: 1 } },
        ],
        as: '__restore_child',
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: [{ $size: '$__restore_child' }, 1] },
            { $ne: [{ $arrayElemAt: ['$__restore_child.organizationId', 0] }, '$organizationId'] },
            { $ne: [{ $arrayElemAt: ['$__restore_child.branchId', 0] }, '$branchId'] },
          ],
        },
      },
    },
  ];
}

function feeTransactionIntegrityPipeline() {
  return [
    { $match: { organizationId: { $type: 'objectId' } } },
    {
      $lookup: {
        from: 'feeinvoices',
        let: { invoiceId: '$invoiceId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$invoiceId'] } } },
          { $project: { _id: 1, organizationId: 1, branchId: 1, childId: 1 } },
        ],
        as: '__restore_invoice',
      },
    },
    {
      $lookup: {
        from: 'students',
        let: { childId: '$childId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$childId'] } } },
          { $project: { _id: 1, organizationId: 1, branchId: 1 } },
        ],
        as: '__restore_child',
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: [{ $size: '$__restore_invoice' }, 1] },
            { $ne: [{ $size: '$__restore_child' }, 1] },
            { $ne: [{ $arrayElemAt: ['$__restore_invoice.organizationId', 0] }, '$organizationId'] },
            { $ne: [{ $arrayElemAt: ['$__restore_invoice.branchId', 0] }, '$branchId'] },
            { $ne: [{ $arrayElemAt: ['$__restore_invoice.childId', 0] }, '$childId'] },
            { $ne: [{ $arrayElemAt: ['$__restore_child.organizationId', 0] }, '$organizationId'] },
            { $ne: [{ $arrayElemAt: ['$__restore_child.branchId', 0] }, '$branchId'] },
          ],
        },
      },
    },
  ];
}

async function countIssues(database, collectionNames, collectionName, pipeline) {
  if (!collectionNames.has(collectionName)) return 0;
  const result = await database.collection(collectionName)
    .aggregate([...pipeline, { $count: 'count' }], { allowDiskUse: true, maxTimeMS: 120000 })
    .toArray();
  return result[0]?.count || 0;
}

async function main() {
  if (!uri) {
    fail('MONGO_RESTORE_TARGET_URI is required.');
    return;
  }

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    fail('MONGO_RESTORE_TARGET_URI is not a valid URL.');
    return;
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] || '');
  if (!/^restore_test_[A-Za-z0-9_-]{1,50}$/.test(databaseName)) {
    fail('Verification is allowed only for a restore_test_* database.');
    return;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const database = mongoose.connection.db;
    const listed = await database.listCollections({}, { nameOnly: true }).toArray();
    const collectionNames = new Set(listed.map((collection) => collection.name));
    const requiredCollections = ['organizations', 'branches', 'organizationmemberships'];
    const missingCollections = requiredCollections.filter((name) => !collectionNames.has(name));
    if (missingCollections.length) {
      fail('Missing core tenant collections: ' + missingCollections.join(', ') + '.');
      return;
    }

    const [organizationCount, branchCount, membershipCount] = await Promise.all([
      database.collection('organizations').countDocuments({}),
      database.collection('branches').countDocuments({}),
      database.collection('organizationmemberships').countDocuments({}),
    ]);
    if (organizationCount < 1 || branchCount < 1 || membershipCount < 1) {
      fail('The restored database must contain at least one organization, branch and organization membership.');
      return;
    }

    const requiredIndexes = [
      { collection: 'organizations', keys: { slug: 1 } },
      { collection: 'branches', keys: { organizationId: 1, code: 1 } },
      { collection: 'organizationmemberships', keys: { organizationId: 1, userId: 1 } },
    ];
    const missingIndexes = [];
    for (const requirement of requiredIndexes) {
      const indexes = await database.collection(requirement.collection).indexes();
      if (!matchesIndex(indexes, requirement.keys)) {
        missingIndexes.push(requirement.collection + ' ' + JSON.stringify(requirement.keys) + ' (unique)');
      }
    }
    if (missingIndexes.length) {
      fail('Missing required tenant isolation indexes: ' + missingIndexes.join('; ') + '.');
      return;
    }

    const definitions = [
      ['organization_membership_reference_mismatch', 'organizationmemberships', membershipIntegrityPipeline()],
      ['organization_branch_reference_mismatch', 'branches', organizationAndBranchIntegrityPipeline()],
      ['tenant_class_scope_mismatch', 'tenantclasses', organizationAndBranchIntegrityPipeline()],
      ['tenant_staff_profile_scope_mismatch', 'tenantstaffprofiles', organizationAndBranchIntegrityPipeline()],
      ['tenant_media_scope_mismatch', 'tenantmediaassets', organizationAndBranchIntegrityPipeline()],
      ['tenant_announcement_scope_mismatch', 'tenantannouncements', organizationAndBranchIntegrityPipeline()],
      ['tenant_calendar_scope_mismatch', 'tenantcalendarevents', organizationAndBranchIntegrityPipeline()],
      ['tenant_work_report_scope_mismatch', 'tenantworkreports', organizationAndBranchIntegrityPipeline()],
      ['tenant_sequence_scope_mismatch', 'tenantsequences', organizationAndBranchIntegrityPipeline()],
      ['tenant_student_scope_mismatch', 'students', organizationAndBranchIntegrityPipeline()],
      ['tenant_attendance_child_mismatch', 'attendances', attendanceChildIntegrityPipeline()],
      ['tenant_guardian_reference_mismatch', 'childguardians', childGuardianIntegrityPipeline()],
      ['tenant_invoice_child_mismatch', 'feeinvoices', invoiceChildIntegrityPipeline()],
      ['tenant_payment_reference_mismatch', 'feetransactions', feeTransactionIntegrityPipeline()],
    ];

    const integrityIssues = [];
    for (const [code, collectionName, pipeline] of definitions) {
      const count = await countIssues(database, collectionNames, collectionName, pipeline);
      if (count > 0) integrityIssues.push({ code, count });
    }

    // The verifier reports issue categories and counts only. It never writes or
    // prints child names, family contact details, invoice descriptions or tokens.
    if (integrityIssues.length) {
      console.error(JSON.stringify({
        verification: 'failed',
        database: databaseName,
        integrityIssues,
        personalDataPrinted: false,
      }, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify({
      verification: 'passed',
      database: databaseName,
      coreCounts: {
        organizations: organizationCount,
        branches: branchCount,
        organizationMemberships: membershipCount,
      },
      tenantReferenceIntegrity: 'verified',
      uniqueTenantIsolationIndexes: 'verified',
      integrityChecksRun: definitions.length,
      collectionCount: collectionNames.size,
      personalDataPrinted: false,
    }, null, 2));
  } catch (error) {
    console.error('Restore verification could not complete:', error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected restore verification error:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  matchesIndex,
  organizationAndBranchIntegrityPipeline,
  membershipIntegrityPipeline,
  guardianIntegrityPipeline,
  childGuardianIntegrityPipeline,
  attendanceChildIntegrityPipeline,
  invoiceChildIntegrityPipeline,
  feeTransactionIntegrityPipeline,
  countIssues,
};
