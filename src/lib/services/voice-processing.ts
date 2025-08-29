import { SpeechClient } from '@google-cloud/speech';
import { WebSocket } from 'ws';
import { errorHandler } from './error-handler';

// Audio configuration interface
export interface AudioConfig {
  sampleRate: number; // 16000 Hz required
  channels: number;   // 1 (mono) required
  encoding: 'PCM_16'; // 16-bit PCM required
  languageCode: string; // 'ko-KR' default
  enablePartialResults: boolean;
  enableVoiceActivityDetection: boolean;
}

// Voice recognition error types
export interface VoiceRecognitionError extends Error {
  code: string;
  category: 'network' | 'permission' | 'audio_quality' | 'language_detection' | 'api_error' | 'timeout';
  retryable: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Network connectivity status
export interface NetworkStatus {
  isOnline: boolean;
  latency: number;
  lastCheck: Date;
  consecutiveFailures: number;
}

// Audio quality metrics
export interface AudioQualityMetrics {
  signalLevel: number;
  noiseLevel: number;
  signalToNoiseRatio: number;
  clippingDetected: boolean;
  qualityScore: number; // 0-1 scale
}

// Transcription result interface
export interface TranscriptionResult {
  sessionId: string;
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
  alternatives?: string[];
  error?: string;
}

// Stream connection interface
export interface StreamConnection {
  sessionId: string;
  isActive: boolean;
  recognizeStream: any;
  audioConfig: AudioConfig;
  createdAt: Date;
  timeout?: NodeJS.Timeout;
  lastActivity: Date;
  qualityMetrics?: AudioQualityMetrics;
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
  private networkStatus: NetworkStatus = {
    isOnline: true,
    latency: 0,
    lastCheck: new Date(),
    consecutiveFailures: 0
  };
  private retryAttempts: Map<string, number> = new Map();
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 5000]; // Progressive delays in ms
  private readonly NETWORK_CHECK_INTERVAL = 30000; // 30 seconds
  private networkCheckTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Initialize Google Cloud Speech client
    this.speechClient = new SpeechClient({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    // Start network monitoring
    this.startNetworkMonitoring();
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
      // Check network connectivity first
      await this.checkNetworkConnectivity();
      
      if (!this.networkStatus.isOnline) {
        throw this.createVoiceError(
          'Network connectivity required for voice recognition',
          'network',
          true,
          'high'
        );
      }

      // Validate audio configuration
      this.validateAudioConfig(config);

      // Stop existing stream if any
      if (this.activeStreams.has(sessionId)) {
        await this.stopAudioStream(sessionId);
      }

      // Reset retry count for new stream
      this.retryAttempts.set(sessionId, 0);

      // Create streaming recognition request with enhanced error handling
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
          // Add alternative language codes for better detection
          alternativeLanguageCodes: this.getAlternativeLanguages(config.languageCode),
        },
        interimResults: config.enablePartialResults,
        enableVoiceActivityEvents: config.enableVoiceActivityDetection,
      };

      // Create streaming recognition stream with enhanced error handling
      const recognizeStream = this.speechClient
        .streamingRecognize(request)
        .on('error', async (error) => {
          console.error(`Speech recognition error for session ${sessionId}:`, error);
          await this.handleStreamErrorWithRecovery(sessionId, error);
        })
        .on('data', (data) => {
          this.handleTranscriptionDataWithQualityCheck(sessionId, data);
        })
        .on('end', () => {
          console.log(`Speech recognition stream ended for session: ${sessionId}`);
        });

      // Set up stream timeout
      const streamTimeout = setTimeout(() => {
        if (this.activeStreams.has(sessionId)) {
          console.warn(`Stream timeout for session: ${sessionId}`);
          this.handleStreamTimeout(sessionId);
        }
      }, 300000); // 5 minutes timeout

