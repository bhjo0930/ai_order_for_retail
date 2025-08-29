import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceProcessingServiceImpl, DEFAULT_AUDIO_CONFIG, AudioConfig, TranscriptionResult } from '../voice-processing';

// Mock Google Cloud Speech client
const mockRecognizeStream = {
  write: vi.fn(),
  end: vi.fn(),
  on: vi.fn().mockReturnThis(),
};

const mockSpeechClient = {
  streamingRecognize: vi.fn().mockReturnValue(mockRecognizeStream),
};

vi.mock('@google-cloud/speech', () => ({
  SpeechClient: vi.fn(() => mockSpeechClient),
}));

// Mock error handler
vi.mock('../error-handler', () => ({
  errorHandler: {
    handleVoiceError: vi.fn().mockResolvedValue({
      success: true,
      actions: [{ type: 'retry' }],
    }),
  },
}));

// Mock fetch for network connectivity check
global.fetch = vi.fn();

describe('VoiceProcessingServiceImpl', () => {
  let voiceService: VoiceProcessingServiceImpl;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    // Set up environment variables
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = 'test-credentials.json';

    voiceService = new VoiceProcessingServiceImpl();
    vi.clearAllMocks();

    // Mock successful network check
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_CLOUD_PROJECT_ID;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  describe('startAudioStream', () => {
    it('should start audio stream successfully with default config', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      
      const streamConnection = await voiceService.startAudioStream(sessionId, config);

      expect(streamConnection).toBeDefined();
      expect(streamConnection.sessionId).toBe(sessionId);
      expect(streamConnection.isActive).toBe(true);
      expect(streamConnection.audioConfig).toEqual(config);
      expect(mockSpeechClient.streamingRecognize).toHaveBeenCalledWith({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          audioChannelCount: 1,
          languageCode: 'ko-KR',
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
          model: 'latest_long',
          useEnhanced: true,
          alternativeLanguageCodes: ['en-US', 'ja-JP'],
        },
        interimResults: true,
        enableVoiceActivityEvents: true,
      });
    });

    it('should validate audio configuration', async () => {
      const invalidConfig: AudioConfig = {
        ...DEFAULT_AUDIO_CONFIG,
        sampleRate: 8000, // Invalid sample rate
      };

      await expect(voiceService.startAudioStream(sessionId, invalidConfig))
        .rejects.toThrow('Sample rate must be 16000 Hz');
    });

    it('should validate channels configuration', async () => {
      const invalidConfig: AudioConfig = {
        ...DEFAULT_AUDIO_CONFIG,
        channels: 2, // Invalid channels
      };

      await expect(voiceService.startAudioStream(sessionId, invalidConfig))
        .rejects.toThrow('Audio must be mono (1 channel)');
    });

    it('should validate encoding configuration', async () => {
      const invalidConfig: AudioConfig = {
        ...DEFAULT_AUDIO_CONFIG,
        encoding: 'MP3' as any, // Invalid encoding
      };

      await expect(voiceService.startAudioStream(sessionId, invalidConfig))
        .rejects.toThrow('Audio encoding must be PCM_16');
    });

    it('should stop existing stream before starting new one', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      
      // Start first stream
      await voiceService.startAudioStream(sessionId, config);
      
      // Start second stream (should stop first one)
      await voiceService.startAudioStream(sessionId, config);

      expect(mockRecognizeStream.end).toHaveBeenCalled();
    });

    it('should handle network connectivity issues', async () => {
      // Mock network failure
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      
      const config = { ...DEFAULT_AUDIO_CONFIG };

      await expect(voiceService.startAudioStream(sessionId, config))
        .rejects.toThrow('Network connectivity required for voice recognition');
    });

    it('should set up stream event handlers', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      
      await voiceService.startAudioStream(sessionId, config);

      expect(mockRecognizeStream.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRecognizeStream.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockRecognizeStream.on).toHaveBeenCalledWith('end', expect.any(Function));
    });
  });

  describe('stopAudioStream', () => {
    it('should stop active audio stream', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      
      // Start stream first
      await voiceService.startAudioStream(sessionId, config);
      
      // Stop stream
      await voiceService.stopAudioStream(sessionId);

      expect(mockRecognizeStream.end).toHaveBeenCalled();
    });

    it('should handle stopping non-existent stream gracefully', async () => {
      // Should not throw
      await expect(voiceService.stopAudioStream('non-existent-session'))
        .resolves.not.toThrow();
    });

    it('should remove transcription callback when stopping', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      const callback = vi.fn();
      
      // Start stream and set callback
      await voiceService.startAudioStream(sessionId, config);
      voiceService.onTranscriptionResult(sessionId, callback);
      
      // Stop stream
      await voiceService.stopAudioStream(sessionId);

      // Callback should be removed
      const callbacks = voiceService.getTranscriptionCallbacks();
      expect(callbacks.has(sessionId)).toBe(false);
    });
  });

  describe('processAudioChunk', () => {
    it('should process audio chunk successfully', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      const audioData = new ArrayBuffer(1024);
      
      // Start stream first
      await voiceService.startAudioStream(sessionId, config);
      
      // Process audio chunk
      await voiceService.processAudioChunk(sessionId, audioData);

      expect(mockRecognizeStream.write).toHaveBeenCalledWith(Buffer.from(audioData));
    });

    it('should throw error for non-existent stream', async () => {
      const audioData = new ArrayBuffer(1024);

      await expect(voiceService.processAudioChunk('non-existent-session', audioData))
        .rejects.toThrow('No active stream found for session: non-existent-session');
    });

    it('should handle empty audio data gracefully', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      const emptyAudioData = new ArrayBuffer(0);
      
      // Start stream first
      await voiceService.startAudioStream(sessionId, config);
      
      // Should not throw, but should not write to stream
      await voiceService.processAudioChunk(sessionId, emptyAudioData);

      expect(mockRecognizeStream.write).not.toHaveBeenCalled();
    });
  });

  describe('setLanguage', () => {
    it('should update language and restart stream', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      
      // Start stream first
      await voiceService.startAudioStream(sessionId, config);
      
      // Change language
      await voiceService.setLanguage(sessionId, 'en-US');

      // Should have stopped and restarted stream
      expect(mockRecognizeStream.end).toHaveBeenCalled();
      expect(mockSpeechClient.streamingRecognize).toHaveBeenCalledTimes(2);
    });

    it('should throw error for non-existent stream', async () => {
      await expect(voiceService.setLanguage('non-existent-session', 'en-US'))
        .rejects.toThrow('No active stream found for session: non-existent-session');
    });
  });

  describe('transcription callbacks', () => {
    it('should register and call transcription callback', async () => {
      const callback = vi.fn();
      
      voiceService.onTranscriptionResult(sessionId, callback);
      
      const callbacks = voiceService.getTranscriptionCallbacks();
      expect(callbacks.has(sessionId)).toBe(true);
      expect(callbacks.get(sessionId)).toBe(callback);
    });

    it('should remove transcription callback', async () => {
      const callback = vi.fn();
      
      voiceService.onTranscriptionResult(sessionId, callback);
      voiceService.removeTranscriptionCallback(sessionId);
      
      const callbacks = voiceService.getTranscriptionCallbacks();
      expect(callbacks.has(sessionId)).toBe(false);
    });
  });

  describe('getDevicePermissions', () => {
    it('should return placeholder permissions for server-side', async () => {
      const permissions = await voiceService.getDevicePermissions();

      expect(permissions).toEqual({
        audio: true,
        granted: true,
      });
    });
  });

  describe('network monitoring', () => {
    it('should check network connectivity', async () => {
      // Mock successful network response
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
      } as Response);

      const networkStatus = voiceService.getNetworkStatus();
      
      expect(networkStatus.isOnline).toBe(true);
      expect(networkStatus.consecutiveFailures).toBe(0);
    });

    it('should handle network connectivity failure', async () => {
      // Mock network failure
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      // Trigger network check by starting a stream
      const config = { ...DEFAULT_AUDIO_CONFIG };
      
      await expect(voiceService.startAudioStream(sessionId, config))
        .rejects.toThrow('Network connectivity required for voice recognition');
    });
  });

  describe('error handling', () => {
    it('should handle stream errors with recovery', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      let errorHandler: Function;
      
      // Capture the error handler
      mockRecognizeStream.on.mockImplementation((event, handler) => {
        if (event === 'error') {
          errorHandler = handler;
        }
        return mockRecognizeStream;
      });

      await voiceService.startAudioStream(sessionId, config);
      
      // Simulate stream error
      const error = new Error('Stream error');
      errorHandler!(error);

      // Should have called error handler
      expect(vi.mocked(require('../error-handler').errorHandler.handleVoiceError))
        .toHaveBeenCalledWith(sessionId, expect.any(Object), 0);
    });

    it('should handle transcription data processing', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      const callback = vi.fn();
      let dataHandler: Function;
      
      // Capture the data handler
      mockRecognizeStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          dataHandler = handler;
        }
        return mockRecognizeStream;
      });

      await voiceService.startAudioStream(sessionId, config);
      voiceService.onTranscriptionResult(sessionId, callback);
      
      // Simulate transcription data
      const mockData = {
        results: [{
          alternatives: [{
            transcript: '안녕하세요',
            confidence: 0.95,
          }],
          isFinal: true,
        }],
      };

      dataHandler!(mockData);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        sessionId,
        text: '안녕하세요',
        confidence: 0.95,
        isFinal: true,
      }));
    });
  });

  describe('language support', () => {
    it('should get alternative languages for Korean', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG, languageCode: 'ko-KR' };
      
      await voiceService.startAudioStream(sessionId, config);

      expect(mockSpeechClient.streamingRecognize).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            alternativeLanguageCodes: ['en-US', 'ja-JP'],
          }),
        })
      );
    });

    it('should get alternative languages for English', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG, languageCode: 'en-US' };
      
      await voiceService.startAudioStream(sessionId, config);

      expect(mockSpeechClient.streamingRecognize).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            alternativeLanguageCodes: ['ko-KR', 'en-GB'],
          }),
        })
      );
    });

    it('should handle setLanguageWithFallback', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      
      // Start stream first
      await voiceService.startAudioStream(sessionId, config);
      
      // Mock setLanguage to fail first, then succeed
      const originalSetLanguage = voiceService.setLanguage;
      let callCount = 0;
      vi.spyOn(voiceService, 'setLanguage').mockImplementation(async (sessionId, languageCode) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Language not supported');
        }
        return originalSetLanguage.call(voiceService, sessionId, languageCode);
      });

      await voiceService.setLanguageWithFallback(sessionId, 'unsupported-lang');

      expect(voiceService.setLanguage).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      
      // Start multiple streams
      await voiceService.startAudioStream('session1', config);
      await voiceService.startAudioStream('session2', config);
      
      // Cleanup
      await voiceService.cleanup();

      expect(mockRecognizeStream.end).toHaveBeenCalledTimes(2);
    });
  });

  describe('audio quality assessment', () => {
    it('should assess transcription quality', async () => {
      const config = { ...DEFAULT_AUDIO_CONFIG };
      const callback = vi.fn();
      let dataHandler: Function;
      
      // Capture the data handler
      mockRecognizeStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          dataHandler = handler;
        }
        return mockRecognizeStream;
      });

      await voiceService.startAudioStream(sessionId, config);
      voiceService.onTranscriptionResult(sessionId, callback);
      
      // Simulate low quality transcription (should be filtered)
      const lowQualityData = {
        results: [{
          alternatives: [{
            transcript: 'a', // Very short transcript
            confidence: 0.1, // Low confidence
          }],
          isFinal: false,
        }],
      };

      dataHandler!(lowQualityData);

      // Should not call callback for low quality interim results
      expect(callback).not.toHaveBeenCalled();

      // Simulate high quality transcription
      const highQualityData = {
        results: [{
          alternatives: [{
            transcript: '안녕하세요 아메리카노 주문하고 싶어요',
            confidence: 0.9,
            words: [
              { confidence: 0.95 },
              { confidence: 0.85 },
              { confidence: 0.9 },
            ],
          }],
          isFinal: false,
        }],
      };

      dataHandler!(highQualityData);

      // Should call callback for high quality results
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        text: '안녕하세요 아메리카노 주문하고 싶어요',
        confidence: 0.9,
      }));
    });
  });
});