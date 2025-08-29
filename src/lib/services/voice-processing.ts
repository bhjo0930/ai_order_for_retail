import { SpeechClient } from '@google-cloud/speech';
import { WebSocket } from 'ws';

// Audio configuration interface
export interface AudioConfig {
  sampleRate: number; // 16000 Hz required
  channels: number;   // 1 (mono) required
  encoding: 'PCM_16'; // 16-bit PCM required
  languageCode: string; // 'ko-KR' default
  enablePartialResults: boolean;
  enableVoiceActivityDetection: boolean;
}

// Transcription result interface
export interface TranscriptionResult {
  sessionId: string;
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
  alternatives?: string[];
}

// Stream connection interface
export interface StreamConnection {
  sessionId: string;
  isActive: boolean;
  recognizeStream: any;
  audioConfig: AudioConfig;
  createdAt: Date;
}

// Media permissions interface
export interface MediaPermissions {
  audio: boolean;
  granted: boolean;
  error?: string;
}

// Voice processing service interface
export interface VoiceProcessingService {
  startAudioStream(sessionId: string, config: AudioConfig): Promise<StreamConnection>;
  stopAudioStream(sessionId: string): Promise<void>;
  processAudioChunk(sessionId: string, audioData: ArrayBuffer): Promise<void>;
  setLanguage(sessionId: string, languageCode: string): Promise<void>;
  getDevicePermissions(): Promise<MediaPermissions>;
}

// Default audio configuration
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  sampleRate: 16000,
  channels: 1,
  encoding: 'PCM_16',
  languageCode: 'ko-KR',
  enablePartialResults: true,
  enableVoiceActivityDetection: true,
};

// Voice processing service implementation
export class VoiceProcessingServiceImpl implements VoiceProcessingService {
  private speechClient: SpeechClient;
  private activeStreams: Map<string, StreamConnection> = new Map();
  private eventCallbacks: Map<string, (result: TranscriptionResult) => void> = new Map();

