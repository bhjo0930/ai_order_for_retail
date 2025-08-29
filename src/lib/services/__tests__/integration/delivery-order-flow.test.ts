import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceProcessingServiceImpl } from '../../voice-processing';
import { LLMOrchestratorService } from '../../llm-orchestrator';
import { ProductAgent } from '../../../agents/product-agent';
import { CouponAgent } from '../../../agents/coupon-agent';
import { OrderAgent } from '../../../agents/order-agent';
import { MockPaymentService } from '../../mock-payment';
import { UISynchronizationService } from '../../ui-synchronization';

// Mock external dependencies
vi.mock('@google-cloud/speech');
vi.mock('@google/generative-ai');
vi.mock('../../../database');
vi.mock('../../websocket-handler');

describe('Delivery Order Flow Integration', () => {
  let voiceService: VoiceProcessingServiceImpl;
  let llmOrchestrator: LLMOrchestratorService;
  let paymentService: MockPaymentService;
  let uiSync: UISynchronizationService;
  
  const sessionId = 'delivery-test-session';
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

  it('should complete delivery order flow with coupon application', async () => {
    // Step 1: Voice input - "피자 한 판 배달 주문할게요"
    const voiceInput = '피자 한 판 배달 주문할게요';
    
    const userInput = {
      type: 'voice' as const,
      content: voiceInput,
      timestamp: Date.now(),
    };
    
    await llmOrchestrator.processUserInput(sessionId, userInput);
    
    // Verify intent classification for delivery
    const intent = llmOrchestrator.classifyIntent(voiceInput);
    expect(intent.category).toBe('product');
    expect(intent.slots.query).toContain('피자');
    
    // Step 2: Product search and selection
    const searchResult = await ProductAgent.search_catalog('피자');
    expect(searchResult.products.length).toBeGreaterThan(0);
    
    const pizza = searchResult.products[0];
    const cartResult = await ProductAgent.add_to_cart(
      sessionId,
      pizza.id,
      1,
      { size: 'large' }
    );
    
    expect(cartResult.success).toBe(true);
    
    // Step 3: Apply coupon
    const couponResult = await CouponAgent.apply_coupon(sessionId, 'SAVE10');
    expect(couponResult.success).toBe(true);
    expect(couponResult.savedAmount).toBeGreaterThan(0);
    
    // Step 4: Get delivery fee quote
    const deliveryAddress = {
      street: '서울시 강남구 테헤란로 123',
      city: '서울',
      postalCode: '06142',
      country: '대한민국',
      instructions: '문 앞에 놓아주세요',
    };
    
    const deliveryQuote = await OrderAgent.quote_delivery_fee(
      deliveryAddress,
      cartResult.cart.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      }))
    );
    
    expect(deliveryQuote.fee).toBeGreaterThanOrEqual(0);
    expect(deliveryQuote.estimatedDeliveryTime).toBeGreaterThan(0);
    
    // Step 5: Create delivery order
    const orderDetails = {
      orderType: 'delivery' as const,
      customerInfo: {
        name: '이영희',
        phone: '010-9876-5432',
        email: 'test@example.com',
      },
      deliveryAddress,
      specialInstructions: '조심히 배달해주세요',
    };
    
    const orderResult = await OrderAgent.create_order(sessionId, orderDetails);
    expect(orderResult.success).toBe(true);
    expect(orderResult.order?.orderType).toBe('delivery');
    expect(orderResult.order?.deliveryInfo?.address).toEqual(deliveryAddress);
    expect(orderResult.order?.deliveryInfo?.fee).toBe(deliveryQuote.fee);
    
    // Step 6: Payment processing
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
    
    // Step 7: Complete payment
    await paymentService.simulatePaymentResult(
      paymentSessionResult.paymentSessionId!,
      'success',
      0
    );
    
    // Step 8: Order status progression
    const statusUpdates = ['confirmed', 'preparing', 'ready', 'in_transit', 'delivered'];
    
    for (const status of statusUpdates) {
      const statusResult = await OrderAgent.set_order_status(
        orderResult.order!.id,
        status as any
      );
      expect(statusResult.success).toBe(true);
      expect(statusResult.newStatus).toBe(status);
    }
    
    // Step 9: Generate receipt
    const receiptResult = await OrderAgent.generate_receipt(
      paymentSessionResult.paymentSessionId!,
      orderResult.order!.id
    );
    expect(receiptResult.success).toBe(true);
    expect(receiptResult.receiptId).toBeDefined();
    
    // Verify final state
    const finalStatus = await OrderAgent.get_order_status(orderResult.order!.id);
    expect(finalStatus.order.status.current).toBe('delivered');
    expect(finalStatus.trackingInfo.statusHistory.length).toBe(6); // created + 5 updates
  });
});