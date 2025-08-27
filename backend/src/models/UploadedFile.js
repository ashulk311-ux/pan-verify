const mongoose = require('mongoose');

const uploadedFileSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['uploaded', 'processing', 'completed', 'failed'],
    default: 'uploaded'
  },
  totalRecords: {
    type: Number,
    default: 0
  },
  verifiedRecords: {
    type: Number,
    default: 0
  },
  failedRecords: {
    type: Number,
    default: 0
  },
  pendingRecords: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UploadedFile', uploadedFileSchema);
