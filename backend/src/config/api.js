module.exports = {
  sandbox: {
    baseUrl: 'https://api.sandbox.co.in',
    panVerificationEndpoint: '/kyc/pan/verify',
    timeout: 30000, // 30 seconds
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  },
  
  // Add other API providers here if needed
  providers: {
    sandbox: {
      name: 'Sandbox.co.in',
      apiKeyEnv: 'SANDBOX_API_KEY',
      baseUrl: 'https://api.sandbox.co.in'
    }
  }
};
