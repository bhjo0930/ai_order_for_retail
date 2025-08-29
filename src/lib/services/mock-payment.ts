import { PaymentSession, PaymentStatus, PaymentStatusChange } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export interface PaymentSessionCreationRequest {
  orderId: string;
  amount: number;
  currency: string;
  sessionId: string;
}

export interface PaymentSimulationConfig {
  successRate: number; // 0-1, probability of success
  processingDelay: number; // milliseconds
  timeoutDelay: number; // milliseconds for session timeout
}

export interface PaymentCancellation {
  success: boolean;
  sessionId: string;
  cancelledAt: Date;
  refundAmount?: number;
  message: string;
}

export interface PaymentRetryResult {
  success: boolean;
  newSessionId?: string;
  paymentSession?: PaymentSession;
  message: string;
  errorCode?: string;
}

/**
 * Mock Payment Service
 * Simulates payment processing without handling real payment data
 * Provides realistic payment flow with configurable success/failure scenarios
 */
export class MockPaymentService {
  private static instance: MockPaymentService;
  private paymentSessions: Map<string, PaymentSession> = new Map();
  private paymentTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private simulationConfig: PaymentSimulationConfig = {
    successRate: 0.85, // 85% success rate by default
    processingDelay: 2000, // 2 second processing delay
    timeoutDelay: 30 * 60 * 1000, // 30 minute timeout
  };

  private constructor() {}

  public static getInstance(): MockPaymentService {
    if (!MockPaymentService.instance) {
      MockPaymentService.instance = new MockPaymentService();
    }
    return MockPaymentService.instance;
  }

  /**
   * Create a new payment session without collecting real payment data
   */
  public async createPaymentSession(
    request: PaymentSessionCreationRequest
  ): Promise<PaymentSession> {
    const sessionId = this.generatePaymentSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.simulationConfig.timeoutDelay);

    const paymentSession: PaymentSession = {
      sessionId,
      orderId: request.orderId,
      amount: request.amount,
      currency: request.currency,
      status: 'created',
      createdAt: now,
      expiresAt,
    };

    // Store in memory for quick access
    this.paymentSessions.set(sessionId, paymentSession);

    // Store in database for persistence
    const { error } = await supabase
      .from('payment_sessions')
      .insert({
        id: sessionId,
        session_id: request.sessionId,
        order_id: request.orderId,
        amount: request.amount,
        currency: request.currency,
        status: 'created',
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      console.error('Failed to create payment session in database:', error);
      throw new Error('Failed to create payment session');
    }

    // Set up automatic timeout
    this.setupPaymentTimeout(sessionId);

    console.log(`Created mock payment session ${sessionId} for order ${request.orderId}`);
    return paymentSession;
  }

  /**
   * Get current payment status
   */
  public async getPaymentStatus(sessionId: string): Promise<PaymentStatus> {
    // First check memory cache
    const session = this.paymentSessions.get(sessionId);
    if (session) {
      return this.createPaymentStatusFromSession(session);
    }

    // Fallback to database
    const { data, error } = await supabase
      .from('payment_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !data) {
      throw new Error(`Payment session ${sessionId} not found`);
    }

    const dbSession: PaymentSession = {
      sessionId: data.id,
      orderId: data.order_id,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at),
    };

    // Update memory cache
    this.paymentSessions.set(sessionId, dbSession);

