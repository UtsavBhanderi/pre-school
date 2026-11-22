'use strict';

const mongoose = require('mongoose');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

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

    const documentRecords = collectionNames.has('studentdocuments')
      ? await database.collection('studentdocuments').find({}).project({
          storageName: 1,
          sizeBytes: 1,
          sha256: 1,
        }).toArray()
      : [];
    const documentsDirectory = String(process.env.RESTORE_PRIVATE_DOCUMENTS_DIR || '').trim();
    if (documentRecords.length && !documentsDirectory) {
      fail('RESTORE_PRIVATE_DOCUMENTS_DIR is required to verify restored student documents.');
      return;
    }

    let verifiedStudentDocumentFiles = 0;
    if (documentsDirectory) {
      let realDocumentsRoot;
      try {
        realDocumentsRoot = await fs.realpath(documentsDirectory);
      } catch {
        fail('The restored private student-documents directory is missing.');
        return;
      }

      const namePattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(pdf|jpg|jpeg|png|webp)$/i;
      const expectedNames = new Set();
      for (const document of documentRecords) {
        const name = String(document.storageName || '');
        if (!namePattern.test(name) || expectedNames.has(name)) {
          fail('A restored student document has an unsafe or duplicate storage name.');
          return;
        }
        expectedNames.add(name);

        const filePath = path.resolve(realDocumentsRoot, name);
        if (!filePath.startsWith(realDocumentsRoot + path.sep)) {
          fail('A restored student document resolved outside its private directory.');
          return;
        }

        try {
          const realFile = await fs.realpath(filePath);
          if (!realFile.startsWith(realDocumentsRoot + path.sep)) {
            fail('A restored student document resolved outside its private directory.');
            return;
          }
          const [stat, buffer] = await Promise.all([fs.stat(realFile), fs.readFile(realFile)]);
          const digest = crypto.createHash('sha256').update(buffer).digest('hex');
          if (!stat.isFile() ||
              stat.size !== Number(document.sizeBytes) ||
              buffer.length !== Number(document.sizeBytes) ||
              digest !== document.sha256) {
            fail('A restored student document is missing, changed or has an invalid checksum.');
            return;
          }
          verifiedStudentDocumentFiles += 1;
        } catch {
          fail('A restored student document file is missing or unreadable.');
          return;
        }
      }

      const entries = await fs.readdir(realDocumentsRoot, { withFileTypes: true });
      const actualFiles = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
      if (entries.some((entry) => !entry.isFile()) ||
          actualFiles.length !== expectedNames.size ||
          actualFiles.some((name) => !expectedNames.has(name))) {
        fail('The restored private directory contains missing, extra or unsupported files.');
        return;
      }
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
      verifiedStudentDocumentFiles,
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
