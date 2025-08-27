const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const verificationStatsController = require('../controllers/verificationStatsController');

const router = express.Router();

// Get verification statistics for the current user
router.get('/verification-stats', authenticateToken, verificationStatsController.getVerificationStats);

// Force update verification statistics
router.post('/verification-stats/update', authenticateToken, verificationStatsController.forceUpdateStats);

module.exports = router;
