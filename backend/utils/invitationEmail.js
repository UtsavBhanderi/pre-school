'use strict';

const nodemailer = require('nodemailer');

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function getFrontendBaseUrl() {
  const explicit = String(process.env.FRONTEND_URL || '').trim();
  const firstAllowed = String(process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
  const candidate = explicit || firstAllowed;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'http://localhost:5173';
    return parsed.origin;
  } catch {
    return 'http://localhost:5173';
  }
}

function createInvitationUrl(token) {
  return getFrontendBaseUrl() + '/accept-invitation?token=' + encodeURIComponent(token);
}

function mailTransport() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '');
  if (!host || !user || !pass) return null;

  const port = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

async function sendInvitationEmail({ email, fullName, organizationName, role, inviteUrl }) {
  const transport = mailTransport();
  if (!transport) return { sent: false, reason: 'SMTP is not configured; share the one-time link through a verified channel.' };

  const from = String(process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim();
  const safeName = escapeHtml(fullName);
  const safeOrganization = escapeHtml(organizationName);
  const safeRole = escapeHtml(String(role || '').replaceAll('_', ' '));
  const safeUrl = escapeHtml(inviteUrl);
  try {
    await transport.sendMail({
      from,
      to: email,
      subject: 'Invitation to ' + organizationName + ' preschool workspace',
      text: [
        'Hello ' + fullName + ',',
        '',
        organizationName + ' has invited you to join its preschool management workspace as ' + String(role || '').replaceAll('_', ' ') + '.',
        'Open this secure, one-time invitation link to set up your access:',
        inviteUrl,
        '',
        'The link expires after 72 hours. If you were not expecting this invitation, do not open it and contact the preschool directly.',
      ].join('\n'),
      html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#22344c;line-height:1.6">' +
        '<h2 style="color:#2f4fbd">You are invited</h2>' +
        '<p>Hello ' + safeName + ',</p><p><strong>' + safeOrganization + '</strong> has invited you to join its preschool workspace as <strong>' + safeRole + '</strong>.</p>' +
        '<p><a href="' + safeUrl + '" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#3655ce;color:white;text-decoration:none">Accept invitation</a></p>' +
        '<p>This one-time link expires after 72 hours. If you were not expecting this invitation, do not open it; contact the preschool directly.</p></div>',
    });
    return { sent: true, sentAt: new Date() };
  } catch (error) {
    console.error('Invitation email delivery failed:', error?.code || error?.name || 'mail_error');
    return { sent: false, reason: 'Email delivery failed; copy the invitation link and share it securely.' };
  }
}

module.exports = { getFrontendBaseUrl, createInvitationUrl, sendInvitationEmail };
