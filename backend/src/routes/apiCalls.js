const express = require('express');
const router = express.Router();
const ApiCallController = require('../controllers/apiCallController');
const { authenticateToken } = require('../middleware/auth');

// Get API call statistics for the authenticated user
router.get('/user-stats', authenticateToken, ApiCallController.getUserApiCallStats);

// Get API call statistics for all users (admin only)
router.get('/all-users-stats', authenticateToken, ApiCallController.getAllUsersApiCallStats);

// Reset API call counts for a user (admin only)
router.post('/reset/:userId', authenticateToken, ApiCallController.resetUserApiCallCounts);

module.exports = router;
