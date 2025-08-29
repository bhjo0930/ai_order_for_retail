// Audio format validation and conversion utilities

// Supported audio formats
export const SUPPORTED_FORMATS = {
  PCM_16: 'PCM_16',
  WEBM_OPUS: 'WEBM_OPUS',
  MP3: 'MP3',
  WAV: 'WAV',
} as const;

export type SupportedFormat = typeof SUPPORTED_FORMATS[keyof typeof SUPPORTED_FORMATS];

// Audio validation result
export interface AudioValidationResult {
  isValid: boolean;
  format?: SupportedFormat;
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  duration?: number;
  error?: string;
}

// Audio conversion options
export interface AudioConversionOptions {
  targetSampleRate: number;
  targetChannels: number;
  targetFormat: SupportedFormat;
  normalize?: boolean;
}

// Audio metadata
export interface AudioMetadata {
  format: SupportedFormat;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  duration: number;
  size: number;
}

// Default conversion options for Google Cloud Speech-to-Text
export const DEFAULT_CONVERSION_OPTIONS: AudioConversionOptions = {
  targetSampleRate: 16000,
  targetChannels: 1,
  targetFormat: SUPPORTED_FORMATS.PCM_16,
  normalize: true,
};

// Audio format validator
export class AudioValidator {
  // Validate audio buffer format and properties
  static validateAudioBuffer(audioBuffer: ArrayBuffer): AudioValidationResult {
    try {
      if (!audioBuffer || audioBuffer.byteLength === 0) {
        return {
          isValid: false,
          error: 'Empty audio buffer',
        };
      }

      // Check minimum size (at least 1 second of 16kHz mono PCM)
      const minSize = 16000 * 2; // 16kHz * 2 bytes per sample
      if (audioBuffer.byteLength < minSize) {
        return {
          isValid: false,
          error: `Audio buffer too small: ${audioBuffer.byteLength} bytes (minimum: ${minSize} bytes)`,
        };
      }

      // Check maximum size (10 minutes of 16kHz mono PCM)
      const maxSize = 16000 * 2 * 60 * 10; // 10 minutes
      if (audioBuffer.byteLength > maxSize) {
        return {
          isValid: false,
          error: `Audio buffer too large: ${audioBuffer.byteLength} bytes (maximum: ${maxSize} bytes)`,
        };
      }

      // Basic validation passed
      return {
        isValid: true,
        format: SUPPORTED_FORMATS.PCM_16,
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
        duration: audioBuffer.byteLength / (16000 * 2),
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Validate WAV file header
  static validateWavHeader(buffer: ArrayBuffer): AudioValidationResult {
    try {
      const view = new DataView(buffer);

      // Check RIFF header
      const riffHeader = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      );
      if (riffHeader !== 'RIFF') {
        return {
          isValid: false,
          error: 'Invalid WAV file: missing RIFF header',
        };
      }

      // Check WAVE format
      const waveFormat = String.fromCharCode(
        view.getUint8(8),
        view.getUint8(9),
        view.getUint8(10),
        view.getUint8(11)
      );
      if (waveFormat !== 'WAVE') {
        return {
          isValid: false,
          error: 'Invalid WAV file: missing WAVE format',
        };
      }

      // Read format chunk
      const audioFormat = view.getUint16(20, true);
      const channels = view.getUint16(22, true);
      const sampleRate = view.getUint32(24, true);
      const bitDepth = view.getUint16(34, true);

      // Validate format
      if (audioFormat !== 1) {
        return {
          isValid: false,
          error: `Unsupported audio format: ${audioFormat} (only PCM supported)`,
        };
      }

      return {
        isValid: true,
        format: SUPPORTED_FORMATS.WAV,
        sampleRate,
        channels,
        bitDepth,
        duration: (buffer.byteLength - 44) / (sampleRate * channels * (bitDepth / 8)),
      };
    } catch (error) {
      return {
        isValid: false,
        error: `WAV validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Validate audio constraints for Google Cloud Speech-to-Text
  static validateForSpeechAPI(metadata: AudioMetadata): AudioValidationResult {
    const errors: string[] = [];

    // Check sample rate
    if (metadata.sampleRate < 8000 || metadata.sampleRate > 48000) {
      errors.push(`Invalid sample rate: ${metadata.sampleRate}Hz (must be 8000-48000Hz)`);
    }

    // Check channels
    if (metadata.channels > 2) {
      errors.push(`Too many channels: ${metadata.channels} (maximum: 2)`);
    }

    // Check bit depth for PCM
    if (metadata.format === SUPPORTED_FORMATS.PCM_16 && metadata.bitDepth !== 16) {
      errors.push(`Invalid bit depth for PCM: ${metadata.bitDepth} (must be 16)`);
    }

    // Check duration (maximum 10 minutes)
    if (metadata.duration > 600) {
      errors.push(`Audio too long: ${metadata.duration}s (maximum: 600s)`);
    }

    return {
      isValid: errors.length === 0,
      ...metadata,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }
}

// Audio converter class
export class AudioConverter {
  // Convert audio buffer to target format
  static async convertAudioBuffer(
    audioBuffer: ArrayBuffer,
    options: AudioConversionOptions = DEFAULT_CONVERSION_OPTIONS
  ): Promise<ArrayBuffer> {
    try {
      // For now, we'll implement basic PCM conversion
      // In a production environment, you might want to use a more robust audio processing library
      
      if (options.targetFormat !== SUPPORTED_FORMATS.PCM_16) {
        throw new Error(`Unsupported target format: ${options.targetFormat}`);
      }

      // Assume input is already PCM_16 and just validate/resample if needed
      const validation = AudioValidator.validateAudioBuffer(audioBuffer);
      if (!validation.isValid) {
        throw new Error(`Invalid input audio: ${validation.error}`);
      }

      // If already in target format, return as-is
      if (
        validation.sampleRate === options.targetSampleRate &&
        validation.channels === options.targetChannels
      ) {
        return audioBuffer;
      }

      // Basic resampling (this is a simplified implementation)
      return this.resamplePCM16(audioBuffer, validation.sampleRate!, options.targetSampleRate);
    } catch (error) {
      throw new Error(`Audio conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Convert WAV to PCM_16
  static convertWavToPCM16(wavBuffer: ArrayBuffer): ArrayBuffer {
    try {
      const validation = AudioValidator.validateWavHeader(wavBuffer);
      if (!validation.isValid) {
        throw new Error(`Invalid WAV file: ${validation.error}`);
      }

      // Extract PCM data (skip 44-byte WAV header)
      const pcmData = wavBuffer.slice(44);
      
      // If already 16-bit mono at 16kHz, return as-is
      if (
        validation.sampleRate === 16000 &&
        validation.channels === 1 &&
        validation.bitDepth === 16
      ) {
        return pcmData;
      }

      // Convert to target format
      return this.resamplePCM16(pcmData, validation.sampleRate!, 16000);
    } catch (error) {
      throw new Error(`WAV to PCM conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Basic PCM resampling (simplified linear interpolation)
  private static resamplePCM16(
    inputBuffer: ArrayBuffer,
    inputSampleRate: number,
    outputSampleRate: number
  ): ArrayBuffer {
    if (inputSampleRate === outputSampleRate) {
      return inputBuffer;
    }

    const inputView = new Int16Array(inputBuffer);
    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.floor(inputView.length / ratio);
    const outputBuffer = new ArrayBuffer(outputLength * 2);
    const outputView = new Int16Array(outputBuffer);

    for (let i = 0; i < outputLength; i++) {
      const inputIndex = i * ratio;
      const inputIndexFloor = Math.floor(inputIndex);
      const inputIndexCeil = Math.min(inputIndexFloor + 1, inputView.length - 1);
      const fraction = inputIndex - inputIndexFloor;

      // Linear interpolation
      const sample1 = inputView[inputIndexFloor];
      const sample2 = inputView[inputIndexCeil];
      outputView[i] = Math.round(sample1 + (sample2 - sample1) * fraction);
    }

    return outputBuffer;
  }

  // Normalize audio levels
  static normalizeAudio(audioBuffer: ArrayBuffer): ArrayBuffer {
    try {
      const view = new Int16Array(audioBuffer);
      const output = new Int16Array(view.length);

      // Find peak amplitude
      let peak = 0;
      for (let i = 0; i < view.length; i++) {
        peak = Math.max(peak, Math.abs(view[i]));
      }

      if (peak === 0) {
        return audioBuffer; // Silent audio
      }

      // Calculate normalization factor (target 90% of max amplitude)
      const targetPeak = 32767 * 0.9;
      const normalizationFactor = targetPeak / peak;

      // Apply normalization
      for (let i = 0; i < view.length; i++) {
        output[i] = Math.round(view[i] * normalizationFactor);
      }

      return output.buffer;
    } catch (error) {
      throw new Error(`Audio normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Apply noise gate to reduce background noise
  static applyNoiseGate(audioBuffer: ArrayBuffer, threshold: number = 1000): ArrayBuffer {
    try {
      const view = new Int16Array(audioBuffer);
      const output = new Int16Array(view.length);

      for (let i = 0; i < view.length; i++) {
        if (Math.abs(view[i]) < threshold) {
          output[i] = 0; // Silence below threshold
        } else {
          output[i] = view[i];
        }
      }

      return output.buffer;
    } catch (error) {
      throw new Error(`Noise gate failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Audio quality analyzer
export class AudioQualityAnalyzer {
  // Analyze audio quality metrics
  static analyzeQuality(audioBuffer: ArrayBuffer): {
    snr: number;
    rms: number;
    peak: number;
    dynamicRange: number;
    quality: 'poor' | 'fair' | 'good' | 'excellent';
  } {
    try {
      const view = new Int16Array(audioBuffer);
      
      // Calculate RMS (Root Mean Square)
      let sumSquares = 0;
      let peak = 0;
      
      for (let i = 0; i < view.length; i++) {
        const sample = view[i];
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      
      const rms = Math.sqrt(sumSquares / view.length);
      
      // Estimate SNR (simplified)
      const signalPower = rms * rms;
      const noisePower = this.estimateNoisePower(view);
      const snr = signalPower > 0 ? 10 * Math.log10(signalPower / noisePower) : 0;
      
      // Calculate dynamic range
      const dynamicRange = peak > 0 ? 20 * Math.log10(peak / 32767) : -Infinity;
      
      // Determine quality rating
      let quality: 'poor' | 'fair' | 'good' | 'excellent';
      if (snr > 20 && rms > 1000) {
        quality = 'excellent';
      } else if (snr > 15 && rms > 500) {
        quality = 'good';
      } else if (snr > 10 && rms > 200) {
        quality = 'fair';
      } else {
        quality = 'poor';
      }
      
      return {
        snr,
        rms,
        peak,
        dynamicRange,
        quality,
      };
    } catch (error) {
      throw new Error(`Quality analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Estimate noise power (simplified approach)
  private static estimateNoisePower(view: Int16Array): number {
    // Use the quietest 10% of samples as noise estimate
    const samples = Array.from(view).map(Math.abs).sort((a, b) => a - b);
    const noiseCount = Math.floor(samples.length * 0.1);
    const noiseSamples = samples.slice(0, noiseCount);
    
    const noiseRms = Math.sqrt(
      noiseSamples.reduce((sum, sample) => sum + sample * sample, 0) / noiseSamples.length
    );
    
    return noiseRms * noiseRms;
  }
}

// Utility functions
export const audioUtils = {
  // Convert base64 to ArrayBuffer
  base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  },

  // Convert ArrayBuffer to base64
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  // Create silence buffer
  createSilence(durationMs: number, sampleRate: number = 16000): ArrayBuffer {
    const samples = Math.floor((durationMs / 1000) * sampleRate);
    const buffer = new ArrayBuffer(samples * 2);
    return buffer; // Already filled with zeros
  },

  // Concatenate audio buffers
  concatenateBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const buffer of buffers) {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return result.buffer;
  },

  // Split audio buffer into chunks
  splitBuffer(buffer: ArrayBuffer, chunkSize: number): ArrayBuffer[] {
    const chunks: ArrayBuffer[] = [];
    let offset = 0;

    while (offset < buffer.byteLength) {
      const remainingBytes = buffer.byteLength - offset;
      const currentChunkSize = Math.min(chunkSize, remainingBytes);
      const chunk = buffer.slice(offset, offset + currentChunkSize);
      chunks.push(chunk);
      offset += currentChunkSize;
    }

    return chunks;
  },
};