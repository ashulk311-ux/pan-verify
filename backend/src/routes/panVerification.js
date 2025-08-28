const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

// Sandbox API credentials
const SANDBOX_API_KEY = 'key_live_4e188ef5754649e5aceaff5733a62c30';
const SANDBOX_API_SECRET = 'secret_live_0afc41875f284de5a2e563b5d6d3f3e9';

// Helper function to format date
function formatDateToDDMMYYYY(dateStr) {
  // dateStr expected in "yyyy-mm-dd"
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

// Retry mechanism with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Don't retry on authentication errors (subscription expired, etc.)
      if (error.response?.status === 401) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Enhanced error categorization
function categorizeError(error) {
  if (error.response?.status === 401) {
    return {
      type: 'AUTHENTICATION_ERROR',
      message: 'API authentication failed',
      details: error.response.data,
      retryable: false
    };
  }
  
  if (error.response?.status === 429) {
    return {
      type: 'RATE_LIMIT_ERROR',
      message: 'API rate limit exceeded',
      details: error.response.data,
      retryable: true
    };
  }
  
  if (error.response?.status >= 500) {
    return {
      type: 'SERVER_ERROR',
      message: 'External API server error',
      details: error.response.data,
      retryable: true
    };
  }
  
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return {
      type: 'NETWORK_ERROR',
      message: 'Network connection error',
      details: error.message,
      retryable: true
    };
  }
  
  return {
    type: 'UNKNOWN_ERROR',
    message: 'Unknown error occurred',
    details: error.message,
    retryable: false
  };
}

// PAN verification endpoint
router.post('/verify', [
  body('pan_number').isLength({ min: 10, max: 10 }).withMessage('PAN must be 10 characters'),
  body('name').notEmpty().withMessage('Name is required'),
  body('date_of_birth').isISO8601().withMessage('Valid date of birth is required'),
  body('father_name').optional(),
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { pan_number, name, date_of_birth, father_name } = req.body;

    // 1️⃣ Authenticate with Sandbox API (with retry)
    const authRes = await retryWithBackoff(async () => {
      const response = await fetch("https://api.sandbox.co.in/authenticate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": SANDBOX_API_KEY,
          "x-api-secret": SANDBOX_API_SECRET,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error('Authentication failed');
        error.response = { status: response.status, data: errorData };
        throw error;
      }
      
      return response;
    });

    const authData = await authRes.json();
    console.log("AUTH RESPONSE:", authData);

    const accessToken = authData.access_token || authData.data?.access_token;
    console.log("Access Token:", accessToken);

    const formattedDob = formatDateToDDMMYYYY(date_of_birth);
    console.log("Formatted DOB:", formattedDob);

    // 2️⃣ Verify PAN using access_token (with retry)
    const verifyRes = await retryWithBackoff(async () => {
      const response = await fetch("https://api.sandbox.co.in/kyc/pan/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authorization": accessToken,
          "x-api-key": SANDBOX_API_KEY,
          "x-accept-cache": "true",
        },
        body: JSON.stringify({
          "@entity": "in.co.sandbox.kyc.pan_verification.request",
          pan: pan_number,
          name_as_per_pan: name,
          date_of_birth: formattedDob,
          consent: "Y",
          reason: "KYC verification",
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error('Verification failed');
        error.response = { status: response.status, data: errorData };
        throw error;
      }
      
      return response;
    });

    const verifyData = await verifyRes.json();
    console.log("VERIFY RESPONSE:", verifyData);

    // Process the verification response
    let verificationResult = {
      pan_number,
      name,
      date_of_birth,
      father_name,
      verified_date: new Date(),
      status: 'pending',
      api_response: verifyData
    };

    // Determine status based on API response
    if (verifyRes.ok) {
      if (verifyData.status === 'success' || verifyData.data?.status === 'success') {
        verificationResult.status = 'success';
        verificationResult.verified_data = verifyData.data || verifyData;
      } else if (verifyData.status === 'failed' || verifyData.data?.status === 'failed') {
        verificationResult.status = 'failed';
        verificationResult.error_message = verifyData.message || verifyData.data?.message || 'Verification failed';
      } else {
        verificationResult.status = 'pending';
        verificationResult.error_message = 'Verification in progress';
      }
    } else {
      verificationResult.status = 'failed';
      verificationResult.error_message = verifyData.message || 'API verification failed';
    }

    res.json({
      success: true,
      verification: verificationResult,
      api_response: verifyData
    });

  } catch (error) {
    console.error("Error in PAN verification:", error);
    
    const categorizedError = categorizeError(error);
    
    res.status(error.response?.status || 500).json({
      error: categorizedError.message,
      type: categorizedError.type,
      details: categorizedError.details,
      retryable: categorizedError.retryable
    });
  }
});

