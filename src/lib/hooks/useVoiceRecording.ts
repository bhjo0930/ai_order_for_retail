'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AudioCapture, AudioStreamingClient, AudioCaptureConfig } from '../client/audio-capture';
import { TranscriptionResult } from '../services/voice-processing';

// Voice recording state
export interface VoiceRecordingState {
  isRecording: boolean;
  isConnected: boolean;
  hasPermission: boolean;
  isProcessing: boolean;
  error: string | null;
  transcription: string;
  partialTranscription: string;
  audioLevel: number;
  voiceActivity: boolean;
}

// Voice recording options
export interface VoiceRecordingOptions {
  serverUrl?: string;
  sessionId?: string;
  audioConfig?: Partial<AudioCaptureConfig>;
  autoStart?: boolean;
  onTranscription?: (result: TranscriptionResult) => void;
  onError?: (error: Error) => void;
  onVoiceStart?: () => void;
  onVoiceEnd?: () => void;
}

// Default options
const DEFAULT_OPTIONS: VoiceRecordingOptions = {
  serverUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  autoStart: false,
};

// Voice recording hook
export function useVoiceRecording(options: VoiceRecordingOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // State
  const [state, setState] = useState<VoiceRecordingState>({
    isRecording: false,
    isConnected: false,
    hasPermission: false,
    isProcessing: false,
    error: null,
    transcription: '',
    partialTranscription: '',
    audioLevel: 0,
    voiceActivity: false,
  });

  // Refs
  const streamingClientRef = useRef<AudioStreamingClient | null>(null);
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize streaming client
  useEffect(() => {
    if (!opts.sessionId) return;

    streamingClientRef.current = new AudioStreamingClient(opts.sessionId, opts.audioConfig);

    // Set up event listeners
    const handleTranscriptionResult = (event: CustomEvent<TranscriptionResult>) => {
      const result = event.detail;
      
      setState(prev => ({
        ...prev,
        isProcessing: false,
        transcription: result.isFinal ? result.text : prev.transcription,
        partialTranscription: result.isFinal ? '' : result.text,
      }));

      opts.onTranscription?.(result);
    };

    const handleTranscriptionError = (event: CustomEvent<any>) => {
      const error = new Error(event.detail.error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error.message,
      }));

      opts.onError?.(error);
    };

    // Add event listeners
    window.addEventListener('transcriptionResult', handleTranscriptionResult as EventListener);
    window.addEventListener('transcriptionError', handleTranscriptionError as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('transcriptionResult', handleTranscriptionResult as EventListener);
      window.removeEventListener('transcriptionError', handleTranscriptionError as EventListener);
      
      if (streamingClientRef.current) {
        streamingClientRef.current.stopStreaming();
        streamingClientRef.current.disconnect();
      }

      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
      }
    };
  }, [opts.sessionId]);

  // Check permissions on mount
  useEffect(() => {
    checkPermissions();
  }, []);

  // Auto-start if enabled
  useEffect(() => {
    if (opts.autoStart && state.hasPermission && !state.isRecording) {
      startRecording();
    }
  }, [opts.autoStart, state.hasPermission]);

  // Check microphone permissions
  const checkPermissions = useCallback(async () => {
    try {
      if (!AudioCapture.isSupported()) {
        throw new Error('Audio recording not supported in this browser');
      }

      const audioCapture = new AudioCapture();
      const hasPermission = await audioCapture.requestPermissions();
      
      setState(prev => ({
        ...prev,
        hasPermission,
        error: hasPermission ? null : 'Microphone permission denied',
      }));

      return hasPermission;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Permission check failed';
      setState(prev => ({
        ...prev,
        hasPermission: false,
        error: errorMessage,
      }));
      return false;
    }
  }, []);

  // Connect to server
  const connect = useCallback(async () => {
    try {
      if (!streamingClientRef.current || !opts.serverUrl) {
        throw new Error('Streaming client not initialized');
      }

      setState(prev => ({ ...prev, error: null }));
      
      await streamingClientRef.current.connect(opts.serverUrl);
      
      setState(prev => ({ ...prev, isConnected: true }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setState(prev => ({
        ...prev,
        isConnected: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, [opts.serverUrl]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      if (!streamingClientRef.current) {
        throw new Error('Streaming client not initialized');
      }

      setState(prev => ({ ...prev, error: null, isProcessing: true }));

      // Check permissions first
      if (!state.hasPermission) {
        const hasPermission = await checkPermissions();
        if (!hasPermission) {
          throw new Error('Microphone permission required');
        }
      }

      // Connect if not connected
      if (!state.isConnected) {
        await connect();
      }

      // Start streaming
      await streamingClientRef.current.startStreaming(opts.audioConfig);

      setState(prev => ({
        ...prev,
        isRecording: true,
        transcription: '',
        partialTranscription: '',
      }));

      // Start audio level monitoring
      audioLevelIntervalRef.current = setInterval(() => {
        if (streamingClientRef.current) {
          const status = streamingClientRef.current.getStatus();
          setState(prev => ({
            ...prev,
            audioLevel: Math.random() * 0.5 + 0.1, // Simplified for demo
            voiceActivity: status.isStreaming,
          }));
        }
      }, 100);

      console.log('Voice recording started');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording';
      setState(prev => ({
        ...prev,
        isRecording: false,
        isProcessing: false,
        error: errorMessage,
      }));
      opts.onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [state.hasPermission, state.isConnected, opts.audioConfig, checkPermissions, connect]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    try {
      if (!streamingClientRef.current) {
        return;
      }

      await streamingClientRef.current.stopStreaming();

      setState(prev => ({
        ...prev,
        isRecording: false,
        isProcessing: false,
        voiceActivity: false,
        audioLevel: 0,
      }));

      // Clear audio level monitoring
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
        audioLevelIntervalRef.current = null;
      }

      console.log('Voice recording stopped');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop recording';
      setState(prev => ({
        ...prev,
        error: errorMessage,
      }));
      opts.onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, []);

  // Toggle recording
  const toggleRecording = useCallback(async () => {
    if (state.isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [state.isRecording, startRecording, stopRecording]);

  // Clear transcription
  const clearTranscription = useCallback(() => {
    setState(prev => ({
      ...prev,
      transcription: '',
      partialTranscription: '',
      error: null,
    }));
  }, []);

  // Get available audio devices
  const getAudioDevices = useCallback(async () => {
    try {
      return await AudioCapture.getAudioDevices();
    } catch (error) {
      console.error('Failed to get audio devices:', error);
      return [];
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (streamingClientRef.current) {
      streamingClientRef.current.disconnect();
      setState(prev => ({ ...prev, isConnected: false }));
    }
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    startRecording,
    stopRecording,
    toggleRecording,
    clearTranscription,
    checkPermissions,
    connect,
    disconnect,
    getAudioDevices,
    
    // Computed values
    canRecord: state.hasPermission && !state.error,
    isActive: state.isRecording || state.isProcessing,
    hasTranscription: state.transcription.length > 0 || state.partialTranscription.length > 0,
  };
}

// Voice recording context for sharing state across components
import { createContext, useContext, ReactNode } from 'react';

interface VoiceRecordingContextType {
  voiceRecording: ReturnType<typeof useVoiceRecording>;
}

const VoiceRecordingContext = createContext<VoiceRecordingContextType | null>(null);

export function VoiceRecordingProvider({ 
  children, 
  options 
}: { 
  children: ReactNode; 
  options?: VoiceRecordingOptions;
}) {
  const voiceRecording = useVoiceRecording(options);

  return (
    <VoiceRecordingContext.Provider value={{ voiceRecording }}>
      {children}
    </VoiceRecordingContext.Provider>
  );
}

export function useVoiceRecordingContext() {
  const context = useContext(VoiceRecordingContext);
  if (!context) {
    throw new Error('useVoiceRecordingContext must be used within VoiceRecordingProvider');
  }
  return context.voiceRecording;
}