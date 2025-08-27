const mongoose = require('mongoose');

const panRecordSchema = new mongoose.Schema({
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
  panNumber: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  fatherName: {
    type: String,
    required: true,
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'processing', 'verified', 'failed'],
    default: 'pending'
  },
  verificationDate: {
    type: Date
  },
  verificationResult: {
    type: mongoose.Schema.Types.Mixed
  },
  errorMessage: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better query performance
panRecordSchema.index({ user_id: 1, file_id: 1 });
panRecordSchema.index({ verificationStatus: 1 });
panRecordSchema.index({ panNumber: 1 });

module.exports = mongoose.model('PanRecord', panRecordSchema);
