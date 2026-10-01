const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'synov-tickets',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'log'],
    resource_type: 'auto',
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/');
    const isPdf = file.mimetype === 'application/pdf';
    const isText = file.mimetype === 'text/plain';
    const isLog = file.originalname.toLowerCase().endsWith('.log');

    if (isImage || isPdf || isText || isLog) {
      cb(null, true);
      return;
    }

    const error = new Error('Unsupported file type. Only images, PDF, text, and .log files are allowed.');
    error.code = 'LIMIT_FILE_TYPE';
    cb(error);
  },
});

module.exports = upload;
