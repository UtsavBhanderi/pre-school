'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const token = req.header('x-auth-token');

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'Authentication is not configured on the server.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid authentication token.' });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'The account associated with this token no longer exists.' });
    }

    // Tokens issued before authVersion existed are treated as version 0. Once
    // a password reset increments the stored version, all prior JWTs are denied.
    const tokenVersion = Number.isInteger(decoded?.user?.authVersion) ? decoded.user.authVersion : 0;
    const currentVersion = Number.isInteger(user.authVersion) ? user.authVersion : 0;
    if (tokenVersion !== currentVersion) {
      return res.status(401).json({ message: 'Your sign-in session has expired. Please sign in again.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token is invalid or has expired.' });
  }
};

module.exports = auth;
