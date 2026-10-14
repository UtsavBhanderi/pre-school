'use strict';

const nodemailer = require('nodemailer');
const { getFrontendBaseUrl } = require('./invitationEmail');

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function createOrganizationVerificationUrl(token) {
  return getFrontendBaseUrl() + '/verify-organization#token=' + encodeURIComponent(token);
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

function isVerificationEmailConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || '').trim() &&
    String(process.env.EMAIL_USER || '').trim() &&
    String(process.env.EMAIL_PASS || '') &&
    String(process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim()
  );
}

async function sendOrganizationVerificationEmail({ email, fullName, organizationName, verificationUrl }) {
  const transport = mailTransport();
  if (!transport) return { sent: false, reason: 'SMTP is not configured.' };

  const from = String(process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim();
  const safeName = escapeHtml(fullName);
  const safeOrganization = escapeHtml(organizationName);
  const safeUrl = escapeHtml(verificationUrl);

  try {
    await transport.sendMail({
      from,
      to: email,
      subject: 'Verify your email to create a preschool workspace',
      text: [
        'Hello ' + fullName + ',',
        '',
        'Verify this email address to create the ' + organizationName + ' preschool workspace.',
        'The one-time link expires after 24 hours:',
        verificationUrl,
        '',
        'Your organization will not be created until you verify this email and choose a password.',
        'If you did not request this, ignore this email.',
      ].join('\n'),
      html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#22344c;line-height:1.6">' +
        '<h2 style="color:#2f4fbd">Verify your email</h2>' +
        '<p>Hello ' + safeName + ',</p>' +
        '<p>Verify this email address to create the <strong>' + safeOrganization + '</strong> preschool workspace.</p>' +
        '<p><a href="' + safeUrl + '" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#3655ce;color:white;text-decoration:none">Verify email and continue</a></p>' +
        '<p>This one-time link expires after 24 hours. Your organization is not created until verification is complete.</p>' +
        '<p>If you did not request this, you can safely ignore this email.</p></div>',
    });
    return { sent: true };
  } catch (error) {
    console.error('Organization verification email delivery failed:', error?.code || error?.name || 'mail_error');
    return { sent: false, reason: 'Email delivery failed.' };
  }
}

module.exports = {
  createOrganizationVerificationUrl,
  isVerificationEmailConfigured,
  sendOrganizationVerificationEmail,
};
