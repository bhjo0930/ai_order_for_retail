// Client-side audio capture and streaming utilities

import { audioUtils, AudioValidator, AudioConverter, DEFAULT_CONVERSION_OPTIONS } from '../utils/audio-utils';

// Audio capture configuration
export interface AudioCaptureConfig {
  sampleRate: number;
  channels: number;
  bufferSize: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  voiceActivityDetection: boolean;
  silenceThreshold: number;
  chunkDuration: number; // milliseconds
}

// Default audio capture configuration
export const DEFAULT_CAPTURE_CONFIG: AudioCaptureConfig = {
  sampleRate: 16000,
  channels: 1,
  bufferSize: 4096,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceActivityDetection: true,
  silenceThreshold: 0.01,
  chunkDuration: 100, // 100ms chunks
};

// Audio capture events
export interface AudioCaptureEvents {
  onAudioData: (audioData: ArrayBuffer) => void;
  onVoiceStart: () => void;
  onVoiceEnd: () => void;
  onSilence: () => void;
  onError: (error: Error) => void;
  onPermissionDenied: () => void;
  onDeviceChange: (devices: MediaDeviceInfo[]) => void;
  onQualityWarning: (metrics: AudioQualityMetrics) => void;
  onNetworkError: (error: Error) => void;
  onRecovery: (message: string) => void;
}

// Enhanced audio capture error
export interface AudioCaptureError extends Error {
  code: string;
  category: 'permission' | 'device' | 'format' | 'quality' | 'browser_support';
  recoverable: boolean;
  suggestions: string[];
}

// Audio quality metrics (moved from voice-processing.ts for client use)
export interface AudioQualityMetrics {
  signalLevel: number;
  noiseLevel: number;
  signalToNoiseRatio: number;
  clippingDetected: boolean;
  qualityScore: number; // 0-1 scale
}

// Voice activity detection result
export interface VoiceActivityResult {
  hasVoice: boolean;
  energy: number;
  zeroCrossingRate: number;
  confidence: number;
}

// Audio capture class
export class AudioCapture {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isCapturing: boolean = false;
  private config: AudioCaptureConfig;
  private events: Partial<AudioCaptureEvents> = {};
  private voiceActivityBuffer: Float32Array[] = [];
  private lastVoiceActivity: boolean = false;
  private silenceStartTime: number = 0;
  private voiceStartTime: number = 0;
  private qualityCheckInterval: NodeJS.Timeout | null = null;
  private deviceMonitorInterval: NodeJS.Timeout | null = null;
  private lastQualityMetrics: AudioQualityMetrics | null = null;
  private permissionRetryCount: number = 0;
  private readonly MAX_PERMISSION_RETRIES = 3;

  constructor(config: Partial<AudioCaptureConfig> = {}) {
    this.config = { ...DEFAULT_CAPTURE_CONFIG, ...config };
  }

  // Set event handlers
  public on<K extends keyof AudioCaptureEvents>(event: K, handler: AudioCaptureEvents[K]): void {
    this.events[event] = handler;
  }

  // Remove event handler
  public off<K extends keyof AudioCaptureEvents>(event: K): void {
    delete this.events[event];
  }

