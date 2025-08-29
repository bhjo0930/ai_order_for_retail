import { NextRequest, NextResponse } from 'next/server';
import { paymentIntegrationService } from '@/lib/services/payment-integration';
import { mockPaymentService } from '@/lib/services/mock-payment';

export async function POST(request: NextRequest) {
  try {
    const { action, ...params } = await request.json();

    switch (action) {
      case 'create_session':
        const { orderId, sessionId } = params;
        if (!orderId || !sessionId) {
          return NextResponse.json(
            { error: 'orderId and sessionId are required' },
            { status: 400 }
          );
        }

        const createResult = await paymentIntegrationService.createPaymentSession(orderId, sessionId);
        return NextResponse.json(createResult);

      case 'process_payment':
        const { paymentSessionId, sessionId: processSessionId } = params;
        if (!paymentSessionId || !processSessionId) {
          return NextResponse.json(
            { error: 'paymentSessionId and sessionId are required' },
            { status: 400 }
          );
        }

        const processResult = await paymentIntegrationService.processPayment(paymentSessionId, processSessionId);
        return NextResponse.json(processResult);

      case 'get_status':
        const { orderId: statusOrderId } = params;
        if (!statusOrderId) {
          return NextResponse.json(
            { error: 'orderId is required' },
            { status: 400 }
          );
        }

        const statusResult = await paymentIntegrationService.getPaymentStatus(statusOrderId);
        return NextResponse.json(statusResult);

      case 'retry_payment':
        const { paymentSessionId: retrySessionId, sessionId: retryUserSessionId } = params;
        if (!retrySessionId || !retryUserSessionId) {
          return NextResponse.json(
            { error: 'paymentSessionId and sessionId are required' },
            { status: 400 }
          );
        }

        const retryResult = await paymentIntegrationService.retryPayment(retrySessionId, retryUserSessionId);
        return NextResponse.json(retryResult);

      case 'cancel_payment':
        const { paymentSessionId: cancelSessionId, sessionId: cancelUserSessionId, orderId: cancelOrderId } = params;
        if (!cancelSessionId || !cancelUserSessionId || !cancelOrderId) {
          return NextResponse.json(
            { error: 'paymentSessionId, sessionId, and orderId are required' },
            { status: 400 }
          );
        }

        const cancelResult = await paymentIntegrationService.cancelPayment(cancelSessionId, cancelUserSessionId, cancelOrderId);
        return NextResponse.json(cancelResult);

      case 'generate_receipt':
        const { paymentSessionId: receiptSessionId, orderId: receiptOrderId } = params;
        if (!receiptSessionId || !receiptOrderId) {
          return NextResponse.json(
            { error: 'paymentSessionId and orderId are required' },
            { status: 400 }
          );
        }

        const receipt = await paymentIntegrationService.generateReceipt(receiptSessionId, receiptOrderId);
        return NextResponse.json({ receipt });

      case 'simulate_result':
        const { paymentSessionId: simSessionId, result, delay } = params;
        if (!simSessionId || !result) {
          return NextResponse.json(
            { error: 'paymentSessionId and result are required' },
            { status: 400 }
          );
        }

        await mockPaymentService.simulatePaymentResult(simSessionId, result, delay);
        return NextResponse.json({ success: true, message: `Payment ${result} simulated` });

      case 'update_config':
        const { config } = params;
        if (!config) {
          return NextResponse.json(
            { error: 'config is required' },
            { status: 400 }
          );
        }

        mockPaymentService.updateSimulationConfig(config);
        return NextResponse.json({ 
          success: true, 
          message: 'Configuration updated',
          config: mockPaymentService.getSimulationConfig()
        });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Payment API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'config':
        const config = mockPaymentService.getSimulationConfig();
        return NextResponse.json({ config });

      default:
        return NextResponse.json({
          message: 'Payment API',
          availableActions: [
            'create_session',
            'process_payment',
            'get_status',
            'retry_payment',
            'cancel_payment',
            'generate_receipt',
            'simulate_result',
            'update_config'
          ]
        });
    }

  } catch (error) {
    console.error('Payment API GET error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}