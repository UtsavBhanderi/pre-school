'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BACKUP_SCRIPT = path.resolve(__dirname, '../ops/mongo-backup.sh');
const RESTORE_SCRIPT = path.resolve(__dirname, '../ops/mongo-restore-to-staging.sh');

const MOCK_DUMP = String.raw`#!/bin/bash
set -e
if [[ "$1" == "--version" ]]; then
  printf 'mongodump version: 100.9.0\n'
  exit 0
fi
archive=""
for argument in "$@"; do
  case "$argument" in
    --archive=*) archive="$(printf '%s' "$argument" | cut -d= -f2-)";;
  esac
done
[[ -n "$archive" ]]
printf 'mock archive contents for integration test\n' > "$archive"
`;

const MOCK_AGE = String.raw`#!/bin/bash
set -e
output=""
input=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --decrypt) shift;;
    --recipient|--identity) shift 2;;
    --output) output="$2"; shift 2;;
    *) input="$1"; shift;;
  esac
done
[[ -n "$output" && -n "$input" ]]
cp -- "$input" "$output"
`;

const MOCK_RESTORE = String.raw`#!/bin/bash
set -e
printf '%s\n' "$@" >> "$MOCK_MONGORESTORE_LOG"
`;

const MOCK_NODE = String.raw`#!/bin/bash
set -e
printf '%s\n' "$@" >> "$MOCK_NODE_LOG"
exit 0
`;

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, { mode: 0o700 });
  fs.chmodSync(filePath, 0o700);
}

function createSandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preschool-backup-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  const backups = path.join(root, 'backups');
  fs.mkdirSync(bin, { mode: 0o700 });
  fs.mkdirSync(backups, { mode: 0o700 });
  writeExecutable(path.join(bin, 'mongodump'), MOCK_DUMP);
  writeExecutable(path.join(bin, 'age'), MOCK_AGE);
  writeExecutable(path.join(bin, 'mongorestore'), MOCK_RESTORE);
  writeExecutable(path.join(bin, 'node'), MOCK_NODE);

  const env = {
    ...process.env,
    PATH: bin + path.delimiter + process.env.PATH,
    MONGO_URI: 'mongodb://backup-user:fake-password@source.example.test:27017/preschool',
    BACKUP_AGE_RECIPIENT: 'age1test-only-public-recipient',
    BACKUP_SOURCE_LABEL: 'ci-backup-test',
    BACKUP_DIR: backups,
    BACKUP_AGE_IDENTITY_FILE: path.join(root, 'fake-age-identity.txt'),
    RESTORE_TARGET_ENV: 'staging',
    RESTORE_CONFIRM_TARGET_DATABASE: 'restore_test_ci',
    RESTORE_APPROVED_BY: 'CI operator',
    RESTORE_CHANGE_TICKET: 'CI-12345',
    MONGO_RESTORE_TARGET_URI: 'mongodb://restore-user:fake-password@staging.example.test:27017/restore_test_ci',
    MOCK_MONGORESTORE_LOG: path.join(root, 'mongorestore.log'),
    MOCK_NODE_LOG: path.join(root, 'node.log'),
  };
  fs.writeFileSync(env.BACKUP_AGE_IDENTITY_FILE, 'fake identity for mocked age binary\n', { mode: 0o600 });
  return { root, backups, env };
}

function runBash(script, env, args = []) {
  return spawnSync('/bin/bash', [script, ...args], {
    env,
    encoding: 'utf8',
    timeout: 15000,
  });
}

function createBackup(sandbox) {
  const result = runBash(BACKUP_SCRIPT, sandbox.env);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const archiveName = fs.readdirSync(sandbox.backups).find((name) => name.endsWith('.archive.gz.age'));
  assert.ok(archiveName, 'expected encrypted backup archive');
  const archivePath = path.join(sandbox.backups, archiveName);
  const metadataPath = archivePath + '.meta.json';
  assert.ok(fs.existsSync(metadataPath), 'expected sidecar metadata');
  return { archivePath, metadataPath, metadata: JSON.parse(fs.readFileSync(metadataPath, 'utf8')) };
}

test('backup scripts parse cleanly with bash', () => {
  for (const script of [BACKUP_SCRIPT, RESTORE_SCRIPT]) {
    const result = spawnSync('/bin/bash', ['-n', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || ('syntax check failed: ' + script));
  }
});

test('backup creates an age-encrypted archive and verified sidecar metadata', (t) => {
  const sandbox = createSandbox(t);
  const { archivePath, metadataPath, metadata } = createBackup(sandbox);

  assert.equal(metadata.format, 'preschool-mongodb-backup-v1');
  assert.equal(metadata.database, 'preschool');
  assert.equal(metadata.encryption, 'age');
  assert.equal(metadata.sourceLabel, 'ci-backup-test');
  assert.match(metadata.sourceEndpointSha256, /^[a-f0-9]{64}$/);
  assert.equal(metadata.sizeBytes, fs.statSync(archivePath).size);
  assert.equal(
    metadata.sha256,
    crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex'),
  );
  assert.equal(fs.statSync(archivePath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(metadataPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(sandbox.backups).mode & 0o777, 0o700);
});

test('restore refuses the same MongoDB endpoint before running mongorestore', (t) => {
  const sandbox = createSandbox(t);
  const { archivePath } = createBackup(sandbox);
  sandbox.env.MONGO_RESTORE_TARGET_URI =
    'mongodb://restore-user:fake-password@source.example.test:27017/restore_test_ci';

  const result = runBash(RESTORE_SCRIPT, sandbox.env, [archivePath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /different MongoDB deployment/i);
  assert.equal(fs.existsSync(sandbox.env.MOCK_MONGORESTORE_LOG), false);
});

test('restore refuses tampered backups before running restore tools', (t) => {
  const sandbox = createSandbox(t);
  const { archivePath } = createBackup(sandbox);
  fs.appendFileSync(archivePath, 'tampered');

  const result = runBash(RESTORE_SCRIPT, sandbox.env, [archivePath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum mismatch/i);
  assert.equal(fs.existsSync(sandbox.env.MOCK_MONGORESTORE_LOG), false);
});

test('restore maps namespaces only into a confirmed restore_test database', (t) => {
  const sandbox = createSandbox(t);
  const { archivePath } = createBackup(sandbox);

  const result = runBash(RESTORE_SCRIPT, sandbox.env, [archivePath]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const restoreArgs = fs.readFileSync(sandbox.env.MOCK_MONGORESTORE_LOG, 'utf8');
  assert.match(restoreArgs, /--drop/);
  assert.match(restoreArgs, /--stopOnError/);
  assert.match(restoreArgs, /--nsFrom=preschool\.\*/);
  assert.match(restoreArgs, /--nsTo=restore_test_ci\.\*/);
  assert.match(fs.readFileSync(sandbox.env.MOCK_NODE_LOG, 'utf8'), /verify-restore\.js/);
});

test('restore refuses a database name confirmation mismatch', (t) => {
  const sandbox = createSandbox(t);
  const { archivePath } = createBackup(sandbox);
  sandbox.env.RESTORE_CONFIRM_TARGET_DATABASE = 'restore_test_wrong';

  const result = runBash(RESTORE_SCRIPT, sandbox.env, [archivePath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the URI database/i);
  assert.equal(fs.existsSync(sandbox.env.MOCK_MONGORESTORE_LOG), false);
});
