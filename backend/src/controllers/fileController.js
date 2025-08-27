const { validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const UploadedFile = require('../models/UploadedFile');
const PanRecord = require('../models/PanRecord');
const mongoose = require('mongoose');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
    }
  }
});

// Upload file and process PAN data
const uploadFile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.id;
    const file = req.file;

    // Create uploaded file record
    const uploadedFile = await UploadedFile.create({
      user_id: userId,
      filename: file.filename,
      originalName: file.originalname,
      fileSize: file.size,
      fileType: path.extname(file.originalname).toLowerCase(),
      status: 'uploaded'
    });

    // Process the file and extract PAN data
    let panRecords = [];
    try {
      const workbook = xlsx.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);

      // Validate and process each row
      panRecords = data.map((row, index) => {
        // Validate required fields
        if (!row.pan_number || !row.name || !row.father_name || !row.date_of_birth) {
          throw new Error(`Row ${index + 1}: Missing required fields`);
        }

        return {
          user_id: userId,
          file_id: uploadedFile._id,
          panNumber: row.pan_number.toString().trim(),
          name: row.name.toString().trim(),
          fatherName: row.father_name.toString().trim(),
          dateOfBirth: new Date(row.date_of_birth),
          verificationStatus: 'pending'
        };
      });

      // Insert PAN records
      if (panRecords.length > 0) {
        await PanRecord.insertMany(panRecords);
      }

      // Update file status and record counts
      await UploadedFile.findByIdAndUpdate(uploadedFile._id, {
        status: 'completed',
        totalRecords: panRecords.length,
        pendingRecords: panRecords.length
      });

      // Clean up uploaded file
      fs.unlinkSync(file.path);

      res.status(201).json({
        message: 'File uploaded and processed successfully',
        file: {
          id: uploadedFile._id,
          originalName: uploadedFile.originalName,
          totalRecords: panRecords.length,
          status: 'completed'
        }
      });

    } catch (processError) {
      // Update file status to failed
      await UploadedFile.findByIdAndUpdate(uploadedFile._id, {
        status: 'failed'
      });

      // Clean up uploaded file
      try {
        fs.unlinkSync(file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }

      return res.status(400).json({
        error: 'Error processing file',
        details: processError.message
      });
    }

  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get user's uploaded files
const getUserFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const files = await UploadedFile.find({ user_id: userId })
      .sort({ createdAt: -1 });

    res.json({ files });
  } catch (error) {
    console.error('Get user files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get PAN records from a specific file
const getFileRecords = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;
    const { status, page = 1, limit = 50 } = req.query;

    const query = {
      user_id: userId,
      file_id: fileId
    };

    if (status && status !== 'all') {
      query.verificationStatus = status;
    }

    const skip = (page - 1) * limit;
    
    const records = await PanRecord.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PanRecord.countDocuments(query);

    res.json({
      records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get file records error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Retry verification for failed records
const retryVerification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;
    const { recordIds } = req.body;

    if (!recordIds || !Array.isArray(recordIds)) {
      return res.status(400).json({ error: 'Record IDs are required' });
    }

    // Update records to pending status
    const result = await PanRecord.updateMany(
      {
        _id: { $in: recordIds },
        user_id: userId,
        file_id: fileId,
        verificationStatus: 'failed'
      },
      {
        verificationStatus: 'pending',
        retryCount: { $inc: 1 },
        errorMessage: null
      }
    );

    // Update file statistics
    const failedCount = await PanRecord.countDocuments({
      user_id: userId,
      file_id: fileId,
      verificationStatus: 'failed'
    });

    const pendingCount = await PanRecord.countDocuments({
      user_id: userId,
      file_id: fileId,
      verificationStatus: 'pending'
    });

    await UploadedFile.findByIdAndUpdate(fileId, {
      failedRecords: failedCount,
      pendingRecords: pendingCount
    });

    res.json({
      message: `${result.modifiedCount} records queued for retry`,
      retriedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Retry verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get file statistics
const getFileStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;

    const stats = await PanRecord.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          file_id: new mongoose.Types.ObjectId(fileId)
        }
      },
      {
        $group: {
          _id: '$verificationStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const fileStats = {
      pending: 0,
      processing: 0,
      verified: 0,
      failed: 0
    };

    stats.forEach(stat => {
      fileStats[stat._id] = stat.count;
    });

    res.json({ stats: fileStats });
  } catch (error) {
    console.error('Get file stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete an uploaded file and its records
const deleteUserFile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;

    const fileDoc = await UploadedFile.findOne({ _id: fileId, user_id: userId });
    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete associated PAN records
    await PanRecord.deleteMany({ user_id: userId, file_id: fileId });

    // Attempt to remove physical file if it still exists (in case of early failures)
    const diskPath = path.join('uploads', fileDoc.filename);
    try {
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    } catch (e) {
      console.warn('Could not delete file from disk:', e.message);
    }

    // Remove the UploadedFile document
    await UploadedFile.deleteOne({ _id: fileId });

    res.json({ message: 'File and related records deleted successfully' });
  } catch (error) {
    console.error('Delete user file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  upload,
  uploadFile,
  getUserFiles,
  getFileRecords,
  retryVerification,
  getFileStats,
  deleteUserFile
};
