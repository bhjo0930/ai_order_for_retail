import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// In-memory store for mock payment sessions. In a real app, use a database or cache.
const paymentSessions = new Map<string, { status: string, orderId: string }>();

// POST /api/payment - Create a mock payment session
export async function POST(req: NextRequest) {
  try {
    const { orderId, amount } = await req.json();
    if (!orderId || !amount) {
        logger.warn('Payment attempt with missing orderId or amount');
      return NextResponse.json({ error: 'orderId and amount are required' }, { status: 400 });
    }

    const paymentSessionId = `mock_session_${Date.now()}`;
    paymentSessions.set(paymentSessionId, { status: 'pending', orderId });
    logger.info(`Created payment session ${paymentSessionId} for order ${orderId}`);

    // Simulate a delay for payment processing
    setTimeout(() => {
      const outcome = Math.random() > 0.2 ? 'success' : 'failure'; // 80% success rate
      paymentSessions.set(paymentSessionId, { status: outcome, orderId });
      logger.info(`Payment session ${paymentSessionId} for order ${orderId} completed with status: ${outcome}`);
    }, 3000); // 3-second delay

    return NextResponse.json({ paymentSessionId, status: 'pending' });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    logger.error('Error creating payment session', { error: message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/payment?sessionId=... - Check the status of a mock payment session
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const sessionId = url.searchParams.get('sessionId');

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        const session = paymentSessions.get(sessionId);

        if (!session) {
            logger.warn(`Payment session not found for id: ${sessionId}`);
            return NextResponse.json({ error: 'Payment session not found' }, { status: 404 });
        }

        logger.info(`Checked payment status for session ${sessionId}: ${session.status}`);
        return NextResponse.json({ status: session.status, orderId: session.orderId });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        logger.error('Error getting payment status', { error: message });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
