const VerificationStats = require('../models/VerificationStats');
const PanVerification = require('../models/PanVerification');
const AadhaarPanLinking = require('../models/AadhaarPanLinking');
const User = require('../models/User');

class VerificationStatsService {
  // Get or create stats for a user
  static async getOrCreateStats(userId) {
    let stats = await VerificationStats.findOne({ user_id: userId });
    
    if (!stats) {
      stats = await VerificationStats.create({ user_id: userId });
    }
    
    return stats;
  }

  // Update stats for a user
  static async updateStats(userId) {
    try {
      // Get PAN KYC counts
      const panStats = await PanVerification.aggregate([
        { $match: { user_id: userId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get Aadhaar-PAN linking counts
      const aadhaarStats = await AadhaarPanLinking.aggregate([
        { $match: { user_id: userId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Convert to object for easier access
      const panCounts = {};
      panStats.forEach(stat => {
        panCounts[stat._id] = stat.count;
      });

      const aadhaarCounts = {};
      aadhaarStats.forEach(stat => {
        aadhaarCounts[stat._id] = stat.count;
      });

      // Calculate totals
      const panTotal = Object.values(panCounts).reduce((sum, count) => sum + count, 0);
      const aadhaarTotal = Object.values(aadhaarCounts).reduce((sum, count) => sum + count, 0);
      const totalVerifications = panTotal + aadhaarTotal;

      // Calculate combined stats
      const totalVerified = (panCounts.verified || 0) + (aadhaarCounts.verified || 0);
      const totalFailed = (panCounts.failed || 0) + (aadhaarCounts.failed || 0);
      const totalPending = (panCounts.pending || 0) + (aadhaarCounts.pending || 0);
      const totalProcessing = (panCounts.processing || 0) + (aadhaarCounts.processing || 0);

      // Update stats in database
      const stats = await VerificationStats.findOneAndUpdate(
        { user_id: userId },
        {
          // Total stats
          total_verifications: totalVerifications,
          total_verified: totalVerified,
          total_failed: totalFailed,
          total_pending: totalPending,
          total_processing: totalProcessing,
          
          // PAN KYC stats
          pan_kyc_total: panTotal,
          pan_kyc_verified: panCounts.verified || 0,
          pan_kyc_failed: panCounts.failed || 0,
          pan_kyc_pending: panCounts.pending || 0,
          pan_kyc_processing: panCounts.processing || 0,
          
          // Aadhaar-PAN linking stats
          aadhaar_pan_total: aadhaarTotal,
          aadhaar_pan_verified: aadhaarCounts.verified || 0,
          aadhaar_pan_failed: aadhaarCounts.failed || 0,
          aadhaar_pan_pending: aadhaarCounts.pending || 0,
          aadhaar_pan_processing: aadhaarCounts.processing || 0,
          
          last_updated: new Date()
        },
        { 
          new: true, 
          upsert: true 
        }
      );

      // Update user document with verification stats
      await User.findByIdAndUpdate(
        userId,
        {
          // Total stats
          total_verifications: totalVerifications,
          total_verified: totalVerified,
          total_failed: totalFailed,
          total_pending: totalPending,
          total_processing: totalProcessing,
          
          // PAN KYC stats
          pan_kyc_total: panTotal,
          pan_kyc_verified: panCounts.verified || 0,
          pan_kyc_failed: panCounts.failed || 0,
          pan_kyc_pending: panCounts.pending || 0,
          pan_kyc_processing: panCounts.processing || 0,
          
          // Aadhaar-PAN linking stats
          aadhaar_pan_total: aadhaarTotal,
          aadhaar_pan_verified: aadhaarCounts.verified || 0,
          aadhaar_pan_failed: aadhaarCounts.failed || 0,
          aadhaar_pan_pending: aadhaarCounts.pending || 0,
          aadhaar_pan_processing: aadhaarCounts.processing || 0,
          
          last_stats_update: new Date()
        }
      );

      return stats;
    } catch (error) {
      console.error('Error updating verification stats:', error);
      throw error;
    }
  }

  // Get stats for a user
  static async getStats(userId) {
    try {
      const stats = await this.getOrCreateStats(userId);
      
      // If stats are old (more than 5 minutes), update them
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (stats.last_updated < fiveMinutesAgo) {
        return await this.updateStats(userId);
      }
      
      return stats;
    } catch (error) {
      console.error('Error getting verification stats:', error);
      throw error;
    }
  }

  // Force update stats (used when verification status changes)
  static async forceUpdateStats(userId) {
    return await this.updateStats(userId);
  }
}

module.exports = VerificationStatsService;
