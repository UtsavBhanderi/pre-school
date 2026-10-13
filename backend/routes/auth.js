'use strict';

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const OrganizationMembership = require('../models/OrganizationMembership');
const { resolveWorkspaceMembershipState } = require('../utils/workspaceMembershipState');

const ALLOWED_ROLES = new Set(['teacher', 'admin', 'student']);

const signToken = (user) => jwt.sign(
  { user: { id: user.id, role: user.role } },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

// Public registration can create teacher accounts only. An authenticated
// administrator may create accounts with any supported role.
router.post('/register', async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Authentication is not configured on the server.' });
    }

    const token = req.header('x-auth-token');
    if (!token) {
      return res.status(401).json({ message: 'Administrator authentication is required to create users.' });
    }

    let requester;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      requester = await User.findById(decoded?.user?.id).select('-password');
    } catch {
      return res.status(401).json({ message: 'Token is invalid or has expired.' });
    }

    if (!requester) return res.status(401).json({ message: 'The authenticated account no longer exists.' });
    if (requester.role !== 'admin') {
      return res.status(403).json({ message: 'Only an administrator can create user accounts.' });
    }

    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const requestedRole = String(req.body.role || 'teacher').toLowerCase();

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
    }
    if (!ALLOWED_ROLES.has(requestedRole)) {
      return res.status(400).json({ message: 'Invalid user role.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const user = await User.create({ username, email, password, role: requestedRole });
    return res.status(201).json({
      token: signToken(user),
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    console.error('Registration failed:', error);
    return res.status(500).json({ message: 'Unable to create the account.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    return res.json({ token: signToken(user) });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ message: 'Unable to log in right now.' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const allMemberships = await OrganizationMembership.find({
      userId: req.user._id,
    })
      .populate({ path: 'organizationId', select: 'name slug status timezone locale currency subscription.plan subscription.status' })
      .populate({ path: 'branchIds', select: 'name code status timezone' })
      .sort({ createdAt: 1 })
      .lean();

    const { memberships, hasInactiveWorkspaceMemberships } = resolveWorkspaceMembershipState(allMemberships);

    return res.json({
      user: {
        hasInactiveWorkspaceMemberships,
        id: String(req.user._id),
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        memberships: memberships.filter((entry) => entry.organizationId).map((entry) => ({
          id: String(entry._id),
          organization: {
            id: String(entry.organizationId._id),
            name: entry.organizationId.name,
            slug: entry.organizationId.slug,
            timezone: entry.organizationId.timezone,
            locale: entry.organizationId.locale,
            currency: entry.organizationId.currency,
            status: entry.organizationId.status,
            subscription: entry.organizationId.subscription || {},
          },
          role: entry.role,
          status: entry.status,
          classNames: entry.classNames || [],
          branchIds: (entry.branchIds || []).map((branch) => ({
            id: String(branch._id),
            name: branch.name,
            code: branch.code,
            status: branch.status,
            timezone: branch.timezone,
          })),
          accessAllBranches: Boolean(entry.accessAllBranches),
        })),
      },
    });
  } catch (error) {
    console.error('Unable to load user workspace context:', error);
    return res.status(503).json({ message: 'Your school workspace could not be loaded.' });
  }
});

module.exports = router;
