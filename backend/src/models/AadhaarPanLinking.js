const mongoose = require('mongoose');

const aadhaarPanLinkingSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  file_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UploadedFile',
    required: true
  },
  aadhaar_number: {
    type: String,
    required: true,
    trim: true
  },
  pan_number: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
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
  verification_date: {
    type: Date
  },
  verification_result: {
    type: mongoose.Schema.Types.Mixed
  },
  error_message: {
    type: String
  },
  retry_count: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better query performance
aadhaarPanLinkingSchema.index({ user_id: 1 });
aadhaarPanLinkingSchema.index({ file_id: 1 });
aadhaarPanLinkingSchema.index({ status: 1 });
aadhaarPanLinkingSchema.index({ aadhaar_number: 1 });
aadhaarPanLinkingSchema.index({ pan_number: 1 });

module.exports = mongoose.model('AadhaarPanLinking', aadhaarPanLinkingSchema);
