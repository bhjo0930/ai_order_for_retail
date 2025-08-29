import { 
  PaymentSession, 
  PaymentStatus, 
  Order, 
  OrderUpdate,
  PaymentSessionCreationRequest,
  PaymentRetryResult,
  PaymentCancellation
} from '@/lib/types';
import { mockPaymentService } from './mock-payment';
import { OrderService, SessionService } from '../database';

export interface PaymentReceipt {
  receiptId: string;
  orderId: string;
  paymentSessionId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paidAt: Date;
  customerInfo: {
    name: string;
    phone: string;
    email?: string;
  };
  orderSummary: {
    items: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    subtotal: number;
    discounts: number;
    taxes: number;
    deliveryFee?: number;
    total: number;
  };
  receiptUrl?: string;
}

export interface PaymentIntegrationResult {
  success: boolean;
  paymentSession?: PaymentSession;
  order?: Order;
  receipt?: PaymentReceipt;
  message: string;
  errorCode?: string;
}

/**
 * Payment Integration Service
 * Connects mock payment processing with order management system
 * Handles payment flow state transitions and order confirmations
 */
export class PaymentIntegrationService {
  private static instance: PaymentIntegrationService;

  private constructor() {}

  public static getInstance(): PaymentIntegrationService {
    if (!PaymentIntegrationService.instance) {
      PaymentIntegrationService.instance = new PaymentIntegrationService();
    }
    return PaymentIntegrationService.instance;
  }

  /**
   * Create payment session for an order
   * Requirement 6.1: Connect mock payment completion to order confirmation
   */
  public async createPaymentSession(
    orderId: string,
    sessionId: string
  ): Promise<PaymentIntegrationResult> {
    try {
      const order = await OrderService.getOrder(orderId);
      if (!order) {
        return {
          success: false,
          message: '주문을 찾을 수 없습니다.',
          errorCode: 'ORDER_NOT_FOUND'
        };
      }

      if (order.paymentStatus.current !== 'pending') {
        return {
          success: false,
          message: `주문의 결제 상태가 올바르지 않습니다: ${order.paymentStatus.current}`,
          errorCode: 'INVALID_PAYMENT_STATUS'
        };
      }

      const paymentRequest: PaymentSessionCreationRequest = {
        orderId,
        amount: order.pricing.total,
        currency: order.pricing.currency,
        sessionId
      };

      const paymentSession = await mockPaymentService.createPaymentSession(paymentRequest);

      // Update order with payment session ID
      await OrderService.updatePaymentStatus(orderId, 'processing', {
        paymentSessionId: paymentSession.sessionId,
        paymentMethod: 'mock_payment'
      });

      // Update session state to payment_session_created
      await SessionService.updateSessionState(sessionId, 'payment_session_created', {
        paymentSessionId: paymentSession.sessionId
      });

      return {
        success: true,
        paymentSession,
        order,
        message: '결제 세션이 생성되었습니다.'
      };

    } catch (error) {
      console.error('Create payment session error:', error);
      return {
        success: false,
        message: `결제 세션 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'PAYMENT_SESSION_CREATION_ERROR'
      };
    }
  }

  /**
   * Process payment for an order
   * Requirement 6.1: Connect mock payment completion to order confirmation
   */
  public async processPayment(
    paymentSessionId: string,
    sessionId: string
  ): Promise<PaymentIntegrationResult> {
    try {
      // Start payment processing
      const paymentSession = await mockPaymentService.processPayment(paymentSessionId);

      // Update session state to payment_pending
      await SessionService.updateSessionState(sessionId, 'payment_pending', {
        paymentSessionId: paymentSession.sessionId
      });

      // Set up payment completion monitoring
      this.monitorPaymentCompletion(paymentSessionId, sessionId);

      return {
        success: true,
        paymentSession,
        message: '결제 처리가 시작되었습니다.'
      };

    } catch (error) {
      console.error('Process payment error:', error);
      
      // Update session state to payment_failed
      await SessionService.updateSessionState(sessionId, 'payment_failed', {
        errorMessage: error instanceof Error ? error.message : '결제 처리 실패'
      });

      return {
        success: false,
        message: `결제 처리 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'PAYMENT_PROCESSING_ERROR'
      };
    }
  }