  constructor() {
    // Initialize Google Cloud Speech client
    this.speechClient = new SpeechClient({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }

  // Register callback for transcription results
  public onTranscriptionResult(sessionId: string, callback: (result: TranscriptionResult) => void): void {
    this.eventCallbacks.set(sessionId, callback);
  }

  // Remove callback for session
  public removeTranscriptionCallback(sessionId: string): void {
    this.eventCallbacks.delete(sessionId);
  }

  // Get all registered callbacks (for forwarding)
  public getTranscriptionCallbacks(): Map<string, (result: TranscriptionResult) => void> {
    return this.eventCallbacks;
  }

  async startAudioStream(sessionId: string, config: AudioConfig): Promise<StreamConnection> {
    try {
      // Validate audio configuration
      this.validateAudioConfig(config);

      // Stop existing stream if any
      if (this.activeStreams.has(sessionId)) {
        await this.stopAudioStream(sessionId);
      }

      // Create streaming recognition request
      const request = {
        config: {
          encoding: 'LINEAR16' as const,
          sampleRateHertz: config.sampleRate,
          audioChannelCount: config.channels,
          languageCode: config.languageCode,
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
          model: 'latest_long',
          useEnhanced: true,
        },
        interimResults: config.enablePartialResults,
        enableVoiceActivityEvents: config.enableVoiceActivityDetection,
      };

      // Create streaming recognition stream
      const recognizeStream = this.speechClient
        .streamingRecognize(request)
        .on('error', (error) => {
          console.error(`Speech recognition error for session ${sessionId}:`, error);
          this.handleStreamError(sessionId, error);
        })
        .on('data', (data) => {
          this.handleTranscriptionData(sessionId, data);
        });

      // Create stream connection
      const streamConnection: StreamConnection = {
        sessionId,
        isActive: true,
        recognizeStream,
        audioConfig: config,
        createdAt: new Date(),
      };

      // Store active stream
      this.activeStreams.set(sessionId, streamConnection);

      console.log(`Started audio stream for session: ${sessionId}`);
      return streamConnection;
    } catch (error) {
      console.error(`Failed to start audio stream for session ${sessionId}:`, error);
      throw new Error(`Failed to start audio stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async stopAudioStream(sessionId: string): Promise<void> {
    try {
      const streamConnection = this.activeStreams.get(sessionId);
      if (!streamConnection) {
        console.warn(`No active stream found for session: ${sessionId}`);
        return;
      }

      // End the recognition stream
      if (streamConnection.recognizeStream && streamConnection.isActive) {
        streamConnection.recognizeStream.end();
        streamConnection.isActive = false;
      }

      // Remove from active streams
      this.activeStreams.delete(sessionId);
      
      // Remove callback
      this.removeTranscriptionCallback(sessionId);

      console.log(`Stopped audio stream for session: ${sessionId}`);
    } catch (error) {
      console.error(`Failed to stop audio stream for session ${sessionId}:`, error);
      throw new Error(`Failed to stop audio stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processAudioChunk(sessionId: string, audioData: ArrayBuffer): Promise<void> {
    try {
      const streamConnection = this.activeStreams.get(sessionId);
      if (!streamConnection || !streamConnection.isActive) {
        throw new Error(`No active stream found for session: ${sessionId}`);
      }

      // Convert ArrayBuffer to Buffer
      const audioBuffer = Buffer.from(audioData);
      
      // Validate audio data
      if (audioBuffer.length === 0) {
        console.warn(`Empty audio data received for session: ${sessionId}`);
        return;
      }

      // Send audio data to recognition stream
      streamConnection.recognizeStream.write(audioBuffer);
    } catch (error) {
      console.error(`Failed to process audio chunk for session ${sessionId}:`, error);
      throw new Error(`Failed to process audio chunk: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async setLanguage(sessionId: string, languageCode: string): Promise<void> {
    try {
      const streamConnection = this.activeStreams.get(sessionId);
      if (!streamConnection) {
        throw new Error(`No active stream found for session: ${sessionId}`);
      }

      // Update language in audio config
      streamConnection.audioConfig.languageCode = languageCode;

      // Restart stream with new language configuration
      await this.stopAudioStream(sessionId);
      await this.startAudioStream(sessionId, streamConnection.audioConfig);

      console.log(`Updated language to ${languageCode} for session: ${sessionId}`);
    } catch (error) {
      console.error(`Failed to set language for session ${sessionId}:`, error);
      throw new Error(`Failed to set language: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDevicePermissions(): Promise<MediaPermissions> {
    // This method is primarily for client-side use
    // Server-side implementation returns a placeholder
    return {
      audio: true,
      granted: true,
    };
  }

  // Private helper methods
  private validateAudioConfig(config: AudioConfig): void {
    if (config.sampleRate !== 16000) {
      throw new Error('Sample rate must be 16000 Hz');
    }
    if (config.channels !== 1) {
      throw new Error('Audio must be mono (1 channel)');
    }
    if (config.encoding !== 'PCM_16') {
      throw new Error('Audio encoding must be PCM_16');
    }
    if (!config.languageCode) {
      throw new Error('Language code is required');
    }
  }

  private handleTranscriptionData(sessionId: string, data: any): void {
    try {
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const alternative = result.alternatives[0];

        if (alternative) {
          const transcriptionResult: TranscriptionResult = {
            sessionId,
            text: alternative.transcript || '',
            confidence: alternative.confidence || 0,
            isFinal: result.isFinal || false,
            timestamp: Date.now(),
            alternatives: result.alternatives?.slice(1).map((alt: any) => alt.transcript) || [],
          };

          // Call registered callback
          const callback = this.eventCallbacks.get(sessionId);
          if (callback) {
            callback(transcriptionResult);
          }

          console.log(`Transcription for session ${sessionId}:`, {
            text: transcriptionResult.text,
            isFinal: transcriptionResult.isFinal,
            confidence: transcriptionResult.confidence,
          });
        }
      }
    } catch (error) {
      console.error(`Error handling transcription data for session ${sessionId}:`, error);
    }
  }

  private handleStreamError(sessionId: string, error: any): void {
    console.error(`Stream error for session ${sessionId}:`, error);
    
    // Clean up the stream
    this.activeStreams.delete(sessionId);
    this.removeTranscriptionCallback(sessionId);

    // Emit error result
    const callback = this.eventCallbacks.get(sessionId);
    if (callback) {
      const errorResult: TranscriptionResult = {
        sessionId,
        text: '',
        confidence: 0,
        isFinal: true,
        timestamp: Date.now(),
      };
      callback(errorResult);
    }
  }

  // Cleanup method for graceful shutdown
  public async cleanup(): Promise<void> {
    console.log('Cleaning up voice processing service...');
    
    // Stop all active streams
    const sessionIds = Array.from(this.activeStreams.keys());
    await Promise.all(sessionIds.map(sessionId => this.stopAudioStream(sessionId)));
    
    // Clear all callbacks
    this.eventCallbacks.clear();
    
    console.log('Voice processing service cleanup completed');
  }
}

// Export singleton instance
export const voiceProcessingService = new VoiceProcessingServiceImpl();