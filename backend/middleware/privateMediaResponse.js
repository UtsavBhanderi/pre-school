'use strict';

const {
  rewritePrivateMediaFields,
  mediaPublicBaseUrl,
} = require('../utils/privateMedia');

function privateMediaResponse(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function protectLegacyPhotoResponses(body) {
    if (!req.user?._id || !process.env.JWT_SECRET || !body || typeof body !== 'object') {
      return originalJson(body);
    }

    const rewritten = rewritePrivateMediaFields(body, {
      userId: req.user._id,
      secret: process.env.JWT_SECRET,
      publicBaseUrl: mediaPublicBaseUrl(req),
    });
    return originalJson(rewritten);
  };

  return next();
}

module.exports = privateMediaResponse;
