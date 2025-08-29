const { spawn } = require('child_process');

let server;

// Environment validation
function validateEnvironment() {
  const required = ['NODE_ENV', 'PORT'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
  
  console.log('✅ Environment validation passed');
}

// Handle shutdown signals gracefully
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  if (server) {
    server.kill('SIGTERM');
  }
  setTimeout(() => {
    console.log('Force shutdown after timeout');
    process.exit(1);
  }, 30000); // 30 second timeout for Cloud Run
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  if (server) {
    server.kill('SIGINT');
  }
});

// Validate environment before starting
validateEnvironment();

console.log('🚀 Starting Mobile Voice Ordering System...');
console.log(`Environment: ${process.env.NODE_ENV}`);
console.log(`Port: ${process.env.PORT}`);

// Start the Next.js server
server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  env: process.env
});

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});