'use client';

import { useVoiceRecording } from '../lib/hooks/useVoiceRecording';
import { useState, useEffect } from 'react';

interface VoiceRecorderProps {
  onTranscription?: (text: string) => void;
  className?: string;
}

export function VoiceRecorder({ onTranscription, className = '' }: VoiceRecorderProps) {
  const voiceRecording = useVoiceRecording({
    onTranscription: (result) => {
      if (result.isFinal && onTranscription) {
        onTranscription(result.text);
      }
    },
  });

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

  // Load audio devices on mount
  useEffect(() => {
    voiceRecording.getAudioDevices().then(setAudioDevices);
  }, []);

  // Audio level visualization
  const audioLevelBars = Array.from({ length: 10 }, (_, i) => (
    <div
      key={i}
      className={`w-1 bg-green-500 transition-all duration-100 ${
        voiceRecording.audioLevel * 10 > i ? 'h-4' : 'h-1'
      }`}
    />
  ));

  return (
    <div className={`p-6 bg-white rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Voice Recorder</h3>
        <p className="text-sm text-gray-600">
          {voiceRecording.hasPermission 
            ? 'Ready to record' 
            : 'Microphone permission required'
          }
        </p>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            voiceRecording.isConnected ? 'bg-green-500' : 'bg-red-500'
          }`} />
          <span className="text-sm text-gray-600">
            {voiceRecording.isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            voiceRecording.hasPermission ? 'bg-green-500' : 'bg-yellow-500'
          }`} />
          <span className="text-sm text-gray-600">
            {voiceRecording.hasPermission ? 'Mic Ready' : 'Mic Blocked'}
          </span>
        </div>

        {voiceRecording.isRecording && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-600">Recording</span>
          </div>
        )}
      </div>

      {/* Audio level visualization */}
      {voiceRecording.isRecording && (
        <div className="flex items-end gap-1 h-6 mb-4">
          {audioLevelBars}
        </div>
      )}

      {/* Control buttons */}
      <div className="flex gap-3 mb-4">
        {!voiceRecording.hasPermission ? (
          <button
            onClick={voiceRecording.checkPermissions}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Grant Permission
          </button>
        ) : (
          <>
            <button
              onClick={voiceRecording.toggleRecording}
              disabled={voiceRecording.isProcessing}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                voiceRecording.isRecording
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              } ${voiceRecording.isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {voiceRecording.isProcessing
                ? 'Processing...'
                : voiceRecording.isRecording
                ? 'Stop Recording'
                : 'Start Recording'
              }
            </button>

            {voiceRecording.hasTranscription && (
              <button
                onClick={voiceRecording.clearTranscription}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Clear
              </button>
            )}
          </>
        )}
      </div>

      {/* Error display */}
      {voiceRecording.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{voiceRecording.error}</p>
        </div>
      )}

      {/* Transcription display */}
      <div className="space-y-3">
        {voiceRecording.partialTranscription && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 font-medium">Partial:</p>
            <p className="text-sm text-yellow-700 italic">
              {voiceRecording.partialTranscription}
            </p>
          </div>
        )}

        {voiceRecording.transcription && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800 font-medium">Final:</p>
            <p className="text-sm text-green-700">
              {voiceRecording.transcription}
            </p>
          </div>
        )}
      </div>

      {/* Audio devices info */}
      {audioDevices.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-gray-600 cursor-pointer">
            Audio Devices ({audioDevices.length})
          </summary>
          <div className="mt-2 space-y-1">
            {audioDevices.map((device, index) => (
              <div key={device.deviceId || index} className="text-xs text-gray-500">
                {device.label || `Device ${index + 1}`}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Voice activity indicator */}
      {voiceRecording.voiceActivity && (
        <div className="mt-4 flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-xs text-blue-600">Voice detected</span>
        </div>
      )}
    </div>
  );
}

// Simple usage example component
export function VoiceRecorderExample() {
  const [transcriptions, setTranscriptions] = useState<string[]>([]);

  const handleTranscription = (text: string) => {
    if (text.trim()) {
      setTranscriptions(prev => [...prev, text]);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Voice Recording Demo
      </h2>
      
      <VoiceRecorder 
        onTranscription={handleTranscription}
        className="mb-6"
      />

      {transcriptions.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-3">
            Transcription History
          </h3>
          <div className="space-y-2">
            {transcriptions.map((text, index) => (
              <div key={index} className="p-2 bg-white rounded border">
                <span className="text-xs text-gray-500">#{index + 1}</span>
                <p className="text-sm text-gray-800">{text}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => setTranscriptions([])}
            className="mt-3 px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Clear History
          </button>
        </div>
      )}
    </div>
  );
}