import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaymentIntegrationService } from '../payment-integration';
import { Order, PaymentSession } from '@/lib/types';

// Mock the dependencies
vi.mock('../mock-payment', () => ({
  mockPaymentService: {
    createPaymentSession: vi.fn(),
    processPayment: vi.fn(),
    getPaymentStatus: vi.fn(),
    retryPayment: vi.fn(),
    cancelPayment: vi.fn(),
  },
}));

vi.mock('../../database', () => ({
  OrderService: {
    getOrder: vi.fn(),
    updatePaymentStatus: vi.fn(),
    updateOrderStatus: vi.fn(),
    getOrderByPaymentSession: vi.fn(),
  },
  SessionService: {
    updateSessionState: vi.fn(),
  },
}));

import { mockPaymentService } from '../mock-payment';
import { OrderService, SessionService } from '../../database';

describe('PaymentIntegrationService', () => {
  let paymentIntegrationService: PaymentIntegrationService;
  let mockOrder: Order;
  let mockPaymentSession: PaymentSession;

  beforeEach(() => {
    paymentIntegrationService = PaymentIntegrationService.getInstance();
    
    mockOrder = {
      id: 'order-123',
      sessionId: 'session-123',
      items: [],
      orderType: 'pickup',
      status: {
        current: 'created',
        history: [],
      },
      paymentStatus: {
        current: 'pending',
        history: [],
      },
      customerInfo: {
        name: '김철수',
        phone: '010-1234-5678',
      },
      pricing: {
        subtotal: 15000,
        discounts: [],
        taxes: [],
        total: 16500,
        currency: 'KRW',
      },
      timestamps: {
        created: new Date(),
      },
    } as Order;

    mockPaymentSession = {
      sessionId: 'pay-session-123',
      orderId: 'order-123',
      amount: 16500,
      currency: 'KRW',
      status: 'created',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createPaymentSession', () => {
    it('should create payment session successfully', async () => {
      vi.mocked(OrderService.getOrder).mockResolvedValue(mockOrder);
      vi.mocked(mockPaymentService.createPaymentSession).mockResolvedValue(mockPaymentSession);
      vi.mocked(OrderService.updatePaymentStatus).mockResolvedValue();
      vi.mocked(SessionService.updateSessionState).mockResolvedValue();

      const result = await paymentIntegrationService.createPaymentSession('order-123', 'session-123');

      expect(result.success).toBe(true);
      expect(result.paymentSession).toEqual(mockPaymentSession);
      expect(result.message).toBe('결제 세션이 생성되었습니다.');
      expect(OrderService.updatePaymentStatus).toHaveBeenCalledWith('order-123', 'processing', {
        paymentSessionId: 'pay-session-123',
        paymentMethod: 'mock_payment'
      });
      expect(SessionService.updateSessionState).toHaveBeenCalledWith('session-123', 'payment_session_created', {
        paymentSessionId: 'pay-session-123'
      });
    });

    it('should fail when order not found', async () => {
      vi.mocked(OrderService.getOrder).mockResolvedValue(null);

      const result = await paymentIntegrationService.createPaymentSession('order-123', 'session-123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ORDER_NOT_FOUND');
      expect(result.message).toBe('주문을 찾을 수 없습니다.');
    });

    it('should fail when payment status is not pending', async () => {
      const orderWithCompletedPayment = { ...mockOrder, paymentStatus: { current: 'completed', history: [] } };
      vi.mocked(OrderService.getOrder).mockResolvedValue(orderWithCompletedPayment);

      const result = await paymentIntegrationService.createPaymentSession('order-123', 'session-123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_PAYMENT_STATUS');
      expect(result.message).toContain('주문의 결제 상태가 올바르지 않습니다');
    });
  });

  describe('processPayment', () => {
    it('should process payment successfully', async () => {
      const processingPaymentSession = { ...mockPaymentSession, status: 'pending' as const };
      vi.mocked(mockPaymentService.processPayment).mockResolvedValue(processingPaymentSession);
      vi.mocked(SessionService.updateSessionState).mockResolvedValue();

      const result = await paymentIntegrationService.processPayment('pay-session-123', 'session-123');

      expect(result.success).toBe(true);
      expect(result.paymentSession).toEqual(processingPaymentSession);
      expect(result.message).toBe('결제 처리가 시작되었습니다.');
      expect(SessionService.updateSessionState).toHaveBeenCalledWith('session-123', 'payment_pending', {
        paymentSessionId: 'pay-session-123'
      });
    });

    it('should handle payment processing error', async () => {
      vi.mocked(mockPaymentService.processPayment).mockRejectedValue(new Error('Payment failed'));
      vi.mocked(SessionService.updateSessionState).mockResolvedValue();

      const result = await paymentIntegrationService.processPayment('pay-session-123', 'session-123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PAYMENT_PROCESSING_ERROR');
      expect(SessionService.updateSessionState).toHaveBeenCalledWith('session-123', 'payment_failed', {
        errorMessage: 'Payment failed'
      });
    });
  });

  describe('handlePaymentCompletion', () => {
    it('should handle successful payment completion', async () => {
      const completedPaymentStatus = {
        current: 'completed' as const,
        sessionId: 'pay-session-123',
        history: [],
      };
      
      vi.mocked(mockPaymentService.getPaymentStatus).mockResolvedValue(completedPaymentStatus);
      vi.mocked(OrderService.getOrderByPaymentSession).mockResolvedValue(mockOrder);
      vi.mocked(OrderService.updatePaymentStatus).mockResolvedValue();
      vi.mocked(OrderService.updateOrderStatus).mockResolvedValue();
      vi.mocked(SessionService.updateSessionState).mockResolvedValue();
      vi.mocked(OrderService.getOrder).mockResolvedValue(mockOrder);

      const result = await paymentIntegrationService.handlePaymentCompletion('pay-session-123', 'session-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('결제가 성공적으로 완료되었습니다.');
      expect(OrderService.updatePaymentStatus).toHaveBeenCalledWith('order-123', 'completed', expect.any(Object));
      expect(OrderService.updateOrderStatus).toHaveBeenCalledWith('order-123', 'confirmed', expect.any(Object));
      expect(SessionService.updateSessionState).toHaveBeenCalledWith('session-123', 'payment_completed', expect.any(Object));
    });

    it('should handle failed payment completion', async () => {
      const failedPaymentStatus = {
        current: 'failed' as const,
        sessionId: 'pay-session-123',
        history: [],
      };
      
      vi.mocked(mockPaymentService.getPaymentStatus).mockResolvedValue(failedPaymentStatus);
      vi.mocked(OrderService.getOrderByPaymentSession).mockResolvedValue(mockOrder);
      vi.mocked(OrderService.updatePaymentStatus).mockResolvedValue();
      vi.mocked(SessionService.updateSessionState).mockResolvedValue();

      const result = await paymentIntegrationService.handlePaymentCompletion('pay-session-123', 'session-123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PAYMENT_FAILED');
      expect(result.message).toContain('결제가 실패했습니다');
      expect(OrderService.updatePaymentStatus).toHaveBeenCalledWith('order-123', 'failed', expect.any(Object));
      expect(SessionService.updateSessionState).toHaveBeenCalledWith('session-123', 'payment_failed', expect.any(Object));
    });

    it('should handle incomplete payment', async () => {
      const pendingPaymentStatus = {
        current: 'pending' as const,
        sessionId: 'pay-session-123',
        history: [],
      };
      
      vi.mocked(mockPaymentService.getPaymentStatus).mockResolvedValue(pendingPaymentStatus);

      const result = await paymentIntegrationService.handlePaymentCompletion('pay-session-123', 'session-123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PAYMENT_NOT_COMPLETED');
      expect(result.message).toContain('결제가 아직 완료되지 않았습니다');
    });
  });

  describe('retryPayment', () => {
    it('should retry payment successfully', async () => {
      const retryResult = {
        success: true,
        newSessionId: 'pay-session-retry-123',
        paymentSession: { ...mockPaymentSession, sessionId: 'pay-session-retry-123' },
        message: '결제 재시도 준비 완료',
      };
      
      vi.mocked(mockPaymentService.retryPayment).mockResolvedValue(retryResult);
      vi.mocked(SessionService.updateSessionState).mockResolvedValue();

      const result = await paymentIntegrationService.retryPayment('pay-session-123', 'session-123');

      expect(result.success).toBe(true);
      expect(result.paymentSession).toEqual(retryResult.paymentSession);
      expect(result.message).toBe('결제 재시도가 준비되었습니다.');
      expect(SessionService.updateSessionState).toHaveBeenCalledWith('session-123', 'payment_session_created', {
        paymentSessionId: 'pay-session-retry-123',
        retryAttempt: true
      });
    });

    it('should handle retry failure', async () => {
      const retryResult = {
        success: false,
        message: '재시도할 수 없는 결제입니다.',
        errorCode: 'INVALID_STATUS',
      };
      
      vi.mocked(mockPaymentService.retryPayment).mockResolvedValue(retryResult);

      const result = await paymentIntegrationService.retryPayment('pay-session-123', 'session-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe(retryResult.message);
      expect(result.errorCode).toBe(retryResult.errorCode);
    });
  });

  describe('cancelPayment', () => {
    it('should cancel payment successfully', async () => {
      const cancellation = {
        success: true,
        sessionId: 'pay-session-123',
        cancelledAt: new Date(),
        message: '결제가 취소되었습니다.',
      };
      
      vi.mocked(mockPaymentService.cancelPayment).mockResolvedValue(cancellation);
      vi.mocked(OrderService.updatePaymentStatus).mockResolvedValue();
      vi.mocked(SessionService.updateSessionState).mockResolvedValue();

      const result = await paymentIntegrationService.cancelPayment('pay-session-123', 'session-123', 'order-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe(cancellation.message);
      expect(OrderService.updatePaymentStatus).toHaveBeenCalledWith('order-123', 'cancelled', expect.any(Object));
      expect(SessionService.updateSessionState).toHaveBeenCalledWith('session-123', 'idle', {
        paymentCancelled: true
      });
    });

    it('should handle cancellation failure', async () => {
      const cancellation = {
        success: false,
        sessionId: 'pay-session-123',
        cancelledAt: new Date(),
        message: '취소할 수 없는 결제입니다.',
      };
      
      vi.mocked(mockPaymentService.cancelPayment).mockResolvedValue(cancellation);

      const result = await paymentIntegrationService.cancelPayment('pay-session-123', 'session-123', 'order-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe(cancellation.message);
      expect(OrderService.updatePaymentStatus).not.toHaveBeenCalled();
      expect(SessionService.updateSessionState).not.toHaveBeenCalled();
    });
  });

  describe('generateReceipt', () => {
    it('should generate receipt successfully', async () => {
      const completedPaymentStatus = {
        current: 'completed' as const,
        sessionId: 'pay-session-123',
        history: [],
      };
      
      vi.mocked(OrderService.getOrder).mockResolvedValue(mockOrder);
      vi.mocked(mockPaymentService.getPaymentStatus).mockResolvedValue(completedPaymentStatus);

      const receipt = await paymentIntegrationService.generateReceipt('pay-session-123', 'order-123');

      expect(receipt).toBeDefined();
      expect(receipt?.orderId).toBe('order-123');
      expect(receipt?.paymentSessionId).toBe('pay-session-123');
      expect(receipt?.amount).toBe(16500);
      expect(receipt?.currency).toBe('KRW');
      expect(receipt?.customerInfo.name).toBe('김철수');
    });

    it('should return null when order not found', async () => {
      vi.mocked(OrderService.getOrder).mockResolvedValue(null);

      const receipt = await paymentIntegrationService.generateReceipt('pay-session-123', 'order-123');

      expect(receipt).toBeNull();
    });

    it('should return null when payment not completed', async () => {
      const pendingPaymentStatus = {
        current: 'pending' as const,
        sessionId: 'pay-session-123',
        history: [],
      };
      
      vi.mocked(OrderService.getOrder).mockResolvedValue(mockOrder);
      vi.mocked(mockPaymentService.getPaymentStatus).mockResolvedValue(pendingPaymentStatus);

      const receipt = await paymentIntegrationService.generateReceipt('pay-session-123', 'order-123');

      expect(receipt).toBeNull();
    });
  });

  describe('getPaymentStatus', () => {
    it('should get payment status successfully', async () => {
      const paymentStatus = {
        current: 'completed' as const,
        sessionId: 'pay-session-123',
        history: [],
      };
      
      const orderWithPaymentSession = {
        ...mockOrder,
        paymentStatus: { ...mockOrder.paymentStatus, sessionId: 'pay-session-123' }
      };
      
      vi.mocked(OrderService.getOrder).mockResolvedValue(orderWithPaymentSession);
      vi.mocked(mockPaymentService.getPaymentStatus).mockResolvedValue(paymentStatus);

      const result = await paymentIntegrationService.getPaymentStatus('order-123');

      expect(result).toBeDefined();
      expect(result?.paymentStatus).toEqual(paymentStatus);
      expect(result?.order).toEqual(orderWithPaymentSession);
      expect(result?.canRetry).toBe(false);
      expect(result?.canCancel).toBe(false);
    });

    it('should return null when order not found', async () => {
      vi.mocked(OrderService.getOrder).mockResolvedValue(null);

      const result = await paymentIntegrationService.getPaymentStatus('order-123');

      expect(result).toBeNull();
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PaymentIntegrationService.getInstance();
      const instance2 = PaymentIntegrationService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});