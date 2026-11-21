'use strict';

function getHttpErrorResponse(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const type = typeof error?.type === 'string' ? error.type : '';

  if (code === 'CORS_ORIGIN_DENIED') {
    return { status: 403, body: { message: 'This website is not allowed to access the school service.' } };
  }

  if (code === 'LIMIT_FILE_SIZE') {
    return { status: 413, body: { message: 'The uploaded file is too large. Choose a smaller file and try again.' } };
  }

  if (code.startsWith('LIMIT_')) {
    return { status: 400, body: { message: 'The uploaded file could not be accepted. Check the selected file and try again.' } };
  }

  if (type === 'entity.parse.failed' || type === 'request.size.invalid') {
    return { status: 400, body: { message: 'The request could not be read. Check the submitted information and try again.' } };
  }

  if (type === 'entity.too.large') {
    return { status: 413, body: { message: 'The request is too large. Reduce the amount of submitted data and try again.' } };
  }

  if (type === 'charset.unsupported' || type === 'encoding.unsupported') {
    return { status: 415, body: { message: 'This request format is not supported.' } };
  }

  return {
    status: 500,
    body: { message: 'Something went wrong while processing your request. Please try again.' },
  };
}

module.exports = { getHttpErrorResponse };