  // Check if browser supports audio capture
  public static isSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.AudioContext
    );
  }

  // Get available audio input devices
  public static async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
      console.error('Failed to enumerate audio devices:', error);
      return [];
    }
  }

  // Request microphone permissions with retry logic
  public async requestPermissions(): Promise<boolean> {
    try {
      if (!AudioCapture.isSupported()) {
        const error = this.createAudioError(
          'Audio capture not supported in this browser',
          'browser_support',
          false,
          ['Please use a modern browser like Chrome, Firefox, or Safari', 'Ensure you are using HTTPS']
        );
        this.events.onError?.(error);
        return false;
      }

      // Check if permissions were previously denied
      if (this.permissionRetryCount >= this.MAX_PERMISSION_RETRIES) {
        const error = this.createAudioError(
          'Maximum permission retry attempts exceeded',
          'permission',
          false,
          ['Please manually enable microphone permissions in browser settings', 'Refresh the page and try again']
        );
        this.events.onError?.(error);
        return false;
      }

      // Request microphone access with enhanced constraints
      const constraints: MediaStreamConstraints = {
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
          // Add additional constraints for better quality
          latency: 0.01, // Low latency for real-time processing
          volume: 1.0,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Test the stream briefly to ensure it's working
      const testResult = await this.testAudioStream(stream);
      
      // Stop the test stream
      stream.getTracks().forEach(track => track.stop());

      if (!testResult.success) {
        this.permissionRetryCount++;
        const error = this.createAudioError(
          `Audio stream test failed: ${testResult.error}`,
          'quality',
          true,
          ['Check microphone connection', 'Try a different microphone', 'Restart your browser']
        );
        this.events.onError?.(error);
        return false;
      }

      this.permissionRetryCount = 0; // Reset on success
      return true;
    } catch (error) {
      this.permissionRetryCount++;
      console.error('Microphone permission denied:', error);
      
      const audioError = this.createAudioError(
        error instanceof Error ? error.message : 'Permission denied',
        'permission',
        this.permissionRetryCount < this.MAX_PERMISSION_RETRIES,
        [
          'Click the microphone icon in your browser address bar',
          'Select "Allow" when prompted for microphone access',
          'Check browser settings for microphone permissions'
        ]
      );
      
      this.events.onPermissionDenied?.();
      this.events.onError?.(audioError);
      return false;
    }
  }

  // Start audio capture with enhanced error handling
  public async startCapture(deviceId?: string): Promise<void> {
    try {
      if (this.isCapturing) {
        console.warn('Audio capture already started');
        return;
      }

      // Request permissions first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw this.createAudioError(
          'Microphone permission required',
          'permission',
          true,
          ['Grant microphone permission when prompted', 'Check browser settings']
        );
      }

      // Get media stream with enhanced constraints
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
          latency: 0.01,
          volume: 1.0,
        },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Validate the media stream
      if (!this.mediaStream || this.mediaStream.getAudioTracks().length === 0) {
        throw this.createAudioError(
          'No audio tracks available in media stream',
          'device',
          true,
          ['Check microphone connection', 'Try a different microphone']
        );
      }

      // Create audio context with error handling
      try {
        this.audioContext = new AudioContext({
          sampleRate: this.config.sampleRate,
        });
      } catch (contextError) {
        throw this.createAudioError(
          'Failed to create audio context',
          'browser_support',
          false,
          ['Browser may not support Web Audio API', 'Try a different browser']
        );
      }

      // Resume audio context if suspended (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create source node
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create analyser node for quality monitoring
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.8;

      // Create processor node for audio processing
      this.processorNode = this.audioContext.createScriptProcessor(
        this.config.bufferSize,
        this.config.channels,
        this.config.channels
      );

      // Set up audio processing
      this.processorNode.onaudioprocess = (event) => {
        this.processAudioBufferWithQualityCheck(event.inputBuffer);
      };

      // Connect nodes
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isCapturing = true;
      console.log('Audio capture started');

      // Start quality monitoring
      this.startQualityMonitoring();

      // Start device monitoring
      this.startDeviceMonitoring();

      // Monitor device changes
      navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange.bind(this));

      // Monitor stream health
      this.monitorStreamHealth();

    } catch (error) {
      console.error('Failed to start audio capture:', error);
      
      if (error instanceof Error && 'code' in error) {
        this.events.onError?.(error as AudioCaptureError);
      } else {
        const audioError = this.createAudioError(
          error instanceof Error ? error.message : 'Unknown error',
          'device',
          true,
          ['Check microphone connection', 'Restart browser', 'Try different device']
        );
        this.events.onError?.(audioError);
      }
      throw error;
    }
  }

  // Stop audio capture
  public async stopCapture(): Promise<void> {
    try {
      if (!this.isCapturing) {
        console.warn('Audio capture not started');
        return;
      }

      // Disconnect and clean up nodes
      if (this.processorNode) {
        this.processorNode.disconnect();
        this.processorNode = null;
      }

      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }

      // Close audio context
      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }

      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      // Remove device change listener
      navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange.bind(this));

      this.isCapturing = false;
      console.log('Audio capture stopped');

    } catch (error) {
      console.error('Failed to stop audio capture:', error);
      this.events.onError?.(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  // Process audio buffer
  private processAudioBuffer(inputBuffer: AudioBuffer): void {
    try {
      // Get audio data
      const audioData = inputBuffer.getChannelData(0); // Get first channel
      
      // Convert to PCM16
      const pcm16Buffer = this.convertToPCM16(audioData);

      // Perform voice activity detection if enabled
      if (this.config.voiceActivityDetection) {
        const voiceActivity = this.detectVoiceActivity(audioData);
        this.handleVoiceActivity(voiceActivity);
      }

      // Send audio data
      this.events.onAudioData?.(pcm16Buffer);

    } catch (error) {
      console.error('Error processing audio buffer:', error);
      this.events.onError?.(error instanceof Error ? error : new Error('Audio processing error'));
    }
  }

  // Convert Float32Array to PCM16 ArrayBuffer
  private convertToPCM16(audioData: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(audioData.length * 2);
    const view = new Int16Array(buffer);

    for (let i = 0; i < audioData.length; i++) {
      // Convert from [-1, 1] to [-32768, 32767]
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      view[i] = Math.round(sample * 32767);
    }

    return buffer;
  }

  // Voice activity detection
  private detectVoiceActivity(audioData: Float32Array): VoiceActivityResult {
    // Calculate energy (RMS)
    let energy = 0;
    for (let i = 0; i < audioData.length; i++) {
      energy += audioData[i] * audioData[i];
    }
    energy = Math.sqrt(energy / audioData.length);

    // Calculate zero crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < audioData.length; i++) {
      if ((audioData[i] >= 0) !== (audioData[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const zeroCrossingRate = zeroCrossings / audioData.length;

    // Simple voice activity detection
    const hasVoice = energy > this.config.silenceThreshold && zeroCrossingRate > 0.01;
    
    // Calculate confidence based on energy and ZCR
    const energyConfidence = Math.min(energy / (this.config.silenceThreshold * 10), 1);
    const zcrConfidence = Math.min(zeroCrossingRate / 0.1, 1);
    const confidence = (energyConfidence + zcrConfidence) / 2;

    return {
      hasVoice,
      energy,
      zeroCrossingRate,
      confidence,
    };
  }

  // Handle voice activity changes
  private handleVoiceActivity(activity: VoiceActivityResult): void {
    const currentTime = Date.now();

    if (activity.hasVoice && !this.lastVoiceActivity) {
      // Voice started
      this.voiceStartTime = currentTime;
      this.events.onVoiceStart?.();
      console.log('Voice activity started');
    } else if (!activity.hasVoice && this.lastVoiceActivity) {
      // Voice ended
      this.silenceStartTime = currentTime;
      this.events.onVoiceEnd?.();
      console.log('Voice activity ended');
    } else if (!activity.hasVoice && currentTime - this.silenceStartTime > 1000) {
      // Extended silence
      this.events.onSilence?.();
    }

    this.lastVoiceActivity = activity.hasVoice;
  }

  // Handle device changes
  private async handleDeviceChange(): Promise<void> {
    try {
      const devices = await AudioCapture.getAudioDevices();
      this.events.onDeviceChange?.(devices);
    } catch (error) {
      console.error('Error handling device change:', error);
    }
  }

  // Get current capture status
  public getStatus(): {
    isCapturing: boolean;
    hasPermission: boolean;
    deviceCount: number;
  } {
    return {
      isCapturing: this.isCapturing,
      hasPermission: !!this.mediaStream,
      deviceCount: this.mediaStream?.getAudioTracks().length || 0,
    };
  }

  // Get current audio levels (for visualization)
  public getCurrentAudioLevel(): number {
    if (!this.audioContext || !this.sourceNode) {
      return 0;
    }

    // This is a simplified implementation
    // In a real application, you might want to use AnalyserNode for more accurate level detection
    return this.lastVoiceActivity ? 0.5 : 0.1;
  }
}

// Audio streaming client
export class AudioStreamingClient {
  private websocket: WebSocket | null = null;
  private audioCapture: AudioCapture;
  private sessionId: string;
  private isStreaming: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastHeartbeat: Date = new Date();
  private serverUrl: string = '';
  private isRecovering: boolean = false;

  constructor(sessionId: string, captureConfig?: Partial<AudioCaptureConfig>) {
    this.sessionId = sessionId;
    this.audioCapture = new AudioCapture(captureConfig);
    this.setupAudioCaptureEvents();
  }

  // Connect to WebSocket server with enhanced error handling
  public async connect(serverUrl: string): Promise<void> {
    try {
      this.serverUrl = serverUrl;
      const wsUrl = `${serverUrl.replace('http', 'ws')}/api/voice/stream?sessionId=${this.sessionId}`;
      
      // Clear any existing connection
      if (this.websocket) {
        this.websocket.close();
      }

      this.websocket = new WebSocket(wsUrl);

      return new Promise((resolve, reject) => {
        if (!this.websocket) {
          reject(new Error('Failed to create WebSocket'));
          return;
        }

        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.websocket?.readyState !== WebSocket.OPEN) {
            this.websocket?.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

        this.websocket.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.isRecovering = false;
          this.lastHeartbeat = new Date();
          
          // Clear connection timeout
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }

          // Start heartbeat
          this.startHeartbeat();
          
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleWebSocketMessage(event);
        };

        this.websocket.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.handleWebSocketCloseWithRecovery(event);
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          
          // Clear connection timeout
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }

          // Emit network error event
          this.audioCapture.events.onNetworkError?.(new Error('WebSocket connection failed'));
          
          reject(new Error('WebSocket connection failed'));
        };
      });
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.audioCapture.events.onNetworkError?.(error instanceof Error ? error : new Error('Connection failed'));
      throw error;
    }
  }

  // Start audio streaming
  public async startStreaming(audioConfig?: any): Promise<void> {
    try {
      if (this.isStreaming) {
        console.warn('Audio streaming already started');
        return;
      }

      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not connected');
      }

      // Send start stream message
      this.sendWebSocketMessage({
        type: 'start_stream',
        sessionId: this.sessionId,
        data: { audioConfig },
        timestamp: Date.now(),
      });

      // Start audio capture
      await this.audioCapture.startCapture();

      this.isStreaming = true;
      console.log('Audio streaming started');

    } catch (error) {
      console.error('Failed to start audio streaming:', error);
      throw error;
    }
  }

  // Stop audio streaming
  public async stopStreaming(): Promise<void> {
    try {
      if (!this.isStreaming) {
        console.warn('Audio streaming not started');
        return;
      }

      // Stop audio capture
      await this.audioCapture.stopCapture();

      // Send stop stream message
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.sendWebSocketMessage({
          type: 'stop_stream',
          sessionId: this.sessionId,
          timestamp: Date.now(),
        });
      }

      this.isStreaming = false;
      console.log('Audio streaming stopped');

    } catch (error) {
      console.error('Failed to stop audio streaming:', error);
    }
  }

  // Disconnect WebSocket
  public disconnect(): void {
    if (this.websocket) {
      this.websocket.close(1000, 'Client disconnect');
      this.websocket = null;
    }
  }

  // Set up audio capture event handlers
  private setupAudioCaptureEvents(): void {
    this.audioCapture.on('onAudioData', (audioData: ArrayBuffer) => {
      this.sendAudioData(audioData);
    });

    this.audioCapture.on('onError', (error: Error) => {
      console.error('Audio capture error:', error);
    });

    this.audioCapture.on('onVoiceStart', () => {
      console.log('Voice activity detected');
    });

    this.audioCapture.on('onVoiceEnd', () => {
      console.log('Voice activity ended');
    });
  }

  // Send audio data via WebSocket
  private sendAudioData(audioData: ArrayBuffer): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN || !this.isStreaming) {
      return;
    }

    try {
      // Convert to base64 for JSON transmission
      const base64Data = audioUtils.arrayBufferToBase64(audioData);

      this.sendWebSocketMessage({
        type: 'audio_chunk',
        sessionId: this.sessionId,
        data: {
          audioData: base64Data,
          sequenceNumber: Date.now(),
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to send audio data:', error);
    }
  }

  // Send WebSocket message
  private sendWebSocketMessage(message: any): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
    }
  }

  // Enhanced WebSocket message handling
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'transcription_result':
          console.log('Transcription result:', message.data);
          window.dispatchEvent(new CustomEvent('transcriptionResult', { detail: message.data }));
          break;

        case 'error':
          console.error('Server error:', message.data.error);
          
          // Handle specific error types
          if (message.data.category === 'voice' && message.data.recoverable) {
            this.audioCapture.events.onRecovery?.('Attempting to recover from voice error...');
          } else {
            const error = new Error(message.data.error);
            this.audioCapture.events.onNetworkError?.(error);
          }
          
          window.dispatchEvent(new CustomEvent('transcriptionError', { detail: message.data }));
          break;

        case 'ping':
          // Respond to server ping
          this.sendWebSocketMessage({
            type: 'pong',
            sessionId: this.sessionId,
            timestamp: Date.now(),
          });
          break;

        case 'pong':
          // Update last heartbeat time
          this.lastHeartbeat = new Date();
          break;

        case 'quality_warning':
          console.warn('Audio quality warning:', message.data);
          if (message.data.metrics) {
            this.audioCapture.events.onQualityWarning?.(message.data.metrics);
          }
          break;

        case 'recovery_suggestion':
          console.log('Recovery suggestion:', message.data.suggestion);
          this.audioCapture.events.onRecovery?.(message.data.suggestion);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  // Enhanced WebSocket close handling with recovery
  private handleWebSocketCloseWithRecovery(event: CloseEvent): void {
    this.isStreaming = false;
    
    // Stop heartbeat
    this.stopHeartbeat();

    // Determine if reconnection should be attempted
    const shouldReconnect = event.code !== 1000 && // Not a normal close
                           event.code !== 1001 && // Not going away
                           this.reconnectAttempts < this.maxReconnectAttempts &&
                           !this.isRecovering;

    if (shouldReconnect) {
      this.isRecovering = true;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      
      console.log(`Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts}) in ${delay}ms...`);
      
      setTimeout(async () => {
        try {
          this.reconnectAttempts++;
          await this.connect(this.serverUrl);
          
          // If we were streaming before, restart streaming
          if (this.audioCapture.getStatus().isCapturing) {
            await this.startStreaming();
          }
          
          this.audioCapture.events.onRecovery?.('Connection restored');
          console.log('WebSocket reconnection successful');
        } catch (error) {
          console.error('WebSocket reconnection failed:', error);
          
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            const networkError = new Error('Maximum reconnection attempts exceeded');
            this.audioCapture.events.onNetworkError?.(networkError);
          }
        }
      }, delay);
    } else if (event.code !== 1000) {
      // Connection failed permanently
      const networkError = new Error(`WebSocket connection lost: ${event.reason || 'Unknown reason'}`);
      this.audioCapture.events.onNetworkError?.(networkError);
    }
  }

  // Start heartbeat to monitor connection health
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.sendWebSocketMessage({
          type: 'ping',
          sessionId: this.sessionId,
          timestamp: Date.now(),
        });
        
        // Check if we've received a recent heartbeat response
        const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat.getTime();
        if (timeSinceLastHeartbeat > 60000) { // 1 minute timeout
          console.warn('Heartbeat timeout detected');
          this.websocket.close(1006, 'Heartbeat timeout');
        }
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  // Stop heartbeat
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Enhanced error handling methods for AudioCapture

  /**
   * Create audio capture error
   */
  private createAudioError(
    message: string,
    category: AudioCaptureError['category'],
    recoverable: boolean,
    suggestions: string[]
  ): AudioCaptureError {
    const error = new Error(message) as AudioCaptureError;
    error.code = `AUDIO_${category.toUpperCase()}`;
    error.category = category;
    error.recoverable = recoverable;
    error.suggestions = suggestions;
    return error;
  }

  /**
   * Test audio stream quality
   */
  private async testAudioStream(stream: MediaStream): Promise<{ success: boolean; error?: string }> {
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        return { success: false, error: 'No audio tracks found' };
      }

      const track = audioTracks[0];
      const settings = track.getSettings();
      
      // Check if settings match our requirements
      if (settings.sampleRate && settings.sampleRate !== this.config.sampleRate) {
        console.warn(`Sample rate mismatch: expected ${this.config.sampleRate}, got ${settings.sampleRate}`);
      }

      if (settings.channelCount && settings.channelCount !== this.config.channels) {
        console.warn(`Channel count mismatch: expected ${this.config.channels}, got ${settings.channelCount}`);
      }

      // Test if track is active
      if (track.readyState !== 'live') {
        return { success: false, error: `Audio track not live: ${track.readyState}` };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown test error' 
      };
    }
  }

  /**
   * Process audio buffer with quality check
   */
  private processAudioBufferWithQualityCheck(inputBuffer: AudioBuffer): void {
    try {
      // Get audio data
      const audioData = inputBuffer.getChannelData(0);
      
      // Calculate quality metrics
      const qualityMetrics = this.calculateAudioQuality(audioData);
      this.lastQualityMetrics = qualityMetrics;

      // Check for quality issues
      if (qualityMetrics.qualityScore < 0.3) {
        this.events.onQualityWarning?.(qualityMetrics);
      }

      // Convert to PCM16
      const pcm16Buffer = this.convertToPCM16(audioData);

      // Perform voice activity detection if enabled
      if (this.config.voiceActivityDetection) {
        const voiceActivity = this.detectVoiceActivity(audioData);
        this.handleVoiceActivity(voiceActivity);
      }

      // Send audio data
      this.events.onAudioData?.(pcm16Buffer);

    } catch (error) {
      console.error('Error processing audio buffer:', error);
      const audioError = this.createAudioError(
        'Audio processing error',
        'format',
        true,
        ['Check microphone connection', 'Restart audio capture']
      );
      this.events.onError?.(audioError);
    }
  }

  /**
   * Calculate audio quality metrics
   */
  private calculateAudioQuality(audioData: Float32Array): AudioQualityMetrics {
    // Calculate RMS (signal level)
    let rms = 0;
    for (let i = 0; i < audioData.length; i++) {
      rms += audioData[i] * audioData[i];
    }
    rms = Math.sqrt(rms / audioData.length);

    // Estimate noise level (using quieter portions)
    const sortedData = Array.from(audioData).map(Math.abs).sort((a, b) => a - b);
    const noiseLevel = sortedData[Math.floor(sortedData.length * 0.1)]; // 10th percentile

    // Calculate SNR
    const signalToNoiseRatio = rms > 0 ? 20 * Math.log10(rms / Math.max(noiseLevel, 0.001)) : 0;

    // Detect clipping
    const clippingThreshold = 0.95;
    const clippingDetected = audioData.some(sample => Math.abs(sample) > clippingThreshold);

    // Calculate overall quality score
    let qualityScore = 0;
    qualityScore += Math.min(rms / 0.1, 1) * 0.4; // Signal strength (40%)
    qualityScore += Math.min(Math.max(signalToNoiseRatio, 0) / 20, 1) * 0.4; // SNR (40%)
    qualityScore += clippingDetected ? 0 : 0.2; // No clipping bonus (20%)

    return {
      signalLevel: rms,
      noiseLevel,
      signalToNoiseRatio,
      clippingDetected,
      qualityScore: Math.min(qualityScore, 1.0),
    };
  }

  /**
   * Start quality monitoring
   */
  private startQualityMonitoring(): void {
    this.qualityCheckInterval = setInterval(() => {
      if (this.lastQualityMetrics && this.lastQualityMetrics.qualityScore < 0.2) {
        const error = this.createAudioError(
          'Poor audio quality detected',
          'quality',
          true,
          [
            'Move closer to the microphone',
            'Reduce background noise',
            'Check microphone connection',
            'Try a different microphone'
          ]
        );
        this.events.onQualityWarning?.(this.lastQualityMetrics);
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Start device monitoring
   */
  private startDeviceMonitoring(): void {
    this.deviceMonitorInterval = setInterval(() => {
      if (this.mediaStream) {
        const audioTracks = this.mediaStream.getAudioTracks();
        if (audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
          const error = this.createAudioError(
            'Audio device disconnected',
            'device',
            true,
            ['Check microphone connection', 'Reconnect audio device']
          );
          this.events.onError?.(error);
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Monitor stream health
   */
  private monitorStreamHealth(): void {
    if (this.mediaStream) {
      const audioTrack = this.mediaStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.addEventListener('ended', () => {
          const error = this.createAudioError(
            'Audio stream ended unexpectedly',
            'device',
            true,
            ['Microphone may have been disconnected', 'Try restarting audio capture']
          );
          this.events.onError?.(error);
        });

        audioTrack.addEventListener('mute', () => {
          console.warn('Audio track muted');
        });

        audioTrack.addEventListener('unmute', () => {
          console.log('Audio track unmuted');
          this.events.onRecovery?.('Audio stream recovered');
        });
      }
    }
  }

  /**
   * Get current audio quality metrics
   */
  public getAudioQualityMetrics(): AudioQualityMetrics | null {
    return this.lastQualityMetrics;
  }

  /**
   * Enhanced stop capture with cleanup
   */
  public async stopCapture(): Promise<void> {
    try {
      if (!this.isCapturing) {
        console.warn('Audio capture not started');
        return;
      }

      // Clear monitoring intervals
      if (this.qualityCheckInterval) {
        clearInterval(this.qualityCheckInterval);
        this.qualityCheckInterval = null;
      }

      if (this.deviceMonitorInterval) {
        clearInterval(this.deviceMonitorInterval);
        this.deviceMonitorInterval = null;
      }

      // Disconnect and clean up nodes
      if (this.processorNode) {
        this.processorNode.disconnect();
        this.processorNode = null;
      }

      if (this.analyserNode) {
        this.analyserNode.disconnect();
        this.analyserNode = null;
      }

      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }

      // Close audio context
      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }

      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      // Remove device change listener
      navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange.bind(this));

      this.isCapturing = false;
      this.lastQualityMetrics = null;
      console.log('Audio capture stopped');

    } catch (error) {
      console.error('Failed to stop audio capture:', error);
      const audioError = this.createAudioError(
        'Error stopping audio capture',
        'device',
        false,
        ['Refresh the page if issues persist']
      );
      this.events.onError?.(audioError);
    }
  }

  // Get streaming status
  public getStatus(): {
    isConnected: boolean;
    isStreaming: boolean;
    captureStatus: any;
  } {
    return {
      isConnected: this.websocket?.readyState === WebSocket.OPEN,
      isStreaming: this.isStreaming,
      captureStatus: this.audioCapture.getStatus(),
    };
  }
}