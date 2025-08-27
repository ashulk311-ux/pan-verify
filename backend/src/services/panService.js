const axios = require('axios');
const PanVerification = require('../models/PanVerification');
const VerificationStatsService = require('./verificationStatsService');
const ApiCallTracker = require('./apiCallTracker');
const apiConfig = require('../config/api');

class PanService {
  // Validate PAN format (10 characters: 5 letters + 4 numbers + 1 letter)
  static validatePanFormat(pan) {
    if (!pan || typeof pan !== 'string') return false;
    
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan.toUpperCase());
  }

  // Verify PAN using external API
  static async verifyPan(verification) {
    try {
      // Update status to processing
      await PanVerification.findByIdAndUpdate(verification._id, { status: 'processing' });

      // Call external PAN verification API
      const apiResponse = await this.callPanVerificationAPI(verification);

      if (apiResponse.success) {
        // Update with verification data
        await PanVerification.findByIdAndUpdate(
          verification._id, 
          { 
            status: 'verified',
            verification_data: apiResponse.data
          }
        );
        
        // Update verification stats
        try {
          await VerificationStatsService.forceUpdateStats(verification.user_id);
        } catch (error) {
          console.error('Error updating stats after verification:', error);
        }
        
        return {
          id: verification._id,
          status: 'verified',
          data: apiResponse.data
        };
      } else {
        // Update with error data
        await PanVerification.findByIdAndUpdate(
          verification._id, 
          { 
            status: 'failed',
            verification_data: { error: apiResponse.error }
          }
        );
        
        // Update verification stats
        try {
          await VerificationStatsService.forceUpdateStats(verification.user_id);
        } catch (error) {
          console.error('Error updating stats after failed verification:', error);
        }
        
        return {
          id: verification._id,
          status: 'failed',
          error: apiResponse.error
        };
      }
    } catch (error) {
      console.error('PAN verification error:', error);
      
      // Update status to failed
      await PanVerification.findByIdAndUpdate(
        verification._id, 
        { 
          status: 'failed',
          verification_data: { error: error.message }
        }
      );
      
      // Update verification stats
      try {
        await VerificationStatsService.forceUpdateStats(verification.user_id);
      } catch (error) {
        console.error('Error updating stats after error:', error);
      }
      
      return {
        id: verification._id,
        status: 'failed',
        error: error.message
      };
    }
  }

  // Call external PAN verification API
  static async callPanVerificationAPI(verification) {
    try {
      const config = apiConfig.sandbox;
      const apiUrl = `${config.baseUrl}${config.panVerificationEndpoint}`;
      const apiKey = process.env.SANDBOX_API_KEY;

      if (!apiKey) {
        throw new Error('Sandbox API key configuration missing. Please set SANDBOX_API_KEY in your environment variables.');
      }

      console.log('Using API Key:', apiKey.substring(0, 10) + '...');

      // Format date to YYYY-MM-DD for the API
      const formattedDate = verification.date_of_birth instanceof Date 
        ? verification.date_of_birth.toISOString().split('T')[0]
        : new Date(verification.date_of_birth).toISOString().split('T')[0];

      const payload = {
        pan_number: verification.pan_number,
        name: verification.name,
        father_name: verification.father_name,
        date_of_birth: formattedDate
      };

      console.log('Making API request to Sandbox:', {
        url: apiUrl,
        payload: { ...payload, date_of_birth: formattedDate }
      });

      const response = await axios.post(apiUrl, payload, {
        headers: {
          ...config.headers,
          'x-api-key': apiKey
        },
        timeout: config.timeout
      });

      // Track API call attempt (success path)
      await ApiCallTracker.incrementApiCall(verification.user_id, 'sandbox');

      // Handle sandbox.co.in API response format
      console.log('Sandbox API Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data && (response.data.success || response.data.status === 'success')) {
        return {
          success: true,
          data: {
            ...response.data,
            verification_date: new Date(),
            api_provider: 'sandbox.co.in'
          }
        };
      } else {
        return {
          success: false,
          error: response.data?.message || response.data?.error || 'Verification failed'
        };
      }
    } catch (error) {
      console.error('Sandbox API call error:', error);
      
      // Track API call attempt (failure path)
      try {
        await ApiCallTracker.incrementApiCall(verification.user_id, 'sandbox');
      } catch (trackErr) {
        console.error('Error incrementing sandbox API call on failure:', trackErr);
      }
      
      if (error.response) {
        // API returned an error response
        const errorData = error.response.data;
        return {
          success: false,
          error: errorData?.message || errorData?.error || 'API verification failed'
        };
      } else if (error.request) {
        // Request was made but no response received
        return {
          success: false,
          error: 'No response from Sandbox verification API'
        };
      } else {
        // Something else happened
        return {
          success: false,
          error: error.message
        };
      }
    }
  }

  // Process bulk PAN verification from Excel file
  static async processBulkPanVerification(userId, filePath) {
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      const results = [];
      
      for (const row of data) {
        try {
          // Validate required fields
          if (!row.pan_number || !row.name || !row.father_name || !row.date_of_birth) {
            results.push({
              pan_number: row.pan_number || 'N/A',
              status: 'failed',
              error: 'Missing required fields'
            });
            continue;
          }

          // Validate PAN format
          if (!this.validatePanFormat(row.pan_number)) {
            results.push({
              pan_number: row.pan_number,
              status: 'failed',
              error: 'Invalid PAN format'
            });
            continue;
          }

          // Create verification record
          const verification = await PanVerification.create({
            user_id: userId,
            pan_number: row.pan_number.toUpperCase(),
            name: row.name,
            father_name: row.father_name,
            date_of_birth: new Date(row.date_of_birth),
            file_name: filePath.split('/').pop()
          });

          results.push({
            pan_number: row.pan_number,
            status: 'pending',
            id: verification._id
          });

        } catch (error) {
          results.push({
            pan_number: row.pan_number || 'N/A',
            status: 'failed',
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Bulk processing failed: ${error.message}`);
    }
  }
}

module.exports = PanService;
