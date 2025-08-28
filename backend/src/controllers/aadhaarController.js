const XLSX = require('xlsx');
const { validationResult } = require('express-validator');
const AadhaarPanLinking = require('../models/AadhaarPanLinking');
const UploadedFile = require('../models/UploadedFile');
const fs = require('fs');

const uploadAadhaarFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing Aadhaar file:', req.file.originalname, 'at path:', req.file.path);
    
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'No data found in the file' });
    }

    // Detect and map column names flexibly
    const firstRow = data[0];
    const columns = Object.keys(firstRow);
    
    console.log('Detected columns:', columns);
    
    // Define possible column name variations for Aadhaar-PAN linking
    const columnMappings = {
      aadhaar_number: ['aadhaar_number', 'AADHAAR', 'Aadhaar Number', 'aadhaar', 'AADHAAR_NUMBER'],
      pan_number: ['pan_number', 'PAN No', 'PAN Number', 'PAN', 'pan', 'PAN_NO'],
      name: ['name', 'Name', 'NAME', 'full_name', 'Full Name'],
      father_name: ['father_name', 'Father Name', 'fatherName', 'FATHER_NAME']
    };
    
    // Map detected columns to standard names
    const columnMap = {};
    for (const [standardName, variations] of Object.entries(columnMappings)) {
      const foundColumn = variations.find(variant => columns.includes(variant));
      if (foundColumn) {
        columnMap[standardName] = foundColumn;
      }
    }
    
    // Check if required columns are found
    const requiredColumns = ['aadhaar_number', 'pan_number'];
    const missingColumns = requiredColumns.filter(col => !columnMap[col]);
    
    if (missingColumns.length > 0) {
      return res.status(400).json({ 
        error: `Missing required columns: ${missingColumns.join(', ')}. Detected columns: ${columns.join(', ')}. Please use Aadhaar-PAN linking format with columns: aadhaar_number/AADHAAR, pan_number/PAN No` 
      });
    }
    
    console.log('Column mapping:', columnMap);

    // Create file record
    const uploadedFile = await UploadedFile.create({
      user_id: req.user.id,
      original_name: req.file.originalname,
      file_name: req.file.filename,
      file_size: req.file.size,
      file_type: req.file.mimetype,
      total_records: data.length,
      status: 'uploaded'
    });

    const results = [];
    const errors = [];

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // Excel rows start from 1, and we have header

      try {
        // Extract values using column mapping
        const aadhaarNumber = row[columnMap.aadhaar_number];
        const panNumber = row[columnMap.pan_number];
        const name = columnMap.name ? row[columnMap.name] : 'Not Available';
        const fatherName = columnMap.father_name ? row[columnMap.father_name] : 'Not Available';
        
        // Validate Aadhaar format (12 digits)
        if (!aadhaarNumber || !/^\d{12}$/.test(aadhaarNumber.toString())) {
          errors.push({
            row: rowNumber,
            aadhaar_number: aadhaarNumber,
            pan_number: panNumber,
            error: 'Invalid Aadhaar format (must be 12 digits)'
          });
          continue;
        }

        // Validate PAN format
        if (!panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.toString().toUpperCase())) {
          errors.push({
            row: rowNumber,
            aadhaar_number: aadhaarNumber,
            pan_number: panNumber,
            error: 'Invalid PAN format'
          });
          continue;
        }

        // Check if record already exists
        const existingRecord = await AadhaarPanLinking.findOne({
          aadhaar_number: aadhaarNumber,
          pan_number: panNumber.toUpperCase(),
          user_id: req.user.id
        });

        if (existingRecord) {
          errors.push({
            row: rowNumber,
            aadhaar_number: aadhaarNumber,
            pan_number: panNumber,
            error: 'Aadhaar-PAN combination already exists'
          });
          continue;
        }

        // Create Aadhaar-PAN linking record
        const aadhaarRecord = await AadhaarPanLinking.create({
          user_id: req.user.id,
          file_id: uploadedFile._id,
          aadhaar_number: aadhaarNumber,
          pan_number: panNumber.toUpperCase(),
          name: name,
          father_name: fatherName,
          status: 'pending'
        });

        results.push({
          row: rowNumber,
          aadhaar_number: aadhaarNumber,
          pan_number: panNumber,
          record_id: aadhaarRecord._id,
          status: 'created'
        });

      } catch (error) {
        errors.push({
          row: rowNumber,
          aadhaar_number: row[columnMap.aadhaar_number] || 'N/A',
          pan_number: row[columnMap.pan_number] || 'N/A',
          error: error.message
        });
      }
    }

    // Update file with final stats
    await UploadedFile.findByIdAndUpdate(uploadedFile._id, {
      total_records: data.length,
      processed_records: results.length,
      failed_records: errors.length,
      status: 'completed'
    });

    res.json({
      message: 'File processed successfully',
      file: {
        id: uploadedFile._id,
        originalName: uploadedFile.original_name,
        totalRecords: data.length,
        status: 'completed'
      },
      total_rows: data.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    });

  } catch (error) {
    console.error('Upload Aadhaar file error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  } finally {
    // Clean up uploaded file
    if (req.file && req.file.path) {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log('Cleaned up file:', req.file.path);
        }
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }
  }
};

