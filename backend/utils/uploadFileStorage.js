'use strict';

const fs = require('fs/promises');
const path = require('path');

function resolveManagedUploadPath(uploadRoot, candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  const root = path.resolve(uploadRoot);
  const folder = path.basename(root);
  const normalized = candidate.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const prefixes = ['uploads/' + folder + '/', '/uploads/' + folder + '/'];
  const prefix = prefixes.find((value) => normalized.startsWith(value));
  let absolutePath;
  if (prefix) {
    const filename = normalized.slice(prefix.length);
    if (!filename || filename === '.' || filename === '..' || filename.includes('/')) return null;
    absolutePath = path.resolve(root, filename);
  } else if (path.isAbsolute(candidate)) {
    absolutePath = path.resolve(candidate);
  } else {
    if (!normalized || normalized === '.' || normalized === '..' || normalized.includes('/')) return null;
    absolutePath = path.resolve(root, normalized);
  }
  const relative = path.relative(root, absolutePath);
  if (!relative || relative === '.' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
  return absolutePath;
}

async function removeManagedUploadFile(uploadRoot, candidate) {
  const absolutePath = resolveManagedUploadPath(uploadRoot, candidate);
  if (!absolutePath) return false;
  try { await fs.unlink(absolutePath); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; return false; }
}

module.exports = { resolveManagedUploadPath, removeManagedUploadFile };
