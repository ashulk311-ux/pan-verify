const User = require('../models/User');

class ApiCallTracker {
  /**
   * Increment API call count for a user
   * @param {string} userId - User ID
   * @param {string} provider - API provider (e.g., 'sandbox')
   */
  static async incrementApiCall(userId, provider = 'sandbox') {
    try {
      const updateData = {
        $inc: {
          api_calls_total: 1,
          [`api_calls_${provider}`]: 1
        },
        api_calls_last_updated: new Date()
      };

      await User.findByIdAndUpdate(userId, updateData);
      
      console.log(`API call tracked for user ${userId}, provider: ${provider}`);
    } catch (error) {
      console.error('Error tracking API call:', error);
      // Don't throw error to avoid breaking the main verification flow
    }
  }

  /**
   * Get API call statistics for a user
   * @param {string} userId - User ID
   */
  static async getApiCallStats(userId) {
    try {
      const user = await User.findById(userId).select('api_calls_total api_calls_sandbox api_calls_last_updated');
      return {
        total: user.api_calls_total || 0,
        sandbox: user.api_calls_sandbox || 0,
        last_updated: user.api_calls_last_updated
      };
    } catch (error) {
      console.error('Error getting API call stats:', error);
      return {
        total: 0,
        sandbox: 0,
        last_updated: null
      };
    }
  }

  /**
   * Get API call statistics for all users (admin only)
   */
  static async getAllUsersApiCallStats() {
    try {
      const users = await User.find({}).select('name email api_calls_total api_calls_sandbox api_calls_last_updated');
      return users.map(user => ({
        user_id: user._id,
        name: user.name,
        email: user.email,
        api_calls_total: user.api_calls_total || 0,
        api_calls_sandbox: user.api_calls_sandbox || 0,
        last_updated: user.api_calls_last_updated
      }));
    } catch (error) {
      console.error('Error getting all users API call stats:', error);
      return [];
    }
  }

  /**
   * Reset API call counts for a user (admin only)
   * @param {string} userId - User ID
   */
  static async resetApiCallCounts(userId) {
    try {
      await User.findByIdAndUpdate(userId, {
        api_calls_total: 0,
        api_calls_sandbox: 0,
        api_calls_last_updated: new Date()
      });
      
      console.log(`API call counts reset for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error resetting API call counts:', error);
      return false;
    }
  }
}

module.exports = ApiCallTracker;
