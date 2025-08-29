import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { voiceProcessingService, TranscriptionResult, AudioConfig, DEFAULT_AUDIO_CONFIG } from './voice-processing';

// WebSocket message types
export interface WebSocketMessage {
  type: 'audio_chunk' | 'start_stream' | 'stop_stream' | 'set_language' | 'ping' | 'transcription_result' | 'error' | 'ui_update' | 'toast' | 'navigation' | 'loader' | 'state_change';
  sessionId: string;
  data?: any;
  timestamp: number;
}

// Audio chunk message
export interface AudioChunkMessage extends WebSocketMessage {
  type: 'audio_chunk';
  data: {
    audioData: ArrayBuffer;
    sequenceNumber: number;
  };
}

// Start stream message
export interface StartStreamMessage extends WebSocketMessage {
  type: 'start_stream';
  data: {
    audioConfig?: Partial<AudioConfig>;
  };
}

// Stop stream message
export interface StopStreamMessage extends WebSocketMessage {
  type: 'stop_stream';
}

// Set language message
export interface SetLanguageMessage extends WebSocketMessage {
  type: 'set_language';
  data: {
    languageCode: string;
  };
}

// Transcription result message
export interface TranscriptionResultMessage extends WebSocketMessage {
  type: 'transcription_result';
  data: TranscriptionResult;
}

// Error message
export interface ErrorMessage extends WebSocketMessage {
  type: 'error';
  data: {
    error: string;
    code?: string;
  };
}

// WebSocket connection info
export interface WebSocketConnection {
  ws: WebSocket;
  sessionId: string;
  isAlive: boolean;
  lastActivity: Date;
  audioConfig?: AudioConfig;
}

