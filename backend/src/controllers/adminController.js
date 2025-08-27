const { validationResult } = require('express-validator');
const User = require('../models/User');
const PanVerification = require('../models/PanVerification');

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });
    
    // Map users to include verification stats
    const usersWithStats = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      // Verification statistics
      total_verifications: user.total_verifications || 0,
      total_verified: user.total_verified || 0,
      total_failed: user.total_failed || 0,
      total_pending: user.total_pending || 0,
      total_processing: user.total_processing || 0,
      // PAN KYC stats
      pan_kyc_total: user.pan_kyc_total || 0,
      pan_kyc_verified: user.pan_kyc_verified || 0,
      pan_kyc_failed: user.pan_kyc_failed || 0,
      pan_kyc_pending: user.pan_kyc_pending || 0,
      pan_kyc_processing: user.pan_kyc_processing || 0,
      // Aadhaar-PAN linking stats
      aadhaar_pan_total: user.aadhaar_pan_total || 0,
      aadhaar_pan_verified: user.aadhaar_pan_verified || 0,
      aadhaar_pan_failed: user.aadhaar_pan_failed || 0,
      aadhaar_pan_pending: user.aadhaar_pan_pending || 0,
      aadhaar_pan_processing: user.aadhaar_pan_processing || 0,
      last_stats_update: user.last_stats_update,
      // API call statistics
      api_calls_total: user.api_calls_total || 0,
      api_calls_sandbox: user.api_calls_sandbox || 0,
      api_calls_last_updated: user.api_calls_last_updated
    }));
    
    res.json({ users: usersWithStats });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, role = 'user', company_name = '', company_logo_url = '' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user
    const user = await User.create({ email, password, name, role, company_name, company_logo_url });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        created_at: user.createdAt
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, role, is_active, company_name, company_logo_url } = req.body;

    // Check if user exists and update
    const user = await User.findByIdAndUpdate(
      id, 
      { name, role, is_active, company_name, company_logo_url },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting own account
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete user
    await User.findByIdAndDelete(id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getAllVerifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const user_id = req.query.user_id;
    const skip = (page - 1) * limit;

    const filters = {};
    if (status) filters.status = status;
    if (user_id) filters.user_id = user_id;

    const [verifications, total] = await Promise.all([
      PanVerification.find(filters)
        .populate('user_id', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PanVerification.countDocuments(filters)
    ]);

    res.json({
      verifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get all verifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    // Get verification stats from User collection (aggregated)
    const userStats = await User.aggregate([
      {
        $group: {
          _id: null,
          total_verifications: { $sum: '$total_verifications' },
          total_verified: { $sum: '$total_verified' },
          total_failed: { $sum: '$total_failed' },
          total_pending: { $sum: '$total_pending' },
          total_processing: { $sum: '$total_processing' },
          pan_kyc_total: { $sum: '$pan_kyc_total' },
          pan_kyc_verified: { $sum: '$pan_kyc_verified' },
          pan_kyc_failed: { $sum: '$pan_kyc_failed' },
          pan_kyc_pending: { $sum: '$pan_kyc_pending' },
          pan_kyc_processing: { $sum: '$pan_kyc_processing' },
          aadhaar_pan_total: { $sum: '$aadhaar_pan_total' },
          aadhaar_pan_verified: { $sum: '$aadhaar_pan_verified' },
          aadhaar_pan_failed: { $sum: '$aadhaar_pan_failed' },
          aadhaar_pan_pending: { $sum: '$aadhaar_pan_pending' },
          aadhaar_pan_processing: { $sum: '$aadhaar_pan_processing' }
        }
      }
    ]);

    const stats = userStats[0] || {
      total_verifications: 0,
      total_verified: 0,
      total_failed: 0,
      total_pending: 0,
      total_processing: 0,
      pan_kyc_total: 0,
      pan_kyc_verified: 0,
      pan_kyc_failed: 0,
      pan_kyc_pending: 0,
      pan_kyc_processing: 0,
      aadhaar_pan_total: 0,
      aadhaar_pan_verified: 0,
      aadhaar_pan_failed: 0,
      aadhaar_pan_pending: 0,
      aadhaar_pan_processing: 0
    };
    
    // Get recent verifications
    const recentVerifications = await PanVerification.find()
      .populate('user_id', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get user count and top users by verification count
    const [totalUsers, topUsers] = await Promise.all([
      User.countDocuments(),
      User.find()
        .select('name email total_verifications total_verified total_failed')
        .sort({ total_verifications: -1 })
        .limit(5)
    ]);
    
    res.json({
      stats,
      recent_verifications: recentVerifications,
      total_users: totalUsers,
      top_users: topUsers
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getAllVerifications,
  getDashboardStats
};
