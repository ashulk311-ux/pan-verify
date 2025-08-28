const XLSX = require('xlsx');
const { validationResult } = require('express-validator');
const PanVerification = require('../models/PanVerification');
const UploadedFile = require('../models/UploadedFile');
const panService = require('../services/panService');
const VerificationStatsService = require('../services/verificationStatsService');

const uploadBulkPan = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing file:', req.file.originalname, 'at path:', req.file.path);
    
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
    
    // Define possible column name variations
    const columnMappings = {
      pan_number: ['pan_number', 'PAN Number', 'PAN No', 'PAN', 'pan'],
      name: ['name', 'Name', 'NAME', 'full_name', 'Full Name'],
      father_name: ['father_name', 'Father Name', 'fatherName', 'FATHER_NAME'],
      date_of_birth: ['date_of_birth', 'Date of Birth', 'DOB', 'dob', 'birth_date']
    };
    
    // Special handling for Aadhaar-PAN linking format
    // If we detect Aadhaar-PAN linking columns, we can still process it for PAN KYC
    const isAadhaarPanFormat = columns.includes('AADHAAR') && columns.includes('PAN No');
    if (isAadhaarPanFormat) {
      console.log('Detected Aadhaar-PAN linking format, adapting for PAN KYC');
      // For Aadhaar-PAN linking format, father_name will be set to "Not Available"
    }
    
    // Map detected columns to standard names
    const columnMap = {};
    for (const [standardName, variations] of Object.entries(columnMappings)) {
      const foundColumn = variations.find(variant => columns.includes(variant));
      if (foundColumn) {
        columnMap[standardName] = foundColumn;
      }
    }
    
    // Check if all required columns are found
    const requiredColumns = ['pan_number', 'name', 'date_of_birth']; // father_name is optional for Aadhaar-PAN format
    const missingColumns = requiredColumns.filter(col => !columnMap[col]);
    
    if (missingColumns.length > 0) {
      return res.status(400).json({ 
        error: `Missing required columns: ${missingColumns.join(', ')}. Detected columns: ${columns.join(', ')}. Please use PAN KYC format with columns: pan_number/pan_number/PAN Number, name/Name, father_name/father_name/Father Name (optional), date_of_birth/date_of_birth/Date of Birth/DOB` 
      });
    }
    
    console.log('Column mapping:', columnMap);

    const results = [];
    const errors = [];
    const verificationData = [];

    // First pass: validate and collect data
    const validRows = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // Excel rows start from 1, and we have header

      try {
        // Extract values using column mapping
        const panNumber = row[columnMap.pan_number];
        const name = row[columnMap.name];
        const fatherName = columnMap.father_name ? row[columnMap.father_name] : 'Not Available';
        const dateOfBirth = row[columnMap.date_of_birth];
        
        // Validate required fields
        if (!panNumber || !name || !dateOfBirth) {
          errors.push({
            row: rowNumber,
            pan_number: panNumber || 'N/A',
            error: 'Missing required fields: PAN number, name, or date of birth'
          });
          continue;
        }
        
        // Validate PAN format
        if (!panService.validatePanFormat(panNumber)) {
          errors.push({
            row: rowNumber,
            pan_number: panNumber,
            error: 'Invalid PAN format'
          });
          continue;
        }
        
        // Validate date format
        const dateObj = new Date(dateOfBirth);
        if (isNaN(dateObj.getTime())) {
          errors.push({
            row: rowNumber,
            pan_number: panNumber,
            error: 'Invalid date format for date of birth'
          });
          continue;
        }

        validRows.push({
          rowNumber,
          panNumber: panNumber.toUpperCase(),
          name,
          fatherName,
          dateOfBirth: dateObj
        });

      } catch (error) {
        errors.push({
          row: rowNumber,
          pan_number: row[columnMap.pan_number] || 'N/A',
          error: error.message
        });
      }
    }

    // Batch check for existing verifications
    const panNumbers = validRows.map(row => row.panNumber);
    const existingVerifications = await PanVerification.find({
      pan_number: { $in: panNumbers },
      user_id: req.user.id
    });
    const existingPanMap = new Map(existingVerifications.map(v => [v.pan_number, v]));

    // Process valid rows
    for (const row of validRows) {
      const existingVerification = existingPanMap.get(row.panNumber);

      if (existingVerification) {
        // Already verified
        results.push({
          row: row.rowNumber,
          pan_number: row.panNumber,
          verification_id: existingVerification._id,
          status: 'already_verified',
          existing_status: existingVerification.status,
          existing_verification_data: existingVerification.verification_data,
          name: row.name,
          father_name: row.fatherName,
          date_of_birth: row.dateOfBirth
        });
             } else {
         // New verification to create
         verificationData.push({
           user_id: req.user.id,
           pan_number: row.panNumber,
           name: row.name,
           father_name: row.fatherName,
           date_of_birth: row.dateOfBirth,
           file_name: req.file.filename
         });
       }
     }

     // Batch create new verifications
     if (verificationData.length > 0) {
       const createdVerifications = await PanVerification.insertMany(verificationData);
      
      createdVerifications.forEach((verification, index) => {
        const originalRow = validRows.find(row => 
          row.panNumber === verification.pan_number && 
          row.name === verification.name
        );
        
        if (originalRow) {
          results.push({
            row: originalRow.rowNumber,
            pan_number: verification.pan_number,
            verification_id: verification._id,
            status: 'created',
            name: verification.name,
            father_name: verification.father_name,
            date_of_birth: verification.date_of_birth
          });
        }
      });
    }

    // Start background verification process asynchronously
    if (results.length > 0) {
      // Process verifications in background without blocking the response
      setImmediate(async () => {
        try {
          console.log(`Starting background verification for ${results.length} records`);
          
          // Process verifications in batches to avoid overwhelming the system
          const batchSize = 5;
          for (let i = 0; i < results.length; i += batchSize) {
            const batch = results.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (result) => {
              try {
                const verification = await PanVerification.findById(result.verification_id);
                if (verification) {
                  await panService.verifyPan(verification);
                }
              } catch (error) {
                console.error(`Error processing verification ${result.verification_id}:`, error);
              }
            }));
            
            // Small delay between batches to prevent overwhelming external APIs
            if (i + batchSize < results.length) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          
          // Update verification stats after background processing
          try {
            await VerificationStatsService.forceUpdateStats(req.user.id);
            console.log('Background verification completed and stats updated');
          } catch (error) {
            console.error('Error updating stats after background verification:', error);
          }
        } catch (error) {
          console.error('Background verification error:', error);
        }
      });
    }

    // Count different types of results
    const newVerifications = results.filter(r => r.status === 'created');
    const alreadyVerified = results.filter(r => r.status === 'already_verified');
    
    // Create UploadedFile record to track this upload
    const uploadedFile = await UploadedFile.create({
      user_id: req.user.id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      status: 'completed',
      totalRecords: data.length,
      verifiedRecords: alreadyVerified.length,
      failedRecords: errors.length,
      pendingRecords: newVerifications.length
    });
    
    res.json({
      message: 'File processed successfully',
      total_rows: data.length,
      successful: newVerifications.length,
      already_verified: alreadyVerified.length,
      failed: errors.length,
      results,
      errors,
      file: {
        id: uploadedFile._id,
        filename: uploadedFile.filename,
        originalName: uploadedFile.originalName,
        fileSize: uploadedFile.fileSize,
        fileType: uploadedFile.fileType,
        uploadDate: uploadedFile.uploadDate,
        status: uploadedFile.status,
        totalRecords: uploadedFile.totalRecords,
        verifiedRecords: uploadedFile.verifiedRecords,
        failedRecords: uploadedFile.failedRecords,
        pendingRecords: uploadedFile.pendingRecords
      }
    });

  } catch (error) {
    console.error('Upload bulk PAN error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    // Clean up uploaded file
    if (req.file && req.file.path) {
      try {
        const fs = require('fs');
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

const verifySinglePan = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { pan_number, name, father_name, date_of_birth } = req.body;

    // Validate PAN format
    if (!panService.validatePanFormat(pan_number)) {
      return res.status(400).json({ error: 'Invalid PAN format' });
    }

    // Check if PAN already exists for this user
    const existingVerification = await PanVerification.findOne({
      pan_number: pan_number.toUpperCase(),
      user_id: req.user.id
    });

    if (existingVerification) {
      return res.status(400).json({ 
        error: 'PAN already verified by this user',
        verification: existingVerification
      });
    }

    // Create verification record
    const verification = await PanVerification.create({
      user_id: req.user.id,
      pan_number: pan_number.toUpperCase(),
      name,
      father_name,
      date_of_birth
    });

    // Start verification process
    const verificationResult = await panService.verifyPan(verification);

    // Update verification stats after single verification
    try {
      await VerificationStatsService.forceUpdateStats(req.user.id);
    } catch (error) {
      console.error('Error updating stats after single verification:', error);
    }

    res.json({
      message: 'PAN verification initiated',
      verification: verificationResult
    });

  } catch (error) {
    console.error('Verify single PAN error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const getVerifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const skip = (page - 1) * limit;

    const filters = { user_id: req.user.id };
    if (status) filters.status = status;

    const [verifications, total] = await Promise.all([
      PanVerification.find(filters)
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
    console.error('Get verifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getVerificationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const verification = await PanVerification.findById(id);
    
    if (!verification) {
      return res.status(404).json({ error: 'Verification not found' });
    }

    // Check if user owns this verification or is admin
    if (verification.user_id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ verification });
  } catch (error) {
    console.error('Get verification by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const verifyMultiplePan = async (req, res) => {
  try {
    const { recordIds } = req.body;

    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: 'Please provide valid record IDs' });
    }

    // Import PanRecord model
    const PanRecord = require('../models/PanRecord');

    // Get the PAN records from the uploaded file
    const panRecords = await PanRecord.find({
      _id: { $in: recordIds },
      user_id: req.user.id
    });

    if (panRecords.length === 0) {
      return res.status(404).json({ error: 'No valid records found' });
    }

    const results = [];

    // Process each PAN record
    for (const panRecord of panRecords) {
      try {
        // Check if verification already exists for this PAN
        let verification = await PanVerification.findOne({
          pan_number: panRecord.panNumber,
          user_id: req.user.id
        });

        // If no verification exists, create one
        if (!verification) {
          verification = await PanVerification.create({
            user_id: req.user.id,
            pan_number: panRecord.panNumber,
            name: panRecord.name,
            father_name: panRecord.fatherName,
            date_of_birth: panRecord.dateOfBirth,
            file_name: panRecord.file_id ? 'bulk_upload' : 'single_verification'
          });
        }

        // Skip if already verified or processing
        if (verification.status === 'verified' || verification.status === 'processing') {
          results.push({
            id: panRecord._id,
            pan_number: panRecord.panNumber,
            status: verification.status,
            message: 'Already processed'
          });
          continue;
        }

        // Call the Sandbox API to verify
        const verificationResult = await panService.verifyPan(verification);

        results.push({
          id: panRecord._id,
          pan_number: panRecord.panNumber,
          status: verificationResult.status,
          data: verificationResult.data || verificationResult.error
        });

      } catch (error) {
        console.error(`Error verifying PAN ${panRecord.panNumber}:`, error);
        results.push({
          id: panRecord._id,
          pan_number: panRecord.panNumber,
          status: 'failed',
          error: error.message
        });
      }
    }

    // Update verification stats after multiple verifications
    try {
      await VerificationStatsService.forceUpdateStats(req.user.id);
    } catch (error) {
      console.error('Error updating stats after multiple verifications:', error);
    }

    res.json({
      message: `Verification completed for ${results.length} records`,
      results
    });

  } catch (error) {
    console.error('Verify multiple PAN error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get PAN verification records from a specific file
const getFileRecords = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;
    const { status, page = 1, limit = 50 } = req.query;

    // Validate fileId
    if (!fileId || fileId === 'undefined') {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID format' });
    }

    // First, get the uploaded file to get the filename
    const uploadedFile = await UploadedFile.findOne({
      _id: fileId,
      user_id: userId
    });

    if (!uploadedFile) {
      return res.status(404).json({ error: 'File not found' });
    }

    const query = {
      user_id: userId,
      file_name: uploadedFile.originalName
    };

    // Validate status parameter
    const validStatuses = ['pending', 'processing', 'verified', 'failed'];
    if (status && status !== 'all') {
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: 'Invalid status value', 
          validStatuses: validStatuses,
          receivedStatus: status 
        });
      }
      query.status = status;
    }

    const skip = (page - 1) * limit;
    
    const records = await PanVerification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PanVerification.countDocuments(query);

    // Convert to the format expected by the frontend
    const formattedRecords = records.map(record => ({
      _id: record._id,
      pan_number: record.pan_number,
      name: record.name,
      father_name: record.father_name,
      date_of_birth: record.date_of_birth,
      status: record.status,
      created_at: record.createdAt,
      updated_at: record.updatedAt
    }));

    res.json({
      records: formattedRecords,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get PAN file records error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  uploadBulkPan,
  verifySinglePan,
  verifyMultiplePan,
  getVerifications,
  getVerificationById,
  getFileRecords
};
