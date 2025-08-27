const axios = require('axios');

// Test the Sandbox API integration
async function testSandboxAPI() {
  require('dotenv').config();
const apiKey = process.env.SANDBOX_API_KEY;
  const apiUrl = 'https://api.sandbox.co.in/kyc/pan/verify';
  
  const testPayload = {
    pan_number: 'ABCDE1234F',
    name: 'Test User',
    father_name: 'Test Father',
    date_of_birth: '1990-01-01'
  };

  try {
    console.log('Testing Sandbox API...');
    console.log('URL:', apiUrl);
    console.log('Payload:', testPayload);
    
    const response = await axios.post(apiUrl, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-api-key': apiKey
      },
      timeout: 30000
    });

    console.log('✅ API Response Status:', response.status);
    console.log('✅ API Response Data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ API Error:', error.message);
    if (error.response) {
      console.error('❌ Response Status:', error.response.status);
      console.error('❌ Response Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testSandboxAPI();
