import { supabase } from '@/lib/supabaseClient';
import { Order } from '@/lib/types'; // Assuming Order type is defined in types.ts
import { logger } from '@/lib/logger';

export const create_order = async (orderDetails: Partial<Order>) => {
  logger.info('Creating order with details', { orderDetails });

  const { data, error } = await supabase
    .from('orders')
    .insert([{ ...orderDetails, status: 'created', payment_status: 'pending' }])
    .select()
    .single();

  if (error) {
    logger.error('Error creating order', { error });
    throw new Error('Failed to create order in database.');
  }

  return { success: true, order: data };
};

export const initiate_payment = async ({ orderId }: { orderId: string }) => {
    logger.info(`Initiating payment for order: ${orderId}`);

    // In a real app, you would get the order amount from the database
    const amount = 10000; // Mock amount

    // This assumes the payment API is running on the same host.
    // In a real microservices architecture, this URL would be configurable.
    const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount }),
    });

    if (!res.ok) {
        logger.error(`Failed to initiate payment for order ${orderId}`, { status: res.status });
        throw new Error('Payment API call failed.');
    }

    const paymentSession = await res.json();

    // Update the order with the payment session id
    await supabase
        .from('orders')
        .update({ payment_status: `session_${paymentSession.paymentSessionId}` })
        .eq('id', orderId);

    return { success: true, ...paymentSession };
};
