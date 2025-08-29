import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockPaymentService } from '../mock-payment';
import { PaymentSessionCreationRequest } from '@/lib/types';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      delete: vi.fn(() => ({
        lt: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

describe('MockPaymentService', () => {
  let paymentService: MockPaymentService;
  let mockRequest: PaymentSessionCreationRequest;

  beforeEach(() => {
    paymentService = MockPaymentService.getInstance();
    mockRequest = {
      orderId: 'test-order-id',
      amount: 100,
      currency: 'KRW',
      sessionId: 'test-session',
    };
    
    // Reset simulation config to defaults
    paymentService.updateSimulationConfig({
      successRate: 0.85,
      processingDelay: 100, // Shorter delay for tests
      timeoutDelay: 5000, // Shorter timeout for tests
    });
    
    // Clear internal cache for clean tests
    (paymentService as any).paymentSessions.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createPaymentSession', () => {
    it('should create a new payment session successfully', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);

      expect(session).toBeDefined();
      expect(session.orderId).toBe(mockRequest.orderId);
      expect(session.amount).toBe(mockRequest.amount);
      expect(session.currency).toBe(mockRequest.currency);
      expect(session.status).toBe('created');
      expect(session.sessionId).toMatch(/^pay_\d+_[a-z0-9]+$/);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.expiresAt.getTime()).toBeGreaterThan(session.createdAt.getTime());
    });

    it('should generate unique session IDs', async () => {
      const session1 = await paymentService.createPaymentSession(mockRequest);
      const session2 = await paymentService.createPaymentSession({
        ...mockRequest,
        orderId: 'test-order-id-2',
      });

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status for existing session', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);
      const status = await paymentService.getPaymentStatus(session.sessionId);

      expect(status).toBeDefined();
      expect(status.current).toBe('created');
      expect(status.sessionId).toBe(session.sessionId);
      expect(status.history).toHaveLength(1);
      expect(status.history[0].status).toBe('created');
    });

    it('should throw error for non-existent session', async () => {
      await expect(paymentService.getPaymentStatus('non-existent')).rejects.toThrow(
        'Payment session non-existent not found'
      );
    });
  });

  describe('processPayment', () => {
    it('should process payment and update status to pending', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);
      const processedSession = await paymentService.processPayment(session.sessionId);

      expect(processedSession.status).toBe('pending');
    });

    it('should throw error for non-existent session', async () => {
      await expect(paymentService.processPayment('non-existent')).rejects.toThrow(
        'Payment session non-existent not found'
      );
    });

    it('should throw error for already processed session', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);
      await paymentService.processPayment(session.sessionId);

      await expect(paymentService.processPayment(session.sessionId)).rejects.toThrow(
        `Payment session ${session.sessionId} is not in a processable state: pending`
      );
    });
  });

  describe('simulatePaymentResult', () => {
    it('should simulate successful payment when forced', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);
      await paymentService.processPayment(session.sessionId);
      
      await paymentService.simulatePaymentResult(session.sessionId, 'success', 0);
      
      const updatedSession = await paymentService.getPaymentStatus(session.sessionId);
      expect(updatedSession.current).toBe('completed');
    });

    it('should simulate failed payment when forced', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);
      await paymentService.processPayment(session.sessionId);
      
      await paymentService.simulatePaymentResult(session.sessionId, 'failure', 0);
      
      const updatedSession = await paymentService.getPaymentStatus(session.sessionId);
      expect(updatedSession.current).toBe('failed');
    });

    it('should respect processing delay', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);
      await paymentService.processPayment(session.sessionId);
      
      const startTime = Date.now();
      await paymentService.simulatePaymentResult(session.sessionId, 'success', 200);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(200);
    });
  });

  describe('cancelPayment', () => {
    it('should cancel a created payment session', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);
      const cancellation = await paymentService.cancelPayment(session.sessionId);

      expect(cancellation.success).toBe(true);
      expect(cancellation.sessionId).toBe(session.sessionId);
      expect(cancellation.message).toContain('cancelled successfully');
      expect(cancellation.refundAmount).toBeUndefined();
    });

    it('should not cancel a completed payment session', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);
      await paymentService.processPayment(session.sessionId);
      await paymentService.simulatePaymentResult(session.sessionId, 'success', 0);
      
      const cancellation = await paymentService.cancelPayment(session.sessionId);

      expect(cancellation.success).toBe(false);
      expect(cancellation.message).toContain('cannot be cancelled');
    });

    it('should return failure for non-existent session', async () => {
      const cancellation = await paymentService.cancelPayment('non-existent');

      expect(cancellation.success).toBe(false);
      expect(cancellation.message).toContain('not found');
    });
  });

  describe('retryPayment', () => {
    it('should retry a failed payment', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);
      await paymentService.processPayment(session.sessionId);
      await paymentService.simulatePaymentResult(session.sessionId, 'failure', 0);
      
      const retryResult = await paymentService.retryPayment(session.sessionId);

      expect(retryResult.success).toBe(true);
      expect(retryResult.newSessionId).toBe(session.sessionId);
      expect(retryResult.paymentSession?.status).toBe('created');
    });

    it('should not retry a successful payment', async () => {
      const session = await paymentService.createPaymentSession(mockRequest);
      await paymentService.processPayment(session.sessionId);
      await paymentService.simulatePaymentResult(session.sessionId, 'success', 0);
      
      const retryResult = await paymentService.retryPayment(session.sessionId);

      expect(retryResult.success).toBe(false);
      expect(retryResult.errorCode).toBe('INVALID_STATUS');
    });

    it('should return error for non-existent session', async () => {
      const retryResult = await paymentService.retryPayment('non-existent');

      expect(retryResult.success).toBe(false);
      expect(retryResult.errorCode).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('simulation configuration', () => {
    it('should update simulation config', () => {
      const newConfig = {
        successRate: 0.5,
        processingDelay: 1000,
        timeoutDelay: 60000,
      };

      paymentService.updateSimulationConfig(newConfig);
      const currentConfig = paymentService.getSimulationConfig();

      expect(currentConfig.successRate).toBe(0.5);
      expect(currentConfig.processingDelay).toBe(1000);
      expect(currentConfig.timeoutDelay).toBe(60000);
    });

    it('should partially update simulation config', () => {
      const originalConfig = paymentService.getSimulationConfig();
      
      paymentService.updateSimulationConfig({ successRate: 0.9 });
      const updatedConfig = paymentService.getSimulationConfig();

      expect(updatedConfig.successRate).toBe(0.9);
      expect(updatedConfig.processingDelay).toBe(originalConfig.processingDelay);
      expect(updatedConfig.timeoutDelay).toBe(originalConfig.timeoutDelay);
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = MockPaymentService.getInstance();
      const instance2 = MockPaymentService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});