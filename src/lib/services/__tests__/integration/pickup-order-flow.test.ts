import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceProcessingServiceImpl } from '../../voice-processing';
import { LLMOrchestratorService } from '../../llm-orchestrator';
import { ProductAgent } from '../../../agents/product-agent';
import { OrderAgent } from '../../../agents/order-agent';
import { MockPaymentService } from '../../mock-payment';
import { UISynchronizationService } from '../../ui-synchronization';

// Mock external dependencies
vi.mock('@google-cloud/speech');
vi.mock('@google/generative-ai');
vi.mock('../../../database');
vi.mock('../../websocket-handler');

describe('Pickup Order Flow Integration', () => {
  let voiceService: VoiceProcessingServiceImpl;
  let llmOrchestrator: LLMOrchestratorService;
  let paymentService: MockPaymentService;
  let uiSync: UISynchronizationService;
  
  const sessionId = 'integration-test-session';
  const mockWebSocketHandler = { sendMessage: vi.fn() };

  beforeEach(() => {
    // Set up environment
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
    process.env.GEMINI_API_KEY = 'test-key';
    
    // Initialize services
    voiceService = new VoiceProcessingServiceImpl();
    llmOrchestrator = new LLMOrchestratorService();
    paymentService = MockPaymentService.getInstance();
    uiSync = new UISynchronizationService(mockWebSocketHandler);
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should complete full pickup order flow from voice to confirmation', async () => {
    // Step 1: Voice input - "아메리카노 두 잔 주문하고 싶어요"
    const voiceInput = '아메리카노 두 잔 주문하고 싶어요';
    
    // Mock voice processing
    const mockTranscriptionCallback = vi.fn();
    voiceService.onTranscriptionResult(sessionId, mockTranscriptionCallback);
    
    // Simulate voice transcription
    const transcriptionResult = {
      sessionId,
      text: voiceInput,
      confidence: 0.95,
      isFinal: true,
      timestamp: Date.now(),
    };
    
    // Step 2: LLM processes intent and routes to product agent
    const userInput = {
      type: 'voice' as const,
      content: voiceInput,
      timestamp: Date.now(),
    };
    
    await llmOrchestrator.processUserInput(sessionId, userInput);
    
    // Verify intent classification
    const intent = llmOrchestrator.classifyIntent(voiceInput);
    expect(intent.category).toBe('product');
    expect(intent.action).toBe('search');
    
    // Step 3: Product search and cart addition
    const searchResult = await ProductAgent.search_catalog('아메리카노');
    expect(searchResult.products.length).toBeGreaterThan(0);
    
    const product = searchResult.products[0];
    const cartResult = await ProductAgent.add_to_cart(
      sessionId,
      product.id,
      2,
      { size: 'regular' }
    );
    
    expect(cartResult.success).toBe(true);
    expect(cartResult.addedItem?.quantity).toBe(2);
    
    // Step 4: Order creation with pickup
    const orderDetails = {
      orderType: 'pickup' as const,
      customerInfo: {
        name: '김철수',
        phone: '010-1234-5678',
      },
      pickupLocation: { id: 'store-1' },
    };
    
    const orderResult = await OrderAgent.create_order(sessionId, orderDetails);
    expect(orderResult.success).toBe(true);
    expect(orderResult.order?.orderType).toBe('pickup');
    
    // Step 5: Payment processing
    const paymentSessionResult = await OrderAgent.create_payment_session(
      orderResult.order!.id,
      sessionId
    );
    expect(paymentSessionResult.success).toBe(true);
    
    const processPaymentResult = await OrderAgent.process_payment(
      paymentSessionResult.paymentSessionId!,
      sessionId
    );
    expect(processPaymentResult.success).toBe(true);
    
    // Step 6: Simulate payment completion
    await paymentService.simulatePaymentResult(
      paymentSessionResult.paymentSessionId!,
      'success',
      0
    );
    
    // Step 7: Order status updates
    const statusResult = await OrderAgent.set_order_status(
      orderResult.order!.id,
      'confirmed'
    );
    expect(statusResult.success).toBe(true);
    
    // Verify final state
    const finalStatus = await OrderAgent.get_order_status(orderResult.order!.id);
    expect(finalStatus.order.status.current).toBe('confirmed');
    expect(finalStatus.trackingInfo.currentStatus).toBe('confirmed');
  });
});