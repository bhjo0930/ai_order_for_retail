#!/usr/bin/env node

/**
 * Environment variable validation script for Cloud Run deployment
 * Validates required environment variables are present and properly formatted
 */

const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_CLOUD_PROJECT_ID',
  'GEMINI_API_KEY',
];

const optionalEnvVars = [
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'MOCK_PAYMENT_SUCCESS_RATE',
  'MOCK_PAYMENT_DELAY_MS',
  'LOG_LEVEL',
  'ENABLE_STRUCTURED_LOGGING',
];

function validateEnvironment() {
  console.log('🔍 Validating environment variables...');
  
  const missing = [];
  const warnings = [];
  
  // Check required variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  // Check optional variables
  for (const envVar of optionalEnvVars) {
    if (!process.env[envVar]) {
      warnings.push(envVar);
    }
  }
  
  // Validate specific formats
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('https://')) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL (must start with https://)');
  }
  
  if (process.env.PORT && isNaN(parseInt(process.env.PORT))) {
    missing.push('PORT (must be a valid number)');
  }
  
  if (process.env.MOCK_PAYMENT_SUCCESS_RATE) {
    const rate = parseFloat(process.env.MOCK_PAYMENT_SUCCESS_RATE);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      missing.push('MOCK_PAYMENT_SUCCESS_RATE (must be a number between 0 and 1)');
    }
  }
  
  // Report results
  if (missing.length > 0) {
    console.error('❌ Missing or invalid required environment variables:');
    missing.forEach(envVar => console.error(`  - ${envVar}`));
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️  Optional environment variables not set:');
    warnings.forEach(envVar => console.warn(`  - ${envVar}`));
  }
  
  console.log('✅ Environment validation passed');
  
  // Log configuration summary (without sensitive values)
  console.log('\n📋 Configuration Summary:');
  console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`  PORT: ${process.env.PORT}`);
  console.log(`  GOOGLE_CLOUD_PROJECT_ID: ${process.env.GOOGLE_CLOUD_PROJECT_ID}`);
  console.log(`  SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing'}`);
  console.log(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'configured' : 'missing'}`);
  console.log(`  MOCK_PAYMENT_SUCCESS_RATE: ${process.env.MOCK_PAYMENT_SUCCESS_RATE || '0.9 (default)'}`);
}

if (require.main === module) {
  validateEnvironment();
}

module.exports = { validateEnvironment };