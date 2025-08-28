const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Connect to MongoDB
const connectDB = require('./config/database');

const authRoutes = require('./routes/auth');
const panRoutes = require('./routes/pan');
const aadhaarRoutes = require('./routes/aadhaar');
const adminRoutes = require('./routes/admin');
const fileRoutes = require('./routes/files');
const statsRoutes = require('./routes/stats');
const apiCallRoutes = require('./routes/apiCalls');
const panVerificationRoutes = require('./routes/panVerification');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Logging
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/pan', panRoutes);
app.use('/api/aadhaar', aadhaarRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/api-calls', apiCallRoutes);
app.use('/api/pan-verification', panVerificationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'PAN KYC API is running' });
});

// Debug endpoint to test file listing
app.get('/api/debug/files', async (req, res) => {
  try {
    const UploadedFile = require('./models/UploadedFile');
    const AadhaarPanLinking = require('./models/AadhaarPanLinking');
    const PanRecord = require('./models/PanRecord');
    
    const allFiles = await UploadedFile.find({}).sort({ createdAt: -1 }).limit(10);
    const aadhaarRecords = await AadhaarPanLinking.find({}).sort({ createdAt: -1 }).limit(10);
    const panRecords = await PanRecord.find({}).sort({ createdAt: -1 }).limit(10);
    
    res.json({
      allFiles: allFiles.map(f => ({ id: f._id, name: f.originalName, userId: f.user_id, status: f.status, totalRecords: f.totalRecords })),
      aadhaarRecords: aadhaarRecords.map(r => ({ id: r._id, fileId: r.file_id, userId: r.user_id, status: r.status })),
      panRecords: panRecords.map(r => ({ id: r._id, fileId: r.file_id, userId: r.user_id, status: r.verificationStatus, panNumber: r.panNumber })),
      counts: {
        totalFiles: await UploadedFile.countDocuments({}),
        totalAadhaarRecords: await AadhaarPanLinking.countDocuments({}),
        totalPanRecords: await PanRecord.countDocuments({})
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check specific file records
app.get('/api/debug/file/:fileId/records', async (req, res) => {
  try {
    const { fileId } = req.params;
    const PanRecord = require('./models/PanRecord');
    const PanVerification = require('./models/PanVerification');
    const UploadedFile = require('./models/UploadedFile');
    
    const file = await UploadedFile.findById(fileId);
    const panRecords = await PanRecord.find({ file_id: fileId });
    const panVerifications = await PanVerification.find({ file_name: file?.filename });
    
    res.json({
      file: file ? { id: file._id, name: file.originalName, status: file.status, totalRecords: file.totalRecords, filename: file.filename } : null,
      panRecords: panRecords.map(r => ({ id: r._id, panNumber: r.panNumber, status: r.verificationStatus })),
      panVerifications: panVerifications.map(r => ({ id: r._id, panNumber: r.pan_number, status: r.status })),
      recordCounts: {
        panRecords: panRecords.length,
        panVerifications: panVerifications.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fix existing Aadhaar records by linking them to files
app.get('/api/debug/fix-aadhaar-records', async (req, res) => {
  try {
    const UploadedFile = require('./models/UploadedFile');
    const AadhaarPanLinking = require('./models/AadhaarPanLinking');
    
    // Get the most recent file for each user
    const files = await UploadedFile.find({}).sort({ createdAt: -1 });
    const users = [...new Set(files.map(f => f.user_id.toString()))];
    
    let fixedCount = 0;
    
    for (const userId of users) {
      const userFiles = files.filter(f => f.user_id.toString() === userId);
      if (userFiles.length > 0) {
        const mostRecentFile = userFiles[0];
        
        // Update all Aadhaar records for this user that don't have a file_id
        const result = await AadhaarPanLinking.updateMany(
          { user_id: userId, file_id: { $exists: false } },
          { file_id: mostRecentFile._id }
        );
        
        fixedCount += result.modifiedCount;
      }
    }
    
    res.json({
      message: `Fixed ${fixedCount} Aadhaar records`,
      usersProcessed: users.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to show all Aadhaar files regardless of user
app.get('/api/debug/all-aadhaar-files', async (req, res) => {
  try {
    const UploadedFile = require('./models/UploadedFile');
    const AadhaarPanLinking = require('./models/AadhaarPanLinking');
    
    // Get all files that have Aadhaar-PAN linking records
    const aadhaarFileIds = await AadhaarPanLinking.distinct('file_id');
    console.log('🔗 All Aadhaar file IDs:', aadhaarFileIds);
    
    const aadhaarFiles = await UploadedFile.find({ 
      _id: { $in: aadhaarFileIds } 
    }).sort({ createdAt: -1 });
    
    console.log('📁 Found Aadhaar files:', aadhaarFiles.length);
    
    res.json({
      files: aadhaarFiles.map(file => ({
        id: file._id,
        originalName: file.originalName,
        userId: file.user_id,
        status: file.status,
        totalRecords: file.totalRecords
      })),
      totalFiles: aadhaarFiles.length,
      aadhaarFileIds: aadhaarFileIds
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ SSE test endpoint
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx etc.)

  res.flushHeaders();

  let counter = 0;
  const interval = setInterval(() => {
    counter++;
    res.write(`data: ${JSON.stringify({ time: new Date(), counter })}\n\n`);
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`PAN KYC API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
