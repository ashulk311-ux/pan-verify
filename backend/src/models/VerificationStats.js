const mongoose = require('mongoose');

const verificationStatsSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  total_verifications: {
    type: Number,
    default: 0
  },
  total_verified: {
    type: Number,
    default: 0
  },
  total_failed: {
    type: Number,
    default: 0
  },
  total_pending: {
    type: Number,
    default: 0
  },
  total_processing: {
    type: Number,
    default: 0
  },
  // PAN KYC specific stats
  pan_kyc_total: {
    type: Number,
    default: 0
  },
  pan_kyc_verified: {
    type: Number,
    default: 0
  },
  pan_kyc_failed: {
    type: Number,
    default: 0
  },
  pan_kyc_pending: {
    type: Number,
    default: 0
  },
  pan_kyc_processing: {
    type: Number,
    default: 0
  },
  // Aadhaar-PAN linking specific stats
  aadhaar_pan_total: {
    type: Number,
    default: 0
  },
  aadhaar_pan_verified: {
    type: Number,
    default: 0
  },
  aadhaar_pan_failed: {
    type: Number,
    default: 0
  },
  aadhaar_pan_pending: {
    type: Number,
    default: 0
  },
  aadhaar_pan_processing: {
    type: Number,
    default: 0
  },
  last_updated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
verificationStatsSchema.index({ user_id: 1 });
verificationStatsSchema.index({ last_updated: -1 });

module.exports = mongoose.model('VerificationStats', verificationStatsSchema);
