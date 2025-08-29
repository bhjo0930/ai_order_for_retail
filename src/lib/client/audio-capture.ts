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
  private isCapturing: boolean = false;
  private config: AudioCaptureConfig;
  private events: Partial<AudioCaptureEvents> = {};
  private voiceActivityBuffer: Float32Array[] = [];
  private lastVoiceActivity: boolean = false;
  private silenceStartTime: number = 0;
  private voiceStartTime: number = 0;

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

  // Request microphone permissions
  public async requestPermissions(): Promise<boolean> {
    try {
      if (!AudioCapture.isSupported()) {
        throw new Error('Audio capture not supported in this browser');
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
        },
      });

      // Stop the test stream
      stream.getTracks().forEach(track => track.stop());

      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      this.events.onPermissionDenied?.();
      return false;
    }
  }

  // Start audio capture
  public async startCapture(deviceId?: string): Promise<void> {
    try {
      if (this.isCapturing) {
        console.warn('Audio capture already started');
        return;
      }

      // Request permissions first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Microphone permission required');
      }

      // Get media stream
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
        },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create audio context
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Create source node
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create processor node for audio processing
      this.processorNode = this.audioContext.createScriptProcessor(
        this.config.bufferSize,
        this.config.channels,
        this.config.channels
      );

      // Set up audio processing
      this.processorNode.onaudioprocess = (event) => {
        this.processAudioBuffer(event.inputBuffer);
      };

      // Connect nodes
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isCapturing = true;
      console.log('Audio capture started');

      // Monitor device changes
      navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange.bind(this));

    } catch (error) {
      console.error('Failed to start audio capture:', error);
      this.events.onError?.(error instanceof Error ? error : new Error('Unknown error'));
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

  constructor(sessionId: string, captureConfig?: Partial<AudioCaptureConfig>) {
    this.sessionId = sessionId;
    this.audioCapture = new AudioCapture(captureConfig);
    this.setupAudioCaptureEvents();
  }

  // Connect to WebSocket server
  public async connect(serverUrl: string): Promise<void> {
    try {
      const wsUrl = `${serverUrl.replace('http', 'ws')}/api/voice/stream?sessionId=${this.sessionId}`;
      
      this.websocket = new WebSocket(wsUrl);

      return new Promise((resolve, reject) => {
        if (!this.websocket) {
          reject(new Error('Failed to create WebSocket'));
          return;
        }

        this.websocket.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleWebSocketMessage(event);
        };

        this.websocket.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.handleWebSocketClose(event);
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(new Error('WebSocket connection failed'));
        };

        // Connection timeout
        setTimeout(() => {
          if (this.websocket?.readyState !== WebSocket.OPEN) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);
      });
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
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

  // Handle WebSocket messages
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'transcription_result':
          console.log('Transcription result:', message.data);
          // Emit custom event for transcription results
          window.dispatchEvent(new CustomEvent('transcriptionResult', { detail: message.data }));
          break;

        case 'error':
          console.error('Server error:', message.data.error);
          window.dispatchEvent(new CustomEvent('transcriptionError', { detail: message.data }));
          break;

        case 'ping':
          console.log('Server ping:', message.data);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  // Handle WebSocket close
  private handleWebSocketClose(event: CloseEvent): void {
    this.isStreaming = false;

    // Attempt reconnection if not a normal close
    if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log(`Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.reconnectAttempts++;
        // Note: You would need to store the server URL to reconnect
        // this.connect(serverUrl);
      }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
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