// Bulk verification endpoint
router.post('/verify-bulk', async (req, res) => {
  try {
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        error: 'Records array is required'
      });
    }

    const results = [];
    const batchSize = 5; // Process in batches to avoid rate limiting
    const errors = [];

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      // Process batch concurrently
      const batchPromises = batch.map(async (record) => {
        try {
          const { pan_number, name, date_of_birth, father_name } = record;

          // 1️⃣ Authenticate (with retry)
          const authRes = await retryWithBackoff(async () => {
            const response = await fetch("https://api.sandbox.co.in/authenticate", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": SANDBOX_API_KEY,
                "x-api-secret": SANDBOX_API_SECRET,
              },
            });
            
            if (!response.ok) {
              const errorData = await response.json();
              const error = new Error('Authentication failed');
              error.response = { status: response.status, data: errorData };
              throw error;
            }
            
            return response;
          });

          const authData = await authRes.json();
          
          const accessToken = authData.access_token || authData.data?.access_token;
          const formattedDob = formatDateToDDMMYYYY(date_of_birth);

          // 2️⃣ Verify PAN (with retry)
          const verifyRes = await retryWithBackoff(async () => {
            const response = await fetch("https://api.sandbox.co.in/kyc/pan/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "authorization": accessToken,
                "x-api-key": SANDBOX_API_KEY,
                "x-accept-cache": "true",
              },
              body: JSON.stringify({
                "@entity": "in.co.sandbox.kyc.pan_verification.request",
                pan: pan_number,
                name_as_per_pan: name,
                date_of_birth: formattedDob,
                consent: "Y",
                reason: "KYC verification",
              }),
            });
            
            if (!response.ok) {
              const errorData = await response.json();
              const error = new Error('Verification failed');
              error.response = { status: response.status, data: errorData };
              throw error;
            }
            
            return response;
          });

          const verifyData = await verifyRes.json();

          let status = 'pending';
          let error_message = null;

          if (verifyRes.ok) {
            if (verifyData.status === 'success' || verifyData.data?.status === 'success') {
              status = 'success';
            } else if (verifyData.status === 'failed' || verifyData.data?.status === 'failed') {
              status = 'failed';
              error_message = verifyData.message || verifyData.data?.message || 'Verification failed';
            } else {
              status = 'pending';
              error_message = 'Verification in progress';
            }
          } else {
            status = 'failed';
            error_message = verifyData.message || 'API verification failed';
          }

          return {
            ...record,
            status,
            error_message,
            verified_date: new Date(),
            api_response: verifyData
          };

        } catch (error) {
          const categorizedError = categorizeError(error);
          errors.push({
            pan_number: record.pan_number,
            error: categorizedError
          });
          
          return {
            ...record,
            status: 'failed',
            error_message: categorizedError.message,
            error_type: categorizedError.type,
            verified_date: new Date()
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < records.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    res.json({
      success: true,
      total_records: records.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error("Error in bulk PAN verification:", error);
    
    const categorizedError = categorizeError(error);
    
    res.status(error.response?.status || 500).json({
      error: categorizedError.message,
      type: categorizedError.type,
      details: categorizedError.details,
      retryable: categorizedError.retryable
    });
  }
});

module.exports = router;
