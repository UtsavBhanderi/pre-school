'use strict';

const nodemailer = require('nodemailer');

function getTransport() {
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '');
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: String(process.env.EMAIL_SERVICE || 'gmail').trim(),
    auth: { user, pass },
  });
}

function getAppBaseUrl() {
  return String(process.env.APP_BASE_URL || process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')[0].trim().replace(/\/+$/, '');
}

function buildInvitationUrl(token) {
  return getAppBaseUrl() + '/accept-invitation?token=' + encodeURIComponent(token);
}

async function sendInvitationEmail({ email, organizationName, role, invitedByName, acceptUrl, expiresAt }) {
  const transport = getTransport();
  if (!transport) {
    const error = new Error('Email delivery is not configured.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
  const expiryText = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
  }).format(expiresAt);
  const safeOrganization = escapeHtml(organizationName);
  const safeInviter = escapeHtml(invitedByName || 'Your school administrator');
  const safeRole = escapeHtml(role.replace(/_/g, ' '));
  const safeUrl = escapeHtml(acceptUrl);
  await transport.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: 'Invitation to ' + organizationName + ' preschool workspace',
    text: [
      'You have been invited to join ' + organizationName + '.',
      'Invited by: ' + (invitedByName || 'Your school administrator'),
      'Role: ' + role.replace(/_/g, ' '),
      '',
      'Accept this invitation using the secure link:',
      acceptUrl,
      '',
      'This one-time link expires on ' + expiryText + '.',
      'If you were not expecting this invitation, you can ignore this email.',
    ].join('\n'),
    html: '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1c2d45;max-width:560px;margin:0 auto">' +
      '<h2>You are invited to join ' + safeOrganization + '</h2>' +
      '<p>' + safeInviter + ' invited you to the preschool workspace.</p>' +
      '<p><strong>Role:</strong> ' + safeRole + '</p>' +
      '<p><a href="' + safeUrl + '" style="display:inline-block;background:#3655ce;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px">Accept invitation</a></p>' +
      '<p>This single-use link expires on <strong>' + escapeHtml(expiryText) + '</strong>.</p>' +
      '<p>If you were not expecting this invitation, you can ignore this message.</p>' +
      '</div>',
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

module.exports = { getTransport, getAppBaseUrl, buildInvitationUrl, sendInvitationEmail };
