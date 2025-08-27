const ApiCallTracker = require('../services/apiCallTracker');

class ApiCallController {
  /**
   * Get API call statistics for the authenticated user
   */
  static async getUserApiCallStats(req, res) {
    try {
      const stats = await ApiCallTracker.getApiCallStats(req.user.id);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting user API call stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get API call statistics'
      });
    }
  }

  /**
   * Get API call statistics for all users (admin only)
   */
  static async getAllUsersApiCallStats(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Admin privileges required.'
        });
      }

      const stats = await ApiCallTracker.getAllUsersApiCallStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting all users API call stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get API call statistics'
      });
    }
  }

  /**
   * Reset API call counts for a user (admin only)
   */
  static async resetUserApiCallCounts(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Admin privileges required.'
        });
      }

      const { userId } = req.params;
      const success = await ApiCallTracker.resetApiCallCounts(userId);
      
      if (success) {
        res.json({
          success: true,
          message: 'API call counts reset successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to reset API call counts'
        });
      }
    } catch (error) {
      console.error('Error resetting API call counts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset API call counts'
      });
    }
  }
}

module.exports = ApiCallController;
