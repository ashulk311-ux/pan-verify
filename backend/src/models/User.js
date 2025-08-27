const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  is_active: {
    type: Boolean,
    default: true
  },
  company_name: {
    type: String,
    trim: true,
    default: ''
  },
  company_logo_url: {
    type: String,
    trim: true,
    default: ''
  },
  // Verification statistics
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
  last_stats_update: {
    type: Date,
    default: Date.now
  },
  // API call tracking
  api_calls_total: {
    type: Number,
    default: 0
  },
  api_calls_sandbox: {
    type: Number,
    default: 0
  },
  api_calls_last_updated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