  /**
   * Handle payment completion (success or failure)
   * Requirement 6.1: Connect mock payment completion to order confirmation
   * Requirement 6.3: Add payment status updates to order tracking system
   */
  public async handlePaymentCompletion(
    paymentSessionId: string,
    sessionId: string
  ): Promise<PaymentIntegrationResult> {
    try {
      const paymentStatus = await mockPaymentService.getPaymentStatus(paymentSessionId);
      
      if (paymentStatus.current === 'completed') {
        return await this.handlePaymentSuccess(paymentSessionId, sessionId);
      } else if (paymentStatus.current === 'failed') {
        return await this.handlePaymentFailure(paymentSessionId, sessionId);
      } else {
        return {
          success: false,
          message: `결제가 아직 완료되지 않았습니다: ${paymentStatus.current}`,
          errorCode: 'PAYMENT_NOT_COMPLETED'
        };
      }

    } catch (error) {
      console.error('Handle payment completion error:', error);
      return {
        success: false,
        message: `결제 완료 처리 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'PAYMENT_COMPLETION_ERROR'
      };
    }
  }

  /**
   * Retry failed payment
   * Requirement 6.2: Implement payment failure handling with retry options
   */
  public async retryPayment(
    paymentSessionId: string,
    sessionId: string
  ): Promise<PaymentIntegrationResult> {
    try {
      const retryResult = await mockPaymentService.retryPayment(paymentSessionId);
      
      if (!retryResult.success) {
        return {
          success: false,
          message: retryResult.message,
          errorCode: retryResult.errorCode
        };
      }

      // Update session state back to payment_session_created for retry
      await SessionService.updateSessionState(sessionId, 'payment_session_created', {
        paymentSessionId: retryResult.newSessionId,
        retryAttempt: true
      });

      return {
        success: true,
        paymentSession: retryResult.paymentSession,
        message: '결제 재시도가 준비되었습니다.'
      };

    } catch (error) {
      console.error('Retry payment error:', error);
      return {
        success: false,
        message: `결제 재시도 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'PAYMENT_RETRY_ERROR'
      };
    }
  }

