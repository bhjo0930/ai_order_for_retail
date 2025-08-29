import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { webSocketHandler } from '../services/websocket-handler';
import { voiceProcessingService } from '../services/voice-processing';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server: any = null;

export async function startServer() {
  try {
    await app.prepare();

    // Create HTTP server
    server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url!, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
      }
    });

    // Initialize WebSocket handler
    webSocketHandler.initialize(server);

    // Set up transcription result forwarding
    setupTranscriptionForwarding();

    // Start server
    server.listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Set up transcription result forwarding from voice service to WebSocket handler
function setupTranscriptionForwarding() {
  // Override the voice processing service's transcription callback
  const originalOnTranscriptionResult = voiceProcessingService.onTranscriptionResult.bind(voiceProcessingService);
  
  voiceProcessingService.onTranscriptionResult = (sessionId: string, callback: (result: any) => void) => {
    // Register the original callback
    originalOnTranscriptionResult(sessionId, callback);
    
    // Also register our forwarding callback
    originalOnTranscriptionResult(sessionId, (result: any) => {
      // Forward transcription results to WebSocket clients
      webSocketHandler.sendTranscriptionResult(sessionId, result);
    });
  };
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Cleanup WebSocket handler
    await webSocketHandler.cleanup();

    // Cleanup voice processing service
    await voiceProcessingService.cleanup();

    // Close HTTP server
    if (server) {
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        console.log('Forcing server close');
        process.exit(1);
      }, 10000);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}