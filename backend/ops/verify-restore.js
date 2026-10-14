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

    console.log(JSON.stringify({
      verification: 'passed',
      database: databaseName,
      coreCounts: {
        organizations: organizationCount,
        branches: branchCount,
        organizationMemberships: membershipCount,
      },
      uniqueTenantIsolationIndexes: 'verified',
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

main().catch((error) => {
  console.error('Unexpected restore verification error:', error.message);
  process.exitCode = 1;
});
