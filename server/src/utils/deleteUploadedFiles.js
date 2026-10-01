const logger = require('./logger');
const cloudinary = require('../config/cloudinary');

async function deleteUploadedFiles(files = []) {
  const results = await Promise.allSettled(
    files.filter((file) => file.filename).map((file) => cloudinary.uploader.destroy(file.filename))
  );

  results.forEach((result) => {
    if (result.status === 'rejected') {
      logger.error('Failed to delete uploaded Cloudinary file:', result.reason?.stack || result.reason);
    }
  });
}

module.exports = deleteUploadedFiles;