    return this.createPaymentStatusFromSession(dbSession);
  }

  /**
   * Simulate payment processing with configurable success/failure
   */
  public async processPayment(sessionId: string): Promise<PaymentSession> {
    const session = await this.getPaymentSessionById(sessionId);
    
    if (!session) {
      throw new Error(`Payment session ${sessionId} not found`);
    }

    if (session.status !== 'created') {
      throw new Error(`Payment session ${sessionId} is not in a processable state: ${session.status}`);
    }

    // Check if session has expired
    if (new Date() > session.expiresAt) {
      await this.updatePaymentStatus(sessionId, 'cancelled');
      throw new Error(`Payment session ${sessionId} has expired`);
    }

    // Update status to pending
    await this.updatePaymentStatus(sessionId, 'pending');

    // Simulate processing delay
    setTimeout(async () => {
      try {
        await this.simulatePaymentResult(sessionId);
      } catch (error) {
        console.error(`Error simulating payment result for ${sessionId}:`, error);
        await this.updatePaymentStatus(sessionId, 'failed');
      }
    }, this.simulationConfig.processingDelay);

    return await this.getPaymentSessionById(sessionId) as PaymentSession;
  }

  /**
   * Simulate payment result based on configuration
   */
  public async simulatePaymentResult(
    sessionId: string,
    forceResult?: 'success' | 'failure',
    delay?: number
  ): Promise<void> {
    const actualDelay = delay ?? this.simulationConfig.processingDelay;
    
    if (actualDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, actualDelay));
    }

    const session = await this.getPaymentSessionById(sessionId);
    if (!session || session.status === 'cancelled') {
      return;
    }

    // Update to processing first
    await this.updatePaymentStatus(sessionId, 'processing');

    // Determine result
    const shouldSucceed = forceResult === 'success' || 
      (forceResult !== 'failure' && Math.random() < this.simulationConfig.successRate);

    const finalStatus = shouldSucceed ? 'completed' : 'failed';
    await this.updatePaymentStatus(sessionId, finalStatus);

    console.log(`Mock payment ${sessionId} ${finalStatus}`);
  }

  /**
   * Cancel a payment session
   */
  public async cancelPayment(sessionId: string): Promise<PaymentCancellation> {
    const session = await this.getPaymentSessionById(sessionId);
    
    if (!session) {
      return {
        success: false,
        sessionId,
        cancelledAt: new Date(),
        message: `Payment session ${sessionId} not found`,
      };
    }

    if (['completed', 'cancelled'].includes(session.status)) {
      return {
        success: false,
        sessionId,
        cancelledAt: new Date(),
        message: `Payment session ${sessionId} cannot be cancelled (status: ${session.status})`,
      };
    }

    await this.updatePaymentStatus(sessionId, 'cancelled');
    this.clearPaymentTimeout(sessionId);

    const refundAmount = session.status === 'completed' ? session.amount : undefined;

    return {
      success: true,
      sessionId,
      cancelledAt: new Date(),
      refundAmount,
      message: `Payment session ${sessionId} cancelled successfully`,
    };
  }

  /**
   * Retry a failed payment
   */
  public async retryPayment(sessionId: string): Promise<PaymentRetryResult> {
    const session = await this.getPaymentSessionById(sessionId);
    
    if (!session) {
      return {
        success: false,
        message: `Payment session ${sessionId} not found`,
        errorCode: 'SESSION_NOT_FOUND',
      };
    }

    if (session.status !== 'failed') {
      return {
        success: false,
        message: `Payment session ${sessionId} is not in a failed state (status: ${session.status})`,
        errorCode: 'INVALID_STATUS',
      };
    }

    // Check if session has expired
    if (new Date() > session.expiresAt) {
      return {
        success: false,
        message: `Payment session ${sessionId} has expired`,
        errorCode: 'SESSION_EXPIRED',
      };
    }

    // Reset status to created for retry
    await this.updatePaymentStatus(sessionId, 'created');

    return {
      success: true,
      newSessionId: sessionId,
      paymentSession: await this.getPaymentSessionById(sessionId) as PaymentSession,
      message: `Payment session ${sessionId} reset for retry`,
    };
  }

  /**
   * Update simulation configuration
   */
  public updateSimulationConfig(config: Partial<PaymentSimulationConfig>): void {
    this.simulationConfig = { ...this.simulationConfig, ...config };
    console.log('Updated payment simulation config:', this.simulationConfig);
  }

  /**
   * Get current simulation configuration
   */
  public getSimulationConfig(): PaymentSimulationConfig {
    return { ...this.simulationConfig };
  }

  // Private helper methods

  private generatePaymentSessionId(): string {
    return `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getPaymentSessionById(sessionId: string): Promise<PaymentSession | null> {
    // Check memory first
    const cached = this.paymentSessions.get(sessionId);
    if (cached) {
      return cached;
    }

    // Check database
    const { data, error } = await supabase
      .from('payment_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !data) {
      return null;
    }

    const session: PaymentSession = {
      sessionId: data.id,
      orderId: data.order_id,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at),
    };

    // Update cache
    this.paymentSessions.set(sessionId, session);
    return session;
  }

  private async updatePaymentStatus(
    sessionId: string,
    status: PaymentSession['status']
  ): Promise<void> {
    // Update memory cache
    const session = this.paymentSessions.get(sessionId);
    if (session) {
      session.status = status;
      this.paymentSessions.set(sessionId, session);
    }

    // Update database
    const { error } = await supabase
      .from('payment_sessions')
      .update({ status })
      .eq('id', sessionId);

    if (error) {
      console.error(`Failed to update payment session ${sessionId} status:`, error);
    }

    console.log(`Payment session ${sessionId} status updated to: ${status}`);
  }

  private createPaymentStatusFromSession(session: PaymentSession): PaymentStatus {
    const statusChange: PaymentStatusChange = {
      status: session.status,
      timestamp: new Date(),
      metadata: {
        amount: session.amount,
        currency: session.currency,
      },
    };

    return {
      current: session.status,
      sessionId: session.sessionId,
      history: [statusChange],
    };
  }

  private setupPaymentTimeout(sessionId: string): void {
    const timeout = setTimeout(async () => {
      try {
        const session = await this.getPaymentSessionById(sessionId);
        if (session && !['completed', 'cancelled'].includes(session.status)) {
          await this.updatePaymentStatus(sessionId, 'cancelled');
          console.log(`Payment session ${sessionId} timed out and was cancelled`);
        }
      } catch (error) {
        console.error(`Error handling timeout for payment session ${sessionId}:`, error);
      } finally {
        this.paymentTimeouts.delete(sessionId);
      }
    }, this.simulationConfig.timeoutDelay);

    this.paymentTimeouts.set(sessionId, timeout);
  }

  private clearPaymentTimeout(sessionId: string): void {
    const timeout = this.paymentTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.paymentTimeouts.delete(sessionId);
    }
  }

  /**
   * Clean up expired sessions and timeouts
   */
  public async cleanup(): Promise<void> {
    const now = new Date();
    
    // Clean up memory cache
    for (const [sessionId, session] of this.paymentSessions.entries()) {
      if (now > session.expiresAt) {
        this.paymentSessions.delete(sessionId);
        this.clearPaymentTimeout(sessionId);
      }
    }

    // Clean up database (expired sessions)
    const { error } = await supabase
      .from('payment_sessions')
      .delete()
      .lt('expires_at', now.toISOString());

    if (error) {
      console.error('Failed to clean up expired payment sessions:', error);
    }
  }
}

// Export singleton instance
export const mockPaymentService = MockPaymentService.getInstance();