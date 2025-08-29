import { NextWebSocketHandler } from 'next-ws';
import { SpeechClient } from '@google-cloud/speech/v2';
import { logger } from '@/lib/logger';

const speechClient = new SpeechClient();

export const GET: NextWebSocketHandler = async (client, req) => {
  logger.info('WebSocket connection established');

  const recognitionConfig = {
    autoDecodingConfig: {},
    model: 'long',
    languageCodes: ['ko-KR'],
    features: {
      enableAutomaticPunctuation: true,
    },
  };

  const streamingConfig = {
    config: recognitionConfig,
    streamingFeatures: {
      interimResults: true,
    },
  };

  const recognizeStream = speechClient.streamingRecognize()
    .on('error', (err) => {
      logger.error('Recognition error:', { error: err });
      client.close();
    })
    .on('data', (data) => {
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const transcription = result.alternatives[0].transcript;
        logger.debug(`Transcription: ${transcription}`);
        client.send(JSON.stringify({
          isFinal: result.isFinal,
          text: transcription,
        }));
      }
    });

  recognizeStream.write(streamingConfig);

  client.on('message', (message) => {
    // Assuming the client sends raw audio data as ArrayBuffer
    // The first message is the config, subsequent messages are audio chunks
    recognizeStream.write({ audio: message });
  });

  client.on('close', () => {
    logger.info('WebSocket connection closed');
    recognizeStream.end();
  });
};
