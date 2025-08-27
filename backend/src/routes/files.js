const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const fileController = require('../controllers/fileController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Upload file
router.post('/upload', fileController.upload.single('file'), fileController.uploadFile);

// Get user's uploaded files
router.get('/files', fileController.getUserFiles);

// Get PAN records from a specific file
router.get('/files/:fileId/records', fileController.getFileRecords);

// Get file statistics
router.get('/files/:fileId/stats', fileController.getFileStats);

// Delete an uploaded file (and its related records)
router.delete('/files/:fileId', fileController.deleteUserFile);

// Retry verification for failed records
router.post('/files/:fileId/retry', fileController.retryVerification);

module.exports = router;