const getUserFiles = async (req, res) => {
  try {
    const files = await UploadedFile.find({ user_id: req.user.id })
      .sort({ created_at: -1 });
    
    res.json({ files });
  } catch (error) {
    console.error('Get user files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getFileRecords = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { status = 'all' } = req.query;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    let query = { file_id: fileId, user_id: req.user.id };
    if (status !== 'all') {
      query.status = status;
    }

    const records = await AadhaarPanLinking.find(query)
      .sort({ created_at: -1 });

    res.json({ records });
  } catch (error) {
    console.error('Get file records error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getFileStats = async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    const stats = await AadhaarPanLinking.aggregate([
      { $match: { file_id: fileId, user_id: req.user.id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statsObj = {
      total: 0,
      pending: 0,
      verified: 0,
      failed: 0
    };

    stats.forEach(stat => {
      statsObj[stat._id] = stat.count;
      statsObj.total += stat.count;
    });

    res.json(statsObj);
  } catch (error) {
    console.error('Get file stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    // Delete all records associated with this file
    await AadhaarPanLinking.deleteMany({ file_id: fileId, user_id: req.user.id });
    
    // Delete the file record
    await UploadedFile.findByIdAndDelete(fileId);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const checkSingleStatus = async (req, res) => {
  try {
    const { aadhaar_number, pan_number } = req.body;

    if (!aadhaar_number && !pan_number) {
      return res.status(400).json({ error: 'Provide either Aadhaar number or PAN number' });
    }

    let query = { user_id: req.user.id };
    if (aadhaar_number) {
      query.aadhaar_number = aadhaar_number;
    }
    if (pan_number) {
      query.pan_number = pan_number.toUpperCase();
    }

    const record = await AadhaarPanLinking.findOne(query);

    if (!record) {
      return res.json({
        message: 'No Aadhaar-PAN linking record found',
        found: false
      });
    }

    res.json({
      message: 'Aadhaar-PAN linking record found',
      found: true,
      record: {
        aadhaar_number: record.aadhaar_number,
        pan_number: record.pan_number,
        name: record.name,
        father_name: record.father_name,
        status: record.status,
        created_at: record.created_at
      }
    });

  } catch (error) {
    console.error('Check single status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const retryVerification = async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    // Find failed records for this file
    const failedRecords = await AadhaarPanLinking.find({
      file_id: fileId,
      user_id: req.user.id,
      status: 'failed'
    });

    if (failedRecords.length === 0) {
      return res.json({ message: 'No failed records to retry' });
    }

    // Update status to pending for retry
    await AadhaarPanLinking.updateMany(
      { _id: { $in: failedRecords.map(r => r._id) } },
      { status: 'pending' }
    );

    res.json({
      message: `${failedRecords.length} records queued for retry`,
      retried_count: failedRecords.length
    });

  } catch (error) {
    console.error('Retry verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  uploadAadhaarFile,
  getUserFiles,
  getFileRecords,
  getFileStats,
  deleteFile,
  checkSingleStatus,
  retryVerification
};
