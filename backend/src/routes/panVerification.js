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

    // 1️⃣ Authenticate with Sandbox API
    const authRes = await fetch("https://api.sandbox.co.in/authenticate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SANDBOX_API_KEY,
        "x-api-secret": SANDBOX_API_SECRET,
      },
    });

    const authData = await authRes.json();
    console.log("AUTH RESPONSE:", authData);

    if (!authRes.ok) {
      console.error("AUTH ERROR:", authData);
      return res.status(authRes.status).json({
        error: 'Authentication failed',
        details: authData
      });
    }

    const accessToken = authData.access_token || authData.data?.access_token;
    console.log("Access Token:", accessToken);

    const formattedDob = formatDateToDDMMYYYY(date_of_birth);
    console.log("Formatted DOB:", formattedDob);

    // 2️⃣ Verify PAN using access_token
    const verifyRes = await fetch("https://api.sandbox.co.in/kyc/pan/verify", {
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
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
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

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      // Process batch concurrently
      const batchPromises = batch.map(async (record) => {
        try {
          const { pan_number, name, date_of_birth, father_name } = record;

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
          
          if (!authRes.ok) {
            return {
              ...record,
              status: 'failed',
              error_message: 'Authentication failed',
              verified_date: new Date()
            };
          }

          const accessToken = authData.access_token || authData.data?.access_token;
          const formattedDob = formatDateToDDMMYYYY(date_of_birth);

          // 2️⃣ Verify PAN
          const verifyRes = await fetch("https://api.sandbox.co.in/kyc/pan/verify", {
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
          return {
            ...record,
            status: 'failed',
            error_message: error.message,
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
      results
    });

  } catch (error) {
    console.error("Error in bulk PAN verification:", error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;