      // Create stream connection
      const streamConnection: StreamConnection = {
        sessionId,
        isActive: true,
        recognizeStream,
        audioConfig: config,
        createdAt: new Date(),
        timeout: streamTimeout,
        lastActivity: new Date(),
      };

      // Store active stream
      this.activeStreams.set(sessionId, streamConnection);

      console.log(`Started audio stream for session: ${sessionId}`);
      return streamConnection;
    } catch (error) {
      console.error(`Failed to start audio stream for session ${sessionId}:`, error);
      
      // Handle specific error types
      if (error instanceof Error) {
        const voiceError = this.categorizeError(error);
        const recovery = await errorHandler.handleVoiceError(sessionId, voiceError, this.retryAttempts.get(sessionId) || 0);
        
        if (recovery.success && recovery.actions.some(action => action.type === 'retry')) {
          // Attempt retry if suggested
          const retryCount = this.retryAttempts.get(sessionId) || 0;
          if (retryCount < this.MAX_RETRY_ATTEMPTS) {
            this.retryAttempts.set(sessionId, retryCount + 1);
            const delay = this.RETRY_DELAYS[Math.min(retryCount, this.RETRY_DELAYS.length - 1)];
            
            console.log(`Retrying audio stream start for session ${sessionId} in ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.startAudioStream(sessionId, config);
          }
        }
        
        throw voiceError;
      }
      
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

  // Enhanced error handling methods

  /**
   * Start network monitoring
   */
  private startNetworkMonitoring(): void {
    this.networkCheckTimer = setInterval(() => {
      this.checkNetworkConnectivity();
    }, this.NETWORK_CHECK_INTERVAL);
  }

  /**
   * Check network connectivity
   */
  private async checkNetworkConnectivity(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Simple connectivity check using Google's public DNS
      const response = await fetch('https://dns.google/resolve?name=google.com&type=A', {
        method: 'GET',
        timeout: 5000,
      });
      
      if (response.ok) {
        const latency = Date.now() - startTime;
        this.networkStatus = {
          isOnline: true,
          latency,
          lastCheck: new Date(),
          consecutiveFailures: 0
        };
      } else {
        throw new Error('Network check failed');
      }
    } catch (error) {
      this.networkStatus = {
        isOnline: false,
        latency: 0,
        lastCheck: new Date(),
        consecutiveFailures: this.networkStatus.consecutiveFailures + 1
      };
      
      console.warn('Network connectivity check failed:', error);
    }
  }

  /**
   * Create voice recognition error
   */
  private createVoiceError(
    message: string, 
    category: VoiceRecognitionError['category'], 
    retryable: boolean, 
    severity: VoiceRecognitionError['severity']
  ): VoiceRecognitionError {
    const error = new Error(message) as VoiceRecognitionError;
    error.code = `VOICE_${category.toUpperCase()}`;
    error.category = category;
    error.retryable = retryable;
    error.severity = severity;
    return error;
  }

  /**
   * Categorize error for better handling
   */
  private categorizeError(error: Error): VoiceRecognitionError {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
      return this.createVoiceError(error.message, 'network', true, 'high');
    } else if (message.includes('permission') || message.includes('microphone') || message.includes('access')) {
      return this.createVoiceError(error.message, 'permission', false, 'high');
    } else if (message.includes('audio') || message.includes('format') || message.includes('quality')) {
      return this.createVoiceError(error.message, 'audio_quality', true, 'medium');
    } else if (message.includes('language') || message.includes('locale')) {
      return this.createVoiceError(error.message, 'language_detection', true, 'medium');
    } else if (message.includes('quota') || message.includes('rate') || message.includes('limit')) {
      return this.createVoiceError(error.message, 'api_error', true, 'high');
    } else {
      return this.createVoiceError(error.message, 'api_error', true, 'medium');
    }
  }

  /**
   * Get alternative language codes for better detection
   */
  private getAlternativeLanguages(primaryLanguage: string): string[] {
    const alternatives: Record<string, string[]> = {
      'ko-KR': ['en-US', 'ja-JP'],
      'en-US': ['ko-KR', 'en-GB'],
      'ja-JP': ['ko-KR', 'en-US'],
    };
    
    return alternatives[primaryLanguage] || ['en-US'];
  }

  /**
   * Handle stream error with recovery
   */
  private async handleStreamErrorWithRecovery(sessionId: string, error: any): Promise<void> {
    const voiceError = this.categorizeError(error);
    const retryCount = this.retryAttempts.get(sessionId) || 0;
    
    console.error(`Stream error for session ${sessionId} (attempt ${retryCount + 1}):`, error);
    
    // Clean up the current stream
    this.cleanupStream(sessionId);
    
    // Handle error through error handler
    const recovery = await errorHandler.handleVoiceError(sessionId, voiceError, retryCount);
    
    if (recovery.success && recovery.actions.some(action => action.type === 'retry') && retryCount < this.MAX_RETRY_ATTEMPTS) {
      // Attempt automatic retry
      this.retryAttempts.set(sessionId, retryCount + 1);
      const delay = this.RETRY_DELAYS[Math.min(retryCount, this.RETRY_DELAYS.length - 1)];
      
      console.log(`Auto-retrying stream for session ${sessionId} in ${delay}ms`);
      setTimeout(async () => {
        try {
          const streamConnection = this.activeStreams.get(sessionId);
          if (streamConnection) {
            await this.startAudioStream(sessionId, streamConnection.audioConfig);
          }
        } catch (retryError) {
          console.error(`Retry failed for session ${sessionId}:`, retryError);
          this.emitErrorResult(sessionId, voiceError);
        }
      }, delay);
    } else {
      // Emit error result to callback
      this.emitErrorResult(sessionId, voiceError);
    }
  }

  /**
   * Handle transcription data with quality check
   */
  private handleTranscriptionDataWithQualityCheck(sessionId: string, data: any): void {
    try {
      // Update last activity
      const streamConnection = this.activeStreams.get(sessionId);
      if (streamConnection) {
        streamConnection.lastActivity = new Date();
      }

      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const alternative = result.alternatives[0];

        if (alternative) {
          // Check transcription quality
          const qualityScore = this.assessTranscriptionQuality(alternative);
          
          const transcriptionResult: TranscriptionResult = {
            sessionId,
            text: alternative.transcript || '',
            confidence: alternative.confidence || 0,
            isFinal: result.isFinal || false,
            timestamp: Date.now(),
            alternatives: result.alternatives?.slice(1).map((alt: any) => alt.transcript) || [],
          };

          // Only emit high-quality results or final results
          if (qualityScore > 0.3 || transcriptionResult.isFinal) {
            // Call registered callback
            const callback = this.eventCallbacks.get(sessionId);
            if (callback) {
              callback(transcriptionResult);
            }

            console.log(`Transcription for session ${sessionId}:`, {
              text: transcriptionResult.text,
              isFinal: transcriptionResult.isFinal,
              confidence: transcriptionResult.confidence,
              quality: qualityScore,
            });
          } else {
            console.log(`Low quality transcription filtered for session ${sessionId}: ${transcriptionResult.text}`);
          }
        }
      }

      // Handle language detection results
      if (data.speechEventType === 'SPEECH_EVENT_UNSPECIFIED' && data.speechEventTime) {
        console.log(`Speech event for session ${sessionId}:`, data.speechEventType);
      }
    } catch (error) {
      console.error(`Error handling transcription data for session ${sessionId}:`, error);
    }
  }

  /**
   * Assess transcription quality
   */
  private assessTranscriptionQuality(alternative: any): number {
    let qualityScore = 0;
    
    // Base score from confidence
    qualityScore += (alternative.confidence || 0) * 0.6;
    
    // Bonus for word-level confidence
    if (alternative.words && alternative.words.length > 0) {
      const avgWordConfidence = alternative.words.reduce((sum: number, word: any) => 
        sum + (word.confidence || 0), 0) / alternative.words.length;
      qualityScore += avgWordConfidence * 0.3;
    }
    
    // Penalty for very short transcriptions (likely noise)
    const text = alternative.transcript || '';
    if (text.length < 3) {
      qualityScore *= 0.5;
    }
    
    // Bonus for proper sentence structure
    if (text.match(/[.!?]$/)) {
      qualityScore += 0.1;
    }
    
    return Math.min(qualityScore, 1.0);
  }

  /**
   * Handle stream timeout
   */
  private handleStreamTimeout(sessionId: string): void {
    console.warn(`Stream timeout for session: ${sessionId}`);
    
    const timeoutError = this.createVoiceError(
      'Voice recognition stream timeout',
      'timeout',
      true,
      'medium'
    );
    
    this.handleStreamErrorWithRecovery(sessionId, timeoutError);
  }

  /**
   * Clean up stream resources
   */
  private cleanupStream(sessionId: string): void {
    const streamConnection = this.activeStreams.get(sessionId);
    if (streamConnection) {
      // Clear timeout
      if (streamConnection.timeout) {
        clearTimeout(streamConnection.timeout);
      }
      
      // End stream if still active
      if (streamConnection.recognizeStream && streamConnection.isActive) {
        try {
          streamConnection.recognizeStream.end();
        } catch (error) {
          console.warn(`Error ending stream for session ${sessionId}:`, error);
        }
      }
      
      streamConnection.isActive = false;
    }
    
    // Remove from active streams
    this.activeStreams.delete(sessionId);
  }

  /**
   * Emit error result to callback
   */
  private emitErrorResult(sessionId: string, error: VoiceRecognitionError): void {
    const callback = this.eventCallbacks.get(sessionId);
    if (callback) {
      const errorResult: TranscriptionResult = {
        sessionId,
        text: '',
        confidence: 0,
        isFinal: true,
        timestamp: Date.now(),
        error: error.message,
      };
      callback(errorResult);
    }
  }

  /**
   * Get network status
   */
  public getNetworkStatus(): NetworkStatus {
    return { ...this.networkStatus };
  }

  /**
   * Get audio quality metrics for a session
   */
  public getAudioQualityMetrics(sessionId: string): AudioQualityMetrics | null {
    const streamConnection = this.activeStreams.get(sessionId);
    return streamConnection?.qualityMetrics || null;
  }

  /**
   * Set language with fallback detection
   */
  async setLanguageWithFallback(sessionId: string, languageCode: string): Promise<void> {
    try {
      await this.setLanguage(sessionId, languageCode);
    } catch (error) {
      console.warn(`Failed to set language ${languageCode}, trying fallback languages`);
      
      const fallbackLanguages = this.getAlternativeLanguages(languageCode);
      for (const fallbackLang of fallbackLanguages) {
        try {
          await this.setLanguage(sessionId, fallbackLang);
          console.log(`Successfully set fallback language: ${fallbackLang}`);
          return;
        } catch (fallbackError) {
          console.warn(`Fallback language ${fallbackLang} also failed`);
        }
      }
      
      // If all fallbacks fail, throw the original error
      throw error;
    }
  }

  // Cleanup method for graceful shutdown
  public async cleanup(): Promise<void> {
    console.log('Cleaning up voice processing service...');
    
    // Stop network monitoring
    if (this.networkCheckTimer) {
      clearInterval(this.networkCheckTimer);
      this.networkCheckTimer = null;
    }
    
    // Stop all active streams
    const sessionIds = Array.from(this.activeStreams.keys());
    await Promise.all(sessionIds.map(sessionId => this.stopAudioStream(sessionId)));
    
    // Clear all callbacks and retry attempts
    this.eventCallbacks.clear();
    this.retryAttempts.clear();
    
    console.log('Voice processing service cleanup completed');
  }
}

// Export singleton instance
export const voiceProcessingService = new VoiceProcessingServiceImpl();