const VerificationStatsService = require('../services/verificationStatsService');

const getVerificationStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await VerificationStatsService.getStats(userId);
    
    res.json({
      success: true,
      data: {
        total: stats.total_verifications,
        verified: stats.total_verified,
        failed: stats.total_failed,
        pending: stats.total_pending,
        processing: stats.total_processing,
        pan_kyc: {
          total: stats.pan_kyc_total,
          verified: stats.pan_kyc_verified,
          failed: stats.pan_kyc_failed,
          pending: stats.pan_kyc_pending,
          processing: stats.pan_kyc_processing
        },
        aadhaar_pan: {
          total: stats.aadhaar_pan_total,
          verified: stats.aadhaar_pan_verified,
          failed: stats.aadhaar_pan_failed,
          pending: stats.aadhaar_pan_pending,
          processing: stats.aadhaar_pan_processing
        },
        last_updated: stats.last_updated
      }
    });
  } catch (error) {
    console.error('Error getting verification stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get verification statistics' 
    });
  }
};

const forceUpdateStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await VerificationStatsService.forceUpdateStats(userId);
    
    res.json({
      success: true,
      data: {
        total: stats.total_verifications,
        verified: stats.total_verified,
        failed: stats.total_failed,
        pending: stats.total_pending,
        processing: stats.total_processing,
        pan_kyc: {
          total: stats.pan_kyc_total,
          verified: stats.pan_kyc_verified,
          failed: stats.pan_kyc_failed,
          pending: stats.pan_kyc_pending,
          processing: stats.pan_kyc_processing
        },
        aadhaar_pan: {
          total: stats.aadhaar_pan_total,
          verified: stats.aadhaar_pan_verified,
          failed: stats.aadhaar_pan_failed,
          pending: stats.aadhaar_pan_pending,
          processing: stats.aadhaar_pan_processing
        },
        last_updated: stats.last_updated
      }
    });
  } catch (error) {
    console.error('Error force updating verification stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update verification statistics' 
    });
  }
};

module.exports = {
  getVerificationStats,
  forceUpdateStats
};
