const XLSX = require('xlsx');
const { validationResult } = require('express-validator');
const PanVerification = require('../models/PanVerification');
const panService = require('../services/panService');
const VerificationStatsService = require('../services/verificationStatsService');

const uploadBulkPan = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'No data found in the file' });
    }

    // Validate required columns
    const requiredColumns = ['pan_number', 'name', 'father_name', 'date_of_birth'];
    const firstRow = data[0];
    
    for (const column of requiredColumns) {
      if (!(column in firstRow)) {
        return res.status(400).json({ 
          error: `Missing required column: ${column}` 
        });
      }
    }

    const results = [];
    const errors = [];

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // Excel rows start from 1, and we have header

      try {
        // Validate PAN format
        if (!panService.validatePanFormat(row.pan_number)) {
          errors.push({
            row: rowNumber,
            pan_number: row.pan_number,
            error: 'Invalid PAN format'
          });
          continue;
        }

        // Check if PAN already exists for this user
        const existingVerification = await PanVerification.findOne({
          pan_number: row.pan_number.toUpperCase(),
          user_id: req.user.id
        });

        if (existingVerification) {
          errors.push({
            row: rowNumber,
            pan_number: row.pan_number,
            error: 'PAN already verified by this user'
          });
          continue;
        }

        // Create verification record
        const verification = await PanVerification.create({
          user_id: req.user.id,
          pan_number: row.pan_number.toUpperCase(),
          name: row.name,
          father_name: row.father_name,
          date_of_birth: row.date_of_birth,
          file_name: req.file.filename
        });

        results.push({
          row: rowNumber,
          pan_number: row.pan_number,
          verification_id: verification._id,
          status: 'created'
        });

      } catch (error) {
        errors.push({
          row: rowNumber,
          pan_number: row.pan_number || 'N/A',
          error: error.message
        });
      }
    }

    // Start background verification process
    if (results.length > 0) {
      // Process verifications individually for now
      for (const result of results) {
        try {
          const verification = await PanVerification.findById(result.verification_id);
          if (verification) {
            await panService.verifyPan(verification);
          }
        } catch (error) {
          console.error(`Error processing verification ${result.verification_id}:`, error);
        }
      }
    }

    // Update verification stats after bulk upload
    if (results.length > 0) {
      try {
        await VerificationStatsService.forceUpdateStats(req.user.id);
      } catch (error) {
        console.error('Error updating stats after bulk upload:', error);
      }
    }

    res.json({
      message: 'File processed successfully',
      total_rows: data.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    });

  } catch (error) {
    console.error('Upload bulk PAN error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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

module.exports = {
  uploadBulkPan,
  verifySinglePan,
  verifyMultiplePan,
  getVerifications,
  getVerificationById
};
