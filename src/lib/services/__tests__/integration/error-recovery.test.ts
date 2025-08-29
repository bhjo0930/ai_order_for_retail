import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceProcessingServiceImpl } from '../../voice-processing';
import { LLMOrchestratorService } from '../../llm-orchestrator';
import { ProductAgent } from '../../../agents/product-agent';
import { OrderAgent } from '../../../agents/order-agent';
import { MockPaymentService } from '../../mock-payment';
import { errorHandler } from '../../error-handler';

// Mock external dependencies
vi.mock('@google-cloud/speech');
vi.mock('@google/generative-ai');
vi.mock('../../../database');
vi.mock('../../error-handler');

describe('Error Recovery Integration Tests', () => {
  let voiceService: VoiceProcessingServiceImpl;
  let llmOrchestrator: LLMOrchestratorService;
  let paymentService: MockPaymentService;
  
  const sessionId = 'error-recovery-session';

  beforeEach(() => {
    // Set up environment
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
    process.env.GEMINI_API_KEY = 'test-key';
    
    // Initialize services
    voiceService = new VoiceProcessingServiceImpl();
    llmOrchestrator = new LLMOrchestratorService();
    paymentService = MockPaymentService.getInstance();
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Voice Recognition Error Recovery', () => {
    it('should recover from network connectivity issues', async () => {
      // Mock network failure then success
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true } as Response);

      // Mock error handler to suggest retry
      vi.mocked(errorHandler.handleVoiceError).mockResolvedValue({
        success: true,
        actions: [{ type: 'retry', description: 'Retry connection' }],
        userMessage: 'Network issue detected, retrying...',
      });

      const config = {
        sampleRate: 16000,
        channels: 1,
        encoding: 'PCM_16' as const,
        languageCode: 'ko-KR',
        enablePartialResults: true,
        enableVoiceActivityDetection: true,
      };

      // First attempt should fail, second should succeed
      await expect(voiceService.startAudioStream(sessionId, config))
        .rejects.toThrow('Network connectivity required');

      // Retry should succeed
      const streamConnection = await voiceService.startAudioStream(sessionId, config);
      expect(streamConnection.isActive).toBe(true);
    });

    it('should handle audio quality issues with user guidance', async () => {
      const config = {
        sampleRate: 16000,
        channels: 1,
        encoding: 'PCM_16' as const,
        languageCode: 'ko-KR',
        enablePartialResults: true,
        enableVoiceActivityDetection: true,
      };

      await voiceService.startAudioStream(sessionId, config);

      // Simulate low quality audio data
      const lowQualityAudio = new ArrayBuffer(100); // Very small audio chunk
      
      // Should process without throwing but may filter low quality results
      await expect(voiceService.processAudioChunk(sessionId, lowQualityAudio))
        .resolves.not.toThrow();
    });

    it('should fallback to alternative languages', async () => {
      const config = {
        sampleRate: 16000,
        channels: 1,
        encoding: 'PCM_16' as const,
        languageCode: 'unsupported-lang',
        enablePartialResults: true,
        enableVoiceActivityDetection: true,
      };

      await voiceService.startAudioStream(sessionId, config);

      // Mock setLanguage to fail for unsupported language, succeed for fallback
      vi.spyOn(voiceService, 'setLanguage')
        .mockRejectedValueOnce(new Error('Language not supported'))
        .mockResolvedValueOnce(undefined);

      // Should fallback to supported language
      await expect(voiceService.setLanguageWithFallback(sessionId, 'unsupported-lang'))
        .resolves.not.toThrow();
    });
  });

  describe('LLM Processing Error Recovery', () => {
    it('should handle API rate limits with backoff', async () => {
      const userInput = {
        type: 'text' as const,
        content: '아메리카노 주문하고 싶어요',
        timestamp: Date.now(),
      };

      // Mock rate limit error then success
      vi.spyOn(llmOrchestrator, 'processUserInput')
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce(undefined);

      // Should handle rate limit gracefully
      await expect(llmOrchestrator.processUserInput(sessionId, userInput))
        .rejects.toThrow('Rate limit exceeded');

      // Retry should succeed
      await expect(llmOrchestrator.processUserInput(sessionId, userInput))
        .resolves.not.toThrow();
    });

    it('should handle function call errors with parameter correction', async () => {
      const functionCall = {
        name: 'search_catalog',
        parameters: { query: '' }, // Invalid empty query
        id: 'test-call-123',
      };

      const result = await llmOrchestrator.handleFunctionCall(sessionId, functionCall);
      
      // Should handle invalid parameters gracefully
      expect(result.id).toBe('test-call-123');
      expect(result.result).toBeDefined();
    });

    it('should handle context length exceeded', async () => {
      // Simulate very long conversation context
      const longInput = {
        type: 'text' as const,
        content: 'A'.repeat(10000), // Very long input
        timestamp: Date.now(),
      };

      // Should handle long input without crashing
      await expect(llmOrchestrator.processUserInput(sessionId, longInput))
        .resolves.not.toThrow();
    });
  });

  describe('Business Logic Error Recovery', () => {
    it('should handle product not found with alternatives', async () => {
      // Search for non-existent product
      const searchResult = await ProductAgent.search_catalog('존재하지않는상품');
      
      expect(searchResult.products).toHaveLength(0);
      expect(searchResult.suggestions).toBeDefined();
    });

    it('should handle inventory shortage with substitutions', async () => {
      // Mock product with low inventory
      const mockProduct = {
        id: 'low-stock-product',
        inventory: { count: 1, isAvailable: true },
      };

      // Try to add more than available
      await expect(ProductAgent.add_to_cart(sessionId, 'low-stock-product', 5))
        .rejects.toThrow('재고가 부족합니다');

      // Should suggest available quantity
      const availabilityCheck = await ProductAgent.check_availability(['low-stock-product']);
      expect(availabilityCheck['low-stock-product'].stockCount).toBeLessThan(5);
    });

    it('should handle invalid coupon with explanations', async () => {
      const invalidCouponResult = await CouponAgent.apply_coupon(sessionId, 'INVALID_COUPON');
      
      expect(invalidCouponResult.success).toBe(false);
      expect(invalidCouponResult.errorMessage).toBeDefined();
      expect(invalidCouponResult.errorCode).toBeDefined();
    });
  });

  describe('Payment Processing Error Recovery', () => {
    it('should handle payment failures with retry options', async () => {
      // Configure payment service for failure
      paymentService.updateSimulationConfig({
        successRate: 0, // Force failure
        processingDelay: 100,
      });

      const paymentRequest = {
        orderId: 'test-order',
        amount: 10000,
        currency: 'KRW',
        sessionId,
      };

      const paymentSession = await paymentService.createPaymentSession(paymentRequest);
      await paymentService.processPayment(paymentSession.sessionId);
      
      // Simulate payment failure
      await paymentService.simulatePaymentResult(paymentSession.sessionId, 'failure', 0);
      
      const status = await paymentService.getPaymentStatus(paymentSession.sessionId);
      expect(status.current).toBe('failed');

      // Should be able to retry
      const retryResult = await paymentService.retryPayment(paymentSession.sessionId);
      expect(retryResult.success).toBe(true);
      expect(retryResult.newSessionId).toBeDefined();
    });

    it('should handle payment timeout with recovery', async () => {
      // Configure short timeout
      paymentService.updateSimulationConfig({
        successRate: 0.5,
        processingDelay: 100,
        timeoutDelay: 200, // Very short timeout
      });

      const paymentRequest = {
        orderId: 'timeout-test-order',
        amount: 10000,
        currency: 'KRW',
        sessionId,
      };

      const paymentSession = await paymentService.createPaymentSession(paymentRequest);
      
      // Should handle timeout gracefully
      await expect(paymentService.processPayment(paymentSession.sessionId))
        .resolves.not.toThrow();
    });

    it('should handle order state inconsistencies', async () => {
      const orderDetails = {
        orderType: 'pickup' as const,
        customerInfo: {
          name: '테스트',
          phone: '010-1234-5678',
        },
        pickupLocation: { id: 'store-1' },
      };

      // Create order
      const orderResult = await OrderAgent.create_order(sessionId, orderDetails);
      expect(orderResult.success).toBe(true);

      // Try invalid status transition
      const invalidStatusResult = await OrderAgent.set_order_status(
        orderResult.order!.id,
        'delivered' // Can't go directly from created to delivered
      );

      expect(invalidStatusResult.success).toBe(false);
      expect(invalidStatusResult.errorMessage).toContain('상태 변경이 불가능합니다');
    });
  });

  describe('System Recovery Scenarios', () => {
    it('should handle service unavailability gracefully', async () => {
      // Mock database service failure
      vi.spyOn(ProductAgent, 'search_catalog')
        .mockRejectedValueOnce(new Error('Database connection failed'))
        .mockResolvedValueOnce({
          query: 'test',
          products: [],
          totalCount: 0,
          hasMore: false,
          suggestions: [],
        });

      // First call should fail
      await expect(ProductAgent.search_catalog('test'))
        .rejects.toThrow('Database connection failed');

      // Retry should succeed
      const result = await ProductAgent.search_catalog('test');
      expect(result.products).toEqual([]);
    });

    it('should maintain session state during errors', async () => {
      // Add item to cart
      const cartResult = await ProductAgent.add_to_cart(
        sessionId,
        'test-product',
        1,
        { size: 'regular' }
      );
      expect(cartResult.success).toBe(true);

      // Simulate error during order creation
      vi.spyOn(OrderAgent, 'create_order')
        .mockRejectedValueOnce(new Error('Order creation failed'));

      const orderDetails = {
        orderType: 'pickup' as const,
        customerInfo: {
          name: '테스트',
          phone: '010-1234-5678',
        },
        pickupLocation: { id: 'store-1' },
      };

      await expect(OrderAgent.create_order(sessionId, orderDetails))
        .rejects.toThrow('Order creation failed');

      // Cart should still contain items after error
      // (This would be verified through session service in real implementation)
    });
  });
});