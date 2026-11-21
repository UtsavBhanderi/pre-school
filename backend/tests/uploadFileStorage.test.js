'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { resolveManagedUploadPath, removeManagedUploadFile } = require('../utils/uploadFileStorage');

test('resolves stored and multer upload paths only inside their upload folder', async () => {
  const root = path.join(os.tmpdir(), 'school-media-test', 'gallery');
  const stored = resolveManagedUploadPath(root, '/uploads/gallery/image.jpg');
  assert.equal(stored, path.join(root, 'image.jpg'));
  assert.equal(resolveManagedUploadPath(root, path.join(root, 'new-image.jpg')), path.join(root, 'new-image.jpg'));
  assert.equal(resolveManagedUploadPath(root, '../secret.txt'), null);
  assert.equal(resolveManagedUploadPath(root, '/uploads/video/video.mp4'), null);
  assert.equal(resolveManagedUploadPath(root, path.join(path.dirname(root), 'outside.jpg')), null);
  assert.equal(resolveManagedUploadPath(root, 'nested/image.jpg'), null);
});

test('removes a managed file safely and treats a missing file as already cleaned', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'school-upload-'));
  const file = path.join(root, 'image.jpg');
  try {
    await fs.writeFile(file, 'test');
    assert.equal(await removeManagedUploadFile(root, file), true);
    await assert.rejects(fs.access(file));
    assert.equal(await removeManagedUploadFile(root, file), false);
    assert.equal(await removeManagedUploadFile(root, '../outside.jpg'), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
