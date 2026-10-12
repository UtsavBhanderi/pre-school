'use strict';

const crypto = require('crypto');

const INVITATION_TTL_HOURS = 72;

function createInvitationToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

function hashInvitationToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 200) return '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

function invitationExpiry(from = new Date()) {
  return new Date(from.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
}

function isInvitationLive(invitation, now = new Date()) {
  return Boolean(invitation && invitation.status === 'pending' && invitation.expiresAt instanceof Date && invitation.expiresAt.getTime() > now.getTime());
}

module.exports = { INVITATION_TTL_HOURS, createInvitationToken, hashInvitationToken, invitationExpiry, isInvitationLive };
