'use strict';

const fs = require('fs/promises');
const path = require('path');

function resolveManagedUploadPath(uploadRoot, candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  const root = path.resolve(uploadRoot);
  const folder = path.basename(root);
  let absolutePath;

  if (path.isAbsolute(candidate)) {
    absolutePath = path.resolve(candidate);
  } else {
    const normalized = candidate.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    const prefixes = ['uploads/' + folder + '/', '/uploads/' + folder + '/'];
    const prefix = prefixes.find((value) => normalized.startsWith(value));
    const filename = prefix ? normalized.slice(prefix.length) : normalized;
    if (!filename || filename === '.' || filename === '..' || filename.includes('/')) return null;
    absolutePath = path.resolve(root, filename);
  }

  const relative = path.relative(root, absolutePath);
  if (!relative || relative === '.' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
  return absolutePath;
}

async function removeManagedUploadFile(uploadRoot, candidate) {
  const absolutePath = resolveManagedUploadPath(uploadRoot, candidate);
  if (!absolutePath) return false;
  try {
    await fs.unlink(absolutePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    return false;
  }
}

module.exports = { resolveManagedUploadPath, removeManagedUploadFile };
