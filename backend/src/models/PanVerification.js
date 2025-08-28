const mongoose = require('mongoose');

const panVerificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pan_number: {
    type: String,
    required: true,
    uppercase: true,
    match: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  father_name: {
    type: String,
    required: false,
    trim: true,
    default: 'Not Available'
  },
  date_of_birth: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'verified', 'failed'],
    default: 'pending'
  },
  verification_data: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  file_name: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Index for better query performance
panVerificationSchema.index({ user_id: 1, created_at: -1 });
panVerificationSchema.index({ status: 1 });
panVerificationSchema.index({ pan_number: 1 });

module.exports = mongoose.model('PanVerification', panVerificationSchema);