  /**
   * Cancel payment session
   * Requirement 6.2: Implement payment failure handling with retry options
   */
  public async cancelPayment(
    paymentSessionId: string,
    sessionId: string,
    orderId: string
  ): Promise<PaymentIntegrationResult> {
    try {
      const cancellation = await mockPaymentService.cancelPayment(paymentSessionId);
      
      if (cancellation.success) {
        // Update order status to cancelled
        await OrderService.updatePaymentStatus(orderId, 'cancelled', {
          cancelledAt: cancellation.cancelledAt,
          refundAmount: cancellation.refundAmount
        });

        // Update session state to idle
        await SessionService.updateSessionState(sessionId, 'idle', {
          paymentCancelled: true
        });
      }

      return {
        success: cancellation.success,
        message: cancellation.message
      };

    } catch (error) {
      console.error('Cancel payment error:', error);
      return {
        success: false,
        message: `결제 취소 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'PAYMENT_CANCELLATION_ERROR'
      };
    }
  }

  /**
   * Generate payment receipt
   * Requirement 6.4: Create payment receipt generation for completed orders
   */
  public async generateReceipt(
    paymentSessionId: string,
    orderId: string
  ): Promise<PaymentReceipt | null> {
    try {
      const order = await OrderService.getOrder(orderId);
      if (!order) {
        throw new Error('주문을 찾을 수 없습니다.');
      }

      const paymentStatus = await mockPaymentService.getPaymentStatus(paymentSessionId);
      if (paymentStatus.current !== 'completed') {
        throw new Error('결제가 완료되지 않은 주문입니다.');
      }

      // Get product details for receipt
      const itemsWithDetails = await Promise.all(
        order.items.map(async (item) => {
          // In a real system, this would fetch product details from database
          return {
            name: `상품 ${item.productId.slice(-8)}`, // Mock product name
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice
          };
        })
      );

      const receipt: PaymentReceipt = {
        receiptId: this.generateReceiptId(),
        orderId: order.id,
        paymentSessionId,
        amount: order.pricing.total,
        currency: order.pricing.currency,
        paymentMethod: 'Mock Payment',
        paidAt: new Date(),
        customerInfo: {
          name: order.customerInfo.name,
          phone: order.customerInfo.phone,
          email: order.customerInfo.email
        },
        orderSummary: {
          items: itemsWithDetails,
          subtotal: order.pricing.subtotal,
          discounts: order.pricing.discounts.reduce((sum, d) => sum + d.appliedAmount, 0),
          taxes: order.pricing.taxes.reduce((sum, t) => sum + t.amount, 0),
          deliveryFee: order.pricing.deliveryFee,
          total: order.pricing.total
        }
      };

      // Store receipt in database (mock implementation)
      await this.storeReceipt(receipt);

      return receipt;

    } catch (error) {
      console.error('Generate receipt error:', error);
      return null;
    }
  }

  /**
   * Get payment status for an order
   * Requirement 6.3: Add payment status updates to order tracking system
   */
  public async getPaymentStatus(orderId: string): Promise<{
    paymentStatus: PaymentStatus;
    order: Order;
    canRetry: boolean;
    canCancel: boolean;
  } | null> {
    try {
      const order = await OrderService.getOrder(orderId);
      if (!order) {
        return null;
      }

      const paymentSessionId = order.paymentStatus.sessionId;
      if (!paymentSessionId) {
        return {
          paymentStatus: order.paymentStatus,
          order,
          canRetry: false,
          canCancel: false
        };
      }

      const paymentStatus = await mockPaymentService.getPaymentStatus(paymentSessionId);
      
      return {
        paymentStatus,
        order,
        canRetry: paymentStatus.current === 'failed',
        canCancel: ['created', 'pending', 'processing'].includes(paymentStatus.current)
      };

    } catch (error) {
      console.error('Get payment status error:', error);
      return null;
    }
  }

  // Private helper methods

  private async handlePaymentSuccess(
    paymentSessionId: string,
    sessionId: string
  ): Promise<PaymentIntegrationResult> {
    try {
      // Find order by payment session ID
      const order = await OrderService.getOrderByPaymentSession(paymentSessionId);
      if (!order) {
        throw new Error('결제 세션에 연결된 주문을 찾을 수 없습니다.');
      }

      // Update order payment status to completed
      await OrderService.updatePaymentStatus(order.id, 'completed', {
        completedAt: new Date(),
        paymentSessionId
      });

      // Update order status to confirmed
      await OrderService.updateOrderStatus(order.id, 'confirmed', {
        paymentCompleted: true,
        confirmedAt: new Date()
      });

      // Update session state to payment_completed
      await SessionService.updateSessionState(sessionId, 'payment_completed', {
        orderId: order.id,
        paymentSessionId
      });

      // Generate receipt
      const receipt = await this.generateReceipt(paymentSessionId, order.id);

      // Get updated order
      const updatedOrder = await OrderService.getOrder(order.id);

      return {
        success: true,
        order: updatedOrder || order,
        receipt: receipt || undefined,
        message: '결제가 성공적으로 완료되었습니다.'
      };

    } catch (error) {
      console.error('Handle payment success error:', error);
      throw error;
    }
  }

  private async handlePaymentFailure(
    paymentSessionId: string,
    sessionId: string
  ): Promise<PaymentIntegrationResult> {
    try {
      // Find order by payment session ID
      const order = await OrderService.getOrderByPaymentSession(paymentSessionId);
      if (!order) {
        throw new Error('결제 세션에 연결된 주문을 찾을 수 없습니다.');
      }

      // Update order payment status to failed
      await OrderService.updatePaymentStatus(order.id, 'failed', {
        failedAt: new Date(),
        paymentSessionId,
        canRetry: true
      });

      // Update session state to payment_failed
      await SessionService.updateSessionState(sessionId, 'payment_failed', {
        orderId: order.id,
        paymentSessionId,
        canRetry: true
      });

      return {
        success: false,
        order,
        message: '결제가 실패했습니다. 다시 시도하거나 다른 결제 방법을 선택해주세요.',
        errorCode: 'PAYMENT_FAILED'
      };

    } catch (error) {
      console.error('Handle payment failure error:', error);
      throw error;
    }
  }

  private monitorPaymentCompletion(paymentSessionId: string, sessionId: string): void {
    // Poll payment status every 2 seconds for up to 2 minutes
    const maxAttempts = 60; // 2 minutes / 2 seconds
    let attempts = 0;

    const checkPaymentStatus = async () => {
      try {
        attempts++;
        const paymentStatus = await mockPaymentService.getPaymentStatus(paymentSessionId);
        
        if (paymentStatus.current === 'completed' || paymentStatus.current === 'failed') {
          await this.handlePaymentCompletion(paymentSessionId, sessionId);
          return;
        }

        if (attempts < maxAttempts && ['pending', 'processing'].includes(paymentStatus.current)) {
          setTimeout(checkPaymentStatus, 2000);
        } else if (attempts >= maxAttempts) {
          // Timeout - treat as failed
          await SessionService.updateSessionState(sessionId, 'payment_failed', {
            errorMessage: '결제 처리 시간이 초과되었습니다.',
            timeout: true
          });
        }

      } catch (error) {
        console.error('Payment monitoring error:', error);
        await SessionService.updateSessionState(sessionId, 'payment_failed', {
          errorMessage: '결제 상태 확인 중 오류가 발생했습니다.'
        });
      }
    };

    // Start monitoring after a short delay
    setTimeout(checkPaymentStatus, 1000);
  }

  private generateReceiptId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    return `RCP-${timestamp}-${random}`.toUpperCase();
  }

  private async storeReceipt(receipt: PaymentReceipt): Promise<void> {
    // In a real system, this would store the receipt in a database
    // For now, we'll just log it
    console.log('Receipt generated:', {
      receiptId: receipt.receiptId,
      orderId: receipt.orderId,
      amount: receipt.amount,
      currency: receipt.currency
    });
  }
}

// Export singleton instance
export const paymentIntegrationService = PaymentIntegrationService.getInstance();