// WebSocket handler class
export class WebSocketHandler {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, WebSocketConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Set up transcription result callback
    this.setupTranscriptionCallback();
  }

  // Initialize WebSocket server
  public initialize(server: any): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/api/voice/stream',
      perMessageDeflate: false, // Disable compression for real-time audio
    });

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleConnection(ws, request);
    });

    // Start heartbeat to detect broken connections
    this.startHeartbeat();

    console.log('WebSocket server initialized for voice streaming');
  }

  // Handle new WebSocket connection
  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const sessionId = this.extractSessionId(request);
    
    if (!sessionId) {
      console.error('No session ID provided in WebSocket connection');
      ws.close(1008, 'Session ID required');
      return;
    }

    // Create connection info
    const connection: WebSocketConnection = {
      ws,
      sessionId,
      isAlive: true,
      lastActivity: new Date(),
    };

    // Store connection
    this.connections.set(sessionId, connection);

    console.log(`WebSocket connected for session: ${sessionId}`);

    // Set up event handlers
    ws.on('message', (data: Buffer) => {
      this.handleMessage(sessionId, data);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnection(sessionId, code, reason.toString());
    });

    ws.on('error', (error: Error) => {
      this.handleError(sessionId, error);
    });

    ws.on('pong', () => {
      const conn = this.connections.get(sessionId);
      if (conn) {
        conn.isAlive = true;
        conn.lastActivity = new Date();
      }
    });

    // Send connection confirmation
    this.sendMessage(sessionId, {
      type: 'ping',
      sessionId,
      data: { status: 'connected' },
      timestamp: Date.now(),
    });
  }

  // Handle incoming WebSocket messages
  private async handleMessage(sessionId: string, data: Buffer): Promise<void> {
    try {
      const connection = this.connections.get(sessionId);
      if (!connection) {
        console.error(`No connection found for session: ${sessionId}`);
        return;
      }

      // Update last activity
      connection.lastActivity = new Date();

      // Parse message
      const message: WebSocketMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'start_stream':
          await this.handleStartStream(sessionId, message as StartStreamMessage);
          break;

        case 'stop_stream':
          await this.handleStopStream(sessionId, message as StopStreamMessage);
          break;

        case 'audio_chunk':
          await this.handleAudioChunk(sessionId, message as AudioChunkMessage);
          break;

        case 'set_language':
          await this.handleSetLanguage(sessionId, message as SetLanguageMessage);
          break;

        case 'ping':
          // Respond to ping
          this.sendMessage(sessionId, {
            type: 'ping',
            sessionId,
            data: { status: 'pong' },
            timestamp: Date.now(),
          });
          break;

        default:
          console.warn(`Unknown message type: ${message.type} for session: ${sessionId}`);
      }
    } catch (error) {
      console.error(`Error handling message for session ${sessionId}:`, error);
      this.sendError(sessionId, 'Failed to process message', 'MESSAGE_PROCESSING_ERROR');
    }
  }

  // Handle start stream message
  private async handleStartStream(sessionId: string, message: StartStreamMessage): Promise<void> {
    try {
      const connection = this.connections.get(sessionId);
      if (!connection) {
        throw new Error(`No connection found for session: ${sessionId}`);
      }

      // Merge with default audio config
      const audioConfig: AudioConfig = {
        ...DEFAULT_AUDIO_CONFIG,
        ...message.data.audioConfig,
      };

      // Store audio config in connection
      connection.audioConfig = audioConfig;

      // Register transcription callback
      voiceProcessingService.onTranscriptionResult(sessionId, (result: TranscriptionResult) => {
        this.sendTranscriptionResult(sessionId, result);
      });

      // Start audio stream
      await voiceProcessingService.startAudioStream(sessionId, audioConfig);

      console.log(`Started audio stream for session: ${sessionId}`);

      // Send confirmation
      this.sendMessage(sessionId, {
        type: 'ping',
        sessionId,
        data: { 
          status: 'stream_started',
          audioConfig,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`Failed to start stream for session ${sessionId}:`, error);
      this.sendError(sessionId, `Failed to start stream: ${error instanceof Error ? error.message : 'Unknown error'}`, 'STREAM_START_ERROR');
    }
  }

  // Handle stop stream message
  private async handleStopStream(sessionId: string, message: StopStreamMessage): Promise<void> {
    try {
      // Stop audio stream
      await voiceProcessingService.stopAudioStream(sessionId);

      console.log(`Stopped audio stream for session: ${sessionId}`);

      // Send confirmation
      this.sendMessage(sessionId, {
        type: 'ping',
        sessionId,
        data: { status: 'stream_stopped' },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`Failed to stop stream for session ${sessionId}:`, error);
      this.sendError(sessionId, `Failed to stop stream: ${error instanceof Error ? error.message : 'Unknown error'}`, 'STREAM_STOP_ERROR');
    }
  }

  // Handle audio chunk message
  private async handleAudioChunk(sessionId: string, message: AudioChunkMessage): Promise<void> {
    try {
      if (!message.data.audioData) {
        throw new Error('No audio data provided');
      }

      // Convert base64 to ArrayBuffer if needed
      let audioData: ArrayBuffer;
      if (typeof message.data.audioData === 'string') {
        const buffer = Buffer.from(message.data.audioData, 'base64');
        audioData = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      } else {
        audioData = message.data.audioData;
      }

      // Process audio chunk
      await voiceProcessingService.processAudioChunk(sessionId, audioData);
    } catch (error) {
      console.error(`Failed to process audio chunk for session ${sessionId}:`, error);
      this.sendError(sessionId, `Failed to process audio: ${error instanceof Error ? error.message : 'Unknown error'}`, 'AUDIO_PROCESSING_ERROR');
    }
  }

  // Handle set language message
  private async handleSetLanguage(sessionId: string, message: SetLanguageMessage): Promise<void> {
    try {
      const { languageCode } = message.data;
      
      if (!languageCode) {
        throw new Error('Language code is required');
      }

      // Set language
      await voiceProcessingService.setLanguage(sessionId, languageCode);

      console.log(`Set language to ${languageCode} for session: ${sessionId}`);

      // Send confirmation
      this.sendMessage(sessionId, {
        type: 'ping',
        sessionId,
        data: { 
          status: 'language_updated',
          languageCode,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`Failed to set language for session ${sessionId}:`, error);
      this.sendError(sessionId, `Failed to set language: ${error instanceof Error ? error.message : 'Unknown error'}`, 'LANGUAGE_UPDATE_ERROR');
    }
  }

  // Handle WebSocket disconnection
  private async handleDisconnection(sessionId: string, code: number, reason: string): Promise<void> {
    console.log(`WebSocket disconnected for session ${sessionId}, code: ${code}, reason: ${reason}`);

    try {
      // Stop audio stream if active
      await voiceProcessingService.stopAudioStream(sessionId);
    } catch (error) {
      console.error(`Error stopping stream during disconnection for session ${sessionId}:`, error);
    }

    // Remove connection
    this.connections.delete(sessionId);
  }

  // Handle WebSocket error
  private handleError(sessionId: string, error: Error): void {
    console.error(`WebSocket error for session ${sessionId}:`, error);
    
    // Send error message if connection is still open
    this.sendError(sessionId, error.message, 'WEBSOCKET_ERROR');
  }

  // Set up transcription result callback
  private setupTranscriptionCallback(): void {
    // This will be called when transcription results are available
    // We'll register callbacks dynamically when streams start
  }

  // Send message to client
  public sendMessage(sessionId: string, message: WebSocketMessage): void {
    const connection = this.connections.get(sessionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      console.warn(`Cannot send message to session ${sessionId}: connection not available`);
      return;
    }

    try {
      connection.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Failed to send message to session ${sessionId}:`, error);
    }
  }

  // Send error message to client
  private sendError(sessionId: string, error: string, code?: string): void {
    const errorMessage: ErrorMessage = {
      type: 'error',
      sessionId,
      data: { error, code },
      timestamp: Date.now(),
    };

    this.sendMessage(sessionId, errorMessage);
  }

  // Send transcription result to client
  public sendTranscriptionResult(sessionId: string, result: TranscriptionResult): void {
    const message: TranscriptionResultMessage = {
      type: 'transcription_result',
      sessionId,
      data: result,
      timestamp: Date.now(),
    };

    this.sendMessage(sessionId, message);
  }

  // Extract session ID from request
  private extractSessionId(request: IncomingMessage): string | null {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    return url.searchParams.get('sessionId');
  }

  // Start heartbeat to detect broken connections
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach((connection, sessionId) => {
        if (!connection.isAlive) {
          console.log(`Terminating inactive connection for session: ${sessionId}`);
          connection.ws.terminate();
          this.connections.delete(sessionId);
          return;
        }

        connection.isAlive = false;
        connection.ws.ping();
      });
    }, 30000); // 30 seconds
  }

  // Cleanup method
  public async cleanup(): Promise<void> {
    console.log('Cleaning up WebSocket handler...');

    // Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all connections
    this.connections.forEach((connection, sessionId) => {
      connection.ws.close(1001, 'Server shutting down');
    });

    // Clear connections
    this.connections.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log('WebSocket handler cleanup completed');
  }
}

// Export singleton instance
export const webSocketHandler = new WebSocketHandler();