const express = require('express');
const { body } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const aadhaarController = require('../controllers/aadhaarController');

const router = express.Router();

// Validation rules
const checkStatusValidation = [
  body('aadhaar_number').optional().isLength({ min: 12, max: 12 }).matches(/^\d{12}$/),
  body('pan_number').optional().isLength({ min: 10, max: 10 }).matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
];

// Routes
router.post('/upload', authenticateToken, upload.single('file'), aadhaarController.uploadAadhaarFile);
router.get('/files', authenticateToken, aadhaarController.getUserFiles);
router.get('/files/:fileId/records', authenticateToken, aadhaarController.getFileRecords);
router.get('/files/:fileId/stats', authenticateToken, aadhaarController.getFileStats);
router.delete('/files/:fileId', authenticateToken, aadhaarController.deleteFile);
router.post('/check-status', authenticateToken, checkStatusValidation, aadhaarController.checkSingleStatus);
router.post('/files/:fileId/retry', authenticateToken, aadhaarController.retryVerification);

module.exports = router;
