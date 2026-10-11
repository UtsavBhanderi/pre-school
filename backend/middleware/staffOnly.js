'use strict';

const staffOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Staff access required.' });
  }

  return next();
};

module.exports = staffOnly;
