'use strict';

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TENANT_MEDIA_ISSUER = 'preschool-tenant-media';
const TENANT_MEDIA_AUDIENCE = 'tenant-private-media';
const TENANT_MEDIA_TOKEN_TTL_SECONDS = 120;

function signTenantMediaToken({ userId, assetId, organizationId, branchId, secret }) {
  const ids = [userId, assetId, organizationId, branchId];
  if (!secret || ids.some((id) => !mongoose.Types.ObjectId.isValid(String(id || '')))) {
    throw new TypeError('A signing secret and valid user, asset, organization and branch IDs are required.');
  }
  return jwt.sign(
    {
      purpose: 'tenant-media-read',
      assetId: String(assetId),
      organizationId: String(organizationId),
      branchId: String(branchId),
    },
    secret,
    {
      subject: String(userId),
      expiresIn: TENANT_MEDIA_TOKEN_TTL_SECONDS,
      issuer: TENANT_MEDIA_ISSUER,
      audience: TENANT_MEDIA_AUDIENCE,
      algorithm: 'HS256',
    }
  );
}

function verifyTenantMediaToken(token, secret) {
  if (typeof token !== 'string' || !token || !secret) return null;
  try {
    const claims = jwt.verify(token, secret, {
      issuer: TENANT_MEDIA_ISSUER,
      audience: TENANT_MEDIA_AUDIENCE,
      algorithms: ['HS256'],
    });
    if (claims?.purpose !== 'tenant-media-read' ||
        ![claims.sub, claims.assetId, claims.organizationId, claims.branchId]
          .every((id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))) {
      return null;
    }
    return {
      userId: claims.sub,
      assetId: claims.assetId,
      organizationId: claims.organizationId,
      branchId: claims.branchId,
    };
  } catch {
    return null;
  }
}

module.exports = {
  TENANT_MEDIA_ISSUER,
  TENANT_MEDIA_AUDIENCE,
  TENANT_MEDIA_TOKEN_TTL_SECONDS,
  signTenantMediaToken,
  verifyTenantMediaToken,
};
