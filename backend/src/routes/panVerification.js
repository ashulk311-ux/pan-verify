const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

// Sandbox API credentials
const SANDBOX_API_KEY = 'key_live_6edea225e1354559b2422d3921c795cf';
const SANDBOX_API_SECRET = 'secret_live_03078556231c41879cd6ab46e1d6a07f';

// Helper function to format date to dd/mm/yyyy (API expected format)
function formatDateToDDMMYY(dateStr) {
  try {
    // Handle ISO date string (e.g., "2003-09-29T18:38:50.000Z")
    if (dateStr.includes('T')) {
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
    
    // Handle "yyyy-mm-dd" format - convert to dd/mm/yyyy
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  } catch (error) {
    console.error('Error formatting date:', error.message, 'Input:', dateStr);
    throw new Error(`Date formatting failed: ${error.message}`);
  }
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
    console.log("🔐 AUTH RESPONSE:", JSON.stringify(authData, null, 2));

    const accessToken = authData.access_token || authData.data?.access_token;
    console.log("🔑 Access Token:", accessToken);

    const formattedDob = formatDateToDDMMYY(date_of_birth);
    console.log("📅 Formatted DOB (dd/mm/yy):", formattedDob);

    // 2️⃣ Verify PAN using access_token (with retry)
    const verifyPayload = {
      "@entity": "in.co.sandbox.kyc.pan_verification.request",
      pan: pan_number,
      name_as_per_pan: name,
      date_of_birth: formattedDob,
      consent: "Y",
      reason: "KYC verification",
    };
    
    console.log("📤 VERIFY PAYLOAD:", JSON.stringify(verifyPayload, null, 2));
    console.log("🌐 API URL: https://api.sandbox.co.in/kyc/pan/verify");
    console.log("🔑 Headers:", {
      "Content-Type": "application/json",
      "authorization": accessToken ? "***" : "MISSING",
      "x-api-key": SANDBOX_API_KEY ? "***" : "MISSING",
      "x-accept-cache": "true",
    });

    const verifyRes = await retryWithBackoff(async () => {
      const response = await fetch("https://api.sandbox.co.in/kyc/pan/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authorization": accessToken,
          "x-api-key": SANDBOX_API_KEY,
          "x-accept-cache": "true",
        },
        body: JSON.stringify(verifyPayload),
      });
      
      console.log("📡 HTTP Status:", response.status, response.statusText);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.log("❌ VERIFY ERROR:", JSON.stringify(errorData, null, 2));
        const error = new Error('Verification failed');
        error.response = { status: response.status, data: errorData };
        throw error;
      }
      
      return response;
    });

    const verifyData = await verifyRes.json();
    console.log("✅ VERIFY RESPONSE:", JSON.stringify(verifyData, null, 2));

    // Extract request ID from response
    const requestId = verifyData.request_id || verifyData.data?.request_id || verifyData.id;
    console.log("🆔 Request ID:", requestId);

    // Process the verification response
    let verificationResult = {
      pan_number,
      name,
      date_of_birth,
      father_name,
      verified_date: new Date(),
      status: 'pending',
      request_id: requestId,
      api_response: verifyData
    };

    // Determine status based on API response
    if (verifyRes.ok) {
      if (verifyData.status === 'success' || verifyData.data?.status === 'success' || verifyData.data?.status === 'valid') {
        verificationResult.status = 'success';
        verificationResult.verified_data = verifyData.data || verifyData;
        console.log(`🎉 FINAL STATUS for PAN ${pan_number}: SUCCESS`);
      } else if (verifyData.status === 'failed' || verifyData.data?.status === 'failed') {
        verificationResult.status = 'failed';
        verificationResult.error_message = verifyData.message || verifyData.data?.message || 'Verification failed';
        console.log(`❌ FINAL STATUS for PAN ${pan_number}: FAILED - ${verificationResult.error_message}`);
      } else {
        verificationResult.status = 'pending';
        verificationResult.error_message = 'Verification in progress';
        console.log(`⏳ FINAL STATUS for PAN ${pan_number}: PENDING - Verification in progress`);
      }
    } else {
      verificationResult.status = 'failed';
      verificationResult.error_message = verifyData.message || 'API verification failed';
      console.log(`💥 FINAL STATUS for PAN ${pan_number}: FAILED - API error`);
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
          console.log(`🔐 BULK AUTH for PAN ${pan_number}:`, JSON.stringify(authData, null, 2));
          
          const accessToken = authData.access_token || authData.data?.access_token;
          const formattedDob = formatDateToDDMMYY(date_of_birth);
          console.log(`📅 BULK Formatted DOB for PAN ${pan_number}:`, formattedDob);

          // 2️⃣ Verify PAN (with retry)
          const verifyPayload = {
            "@entity": "in.co.sandbox.kyc.pan_verification.request",
            pan: pan_number,
            name_as_per_pan: name,
            date_of_birth: formattedDob,
            consent: "Y",
            reason: "KYC verification",
          };
          
          console.log(`📤 BULK VERIFY PAYLOAD for PAN ${pan_number}:`, JSON.stringify(verifyPayload, null, 2));

          const verifyRes = await retryWithBackoff(async () => {
            const response = await fetch("https://api.sandbox.co.in/kyc/pan/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "authorization": accessToken,
                "x-api-key": SANDBOX_API_KEY,
                "x-accept-cache": "true",
              },
              body: JSON.stringify(verifyPayload),
            });
            
            console.log(`📡 BULK HTTP Status for PAN ${pan_number}:`, response.status, response.statusText);
            
            if (!response.ok) {
              const errorData = await response.json();
              console.log(`❌ BULK VERIFY ERROR for PAN ${pan_number}:`, JSON.stringify(errorData, null, 2));
              const error = new Error('Verification failed');
              error.response = { status: response.status, data: errorData };
              throw error;
            }
            
            return response;
          });

          const verifyData = await verifyRes.json();
          console.log(`✅ BULK VERIFY RESPONSE for PAN ${pan_number}:`, JSON.stringify(verifyData, null, 2));

          // Extract request ID from response
          const requestId = verifyData.request_id || verifyData.data?.request_id || verifyData.id;
          console.log(`🆔 BULK Request ID for PAN ${pan_number}:`, requestId);

          let status = 'pending';
          let error_message = null;

          if (verifyRes.ok) {
            // Check if the verification was successful
            if (verifyData.status === 'success' || verifyData.data?.status === 'success' || verifyData.data?.status === 'valid') {
              status = 'success';
              error_message = null;
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
            request_id: requestId,
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

// Check verification status endpoint
router.get('/check-status/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    console.log(`🔍 Checking status for request: ${requestId}`);

    // 1️⃣ Authenticate
    const authRes = await fetch("https://api.sandbox.co.in/authenticate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SANDBOX_API_KEY,
        "x-api-secret": SANDBOX_API_SECRET,
      },
    });

    const authData = await authRes.json();
    const accessToken = authData.access_token || authData.data?.access_token;

    // 2️⃣ Check status using request ID
    const statusRes = await fetch(`https://api.sandbox.co.in/kyc/pan/status/${requestId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "authorization": accessToken,
        "x-api-key": SANDBOX_API_KEY,
      },
    });

    console.log(`📡 STATUS HTTP Status: ${statusRes.status} ${statusRes.statusText}`);

    const statusData = await statusRes.json();
    console.log(`✅ STATUS RESPONSE:`, JSON.stringify(statusData, null, 2));

    res.json({
      success: true,
      request_id: requestId,
      status_response: statusData,
      http_status: statusRes.status
    });

  } catch (error) {
    console.error('❌ STATUS CHECK ERROR:', error);
    res.status(500).json({
      error: 'Status check failed',
      message: error.message
    });
  }
});

// Test endpoint to see raw Sandbox API response
router.get('/test-sandbox', async (req, res) => {
  try {
    console.log('🧪 Testing Sandbox API connection...');
    
    // 1️⃣ Authenticate
    const authRes = await fetch("https://api.sandbox.co.in/authenticate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SANDBOX_API_KEY,
        "x-api-secret": SANDBOX_API_SECRET,
      },
    });

    const authData = await authRes.json();
    console.log('🔐 TEST AUTH RESPONSE:', JSON.stringify(authData, null, 2));

    if (!authRes.ok) {
      return res.status(authRes.status).json({
        error: 'Authentication failed',
        auth_response: authData
      });
    }

    const accessToken = authData.access_token || authData.data?.access_token;
    console.log('🔑 TEST Access Token:', accessToken);

    // 2️⃣ Test verification with sample data
    const testPayload = {
      "@entity": "in.co.sandbox.kyc.pan_verification.request",
      pan: "IXDPK9199A",
      name_as_per_pan: "NEHA KANWAR",
      date_of_birth: "29/09/2003",  // Back to 4-digit year
      consent: "Y",
      reason: "KYC verification test",
    };

    console.log('📤 TEST VERIFY PAYLOAD:', JSON.stringify(testPayload, null, 2));

    const verifyRes = await fetch("https://api.sandbox.co.in/kyc/pan/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "authorization": accessToken,
        "x-api-key": SANDBOX_API_KEY,
        "x-accept-cache": "true",
      },
      body: JSON.stringify(testPayload),
    });

    console.log('📡 TEST HTTP Status:', verifyRes.status, verifyRes.statusText);

    const verifyData = await verifyRes.json();
    console.log('✅ TEST VERIFY RESPONSE:', JSON.stringify(verifyData, null, 2));

    res.json({
      success: true,
      auth_response: authData,
      verify_response: verifyData,
      http_status: verifyRes.status,
      message: 'Test completed - check console for detailed logs'
    });

  } catch (error) {
    console.error('❌ TEST ERROR:', error);
    res.status(500).json({
      error: 'Test failed',
      message: error.message
    });
  }
});

module.exports = router;
