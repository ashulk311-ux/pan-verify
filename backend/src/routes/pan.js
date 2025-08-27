const express = require('express');
const { body } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const panController = require('../controllers/panController');

const router = express.Router();

// Validation rules
const singlePanValidation = [
  body('pan_number').isLength({ min: 10, max: 10 }).matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/),
  body('name').trim().isLength({ min: 2 }),
  body('father_name').trim().isLength({ min: 2 }),
  body('date_of_birth').isISO8601()
];

// Routes
router.post('/upload', authenticateToken, upload.single('file'), panController.uploadBulkPan);
router.post('/verify-single', authenticateToken, singlePanValidation, panController.verifySinglePan);
router.post('/verify-multiple', authenticateToken, panController.verifyMultiplePan);
router.get('/verifications', authenticateToken, panController.getVerifications);
router.get('/verifications/:id', authenticateToken, panController.getVerificationById);

module.exports = router;
