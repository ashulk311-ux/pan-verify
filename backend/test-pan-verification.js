const axios = require('axios');

// Test data - using sample PAN numbers for testing
const testCases = [
  {
    pan_number: 'ABCDE1234F',
    name: 'John Doe',
    date_of_birth: '1990-01-01',
    father_name: 'Father Doe',
    description: 'Valid PAN format test'
  },
  {
    pan_number: 'XYZAB5678G',
    name: 'Jane Smith',
    date_of_birth: '1985-05-15',
    father_name: 'Father Smith',
    description: 'Another valid PAN test'
  },
  {
    pan_number: 'INVALID123',
    name: 'Invalid User',
    date_of_birth: '1995-12-25',
    father_name: 'Invalid Father',
    description: 'Invalid PAN format test'
  }
];

async function testSingleVerification() {
  console.log('🧪 Testing Single PAN Verification API...\n');
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`📋 Test Case ${i + 1}: ${testCase.description}`);
    console.log(`PAN: ${testCase.pan_number}`);
    console.log(`Name: ${testCase.name}`);
    console.log(`DOB: ${testCase.date_of_birth}`);
    
    try {
      const startTime = Date.now();
      
      const response = await axios.post('http://localhost:3002/api/pan-verification/verify', {
        pan_number: testCase.pan_number,
        name: testCase.name,
        date_of_birth: testCase.date_of_birth,
        father_name: testCase.father_name
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      const data = response.data;
      
      console.log(`⏱️  Response Time: ${responseTime}ms`);
      console.log(`📊 Status Code: ${response.status}`);
      console.log(`✅ Success: ${data.success}`);
      
      if (data.success) {
        console.log(`🔍 Verification Status: ${data.verification.status}`);
        console.log(`📝 Error Message: ${data.verification.error_message || 'None'}`);
        
        if (data.api_response) {
          console.log(`🌐 API Response Status: ${data.api_response.status || 'N/A'}`);
          console.log(`📄 API Message: ${data.api_response.message || 'N/A'}`);
        }
      } else {
        console.log(`❌ Error: ${data.error}`);
        if (data.details) {
          console.log(`📋 Validation Details:`, data.details);
        }
      }
      
      console.log('─'.repeat(80));
      
      // Add delay between requests to avoid rate limiting
      if (i < testCases.length - 1) {
        console.log('⏳ Waiting 2 seconds before next test...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Test Case ${i + 1} failed:`, error.response?.data?.error || error.message);
      console.log('─'.repeat(80));
    }
  }
}

async function testBulkVerification() {
  console.log('\n🧪 Testing Bulk PAN Verification API...\n');
  
  try {
    const startTime = Date.now();
    
    const response = await axios.post('http://localhost:3002/api/pan-verification/verify-bulk', {
      records: testCases
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    const data = response.data;
    
    console.log(`⏱️  Total Response Time: ${responseTime}ms`);
    console.log(`📊 Status Code: ${response.status}`);
    console.log(`✅ Success: ${data.success}`);
    console.log(`📈 Total Records: ${data.total_records}`);
    
    if (data.success && data.results) {
      console.log('\n📋 Individual Results:');
      data.results.forEach((result, index) => {
        console.log(`\n  Record ${index + 1}:`);
        console.log(`    PAN: ${result.pan_number}`);
        console.log(`    Status: ${result.status}`);
        console.log(`    Error: ${result.error_message || 'None'}`);
        if (result.api_response) {
          console.log(`    API Status: ${result.api_response.status || 'N/A'}`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Bulk verification test failed:', error.response?.data?.error || error.message);
  }
}

async function testRateLimiting() {
  console.log('\n🧪 Testing Rate Limiting...\n');
  
  const rapidRequests = 10;
  console.log(`🚀 Sending ${rapidRequests} rapid requests...`);
  
  const promises = [];
  const startTime = Date.now();
  
  for (let i = 0; i < rapidRequests; i++) {
    promises.push(
      axios.post('http://localhost:3002/api/pan-verification/verify', {
        pan_number: `TEST${i}1234F`,
        name: `Test User ${i}`,
        date_of_birth: '1990-01-01',
        father_name: `Test Father ${i}`
      }).then((response) => {
        return {
          requestId: i + 1,
          status: response.status,
          success: response.data.success,
          responseTime: Date.now() - startTime
        };
      }).catch(error => ({
        requestId: i + 1,
        error: error.response?.data?.error || error.message,
        responseTime: Date.now() - startTime
      }))
    );
  }
  
  const results = await Promise.all(promises);
  const endTime = Date.now();
  const totalTime = endTime - startTime;
  
  console.log(`⏱️  Total Time: ${totalTime}ms`);
  console.log(`📊 Average Time per Request: ${totalTime / rapidRequests}ms`);
  
  console.log('\n📋 Results:');
  results.forEach(result => {
    if (result.error) {
      console.log(`  Request ${result.requestId}: ❌ ${result.error}`);
    } else {
      console.log(`  Request ${result.requestId}: ✅ ${result.status} (${result.responseTime}ms)`);
    }
  });
}

async function testErrorHandling() {
  console.log('\n🧪 Testing Error Handling...\n');
  
  const errorTestCases = [
    {
      name: 'Missing PAN',
      data: {
        name: 'John Doe',
        date_of_birth: '1990-01-01'
      },
      expectedError: 'Validation failed'
    },
    {
      name: 'Invalid PAN Format',
      data: {
        pan_number: 'INVALID',
        name: 'John Doe',
        date_of_birth: '1990-01-01'
      },
      expectedError: 'Validation failed'
    },
    {
      name: 'Missing Name',
      data: {
        pan_number: 'ABCDE1234F',
        date_of_birth: '1990-01-01'
      },
      expectedError: 'Validation failed'
    },
    {
      name: 'Invalid Date Format',
      data: {
        pan_number: 'ABCDE1234F',
        name: 'John Doe',
        date_of_birth: 'invalid-date'
      },
      expectedError: 'Validation failed'
    }
  ];
  
  for (const testCase of errorTestCases) {
    console.log(`📋 Testing: ${testCase.name}`);
    
    try {
      const response = await axios.post('http://localhost:3002/api/pan-verification/verify', testCase.data);
      
      console.log(`📊 Status Code: ${response.status}`);
      console.log(`❌ Error: ${response.data.error || 'None'}`);
      
      if (response.data.error === testCase.expectedError) {
        console.log(`✅ Expected error handled correctly`);
      } else {
        console.log(`⚠️  Unexpected error handling`);
      }
      
      console.log('─'.repeat(50));
      
    } catch (error) {
      console.log(`📊 Status Code: ${error.response?.status || 'Network Error'}`);
      console.log(`❌ Error: ${error.response?.data?.error || error.message}`);
      
      if (error.response?.data?.error === testCase.expectedError) {
        console.log(`✅ Expected error handled correctly`);
      } else {
        console.log(`⚠️  Unexpected error handling`);
      }
      
      console.log('─'.repeat(50));
    }
  }
}

async function runAllTests() {
  console.log('🚀 Starting PAN Verification API Tests...\n');
  console.log('='.repeat(80));
  
  try {
    // Test single verification
    await testSingleVerification();
    
    // Test bulk verification
    await testBulkVerification();
    
    // Test rate limiting
    await testRateLimiting();
    
    // Test error handling
    await testErrorHandling();
    
    console.log('\n🎉 All tests completed!');
    console.log('\n📊 Summary:');
    console.log('✅ Single verification API tested');
    console.log('✅ Bulk verification API tested');
    console.log('✅ Rate limiting tested');
    console.log('✅ Error handling tested');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
  }
}

// Run the tests
runAllTests();
