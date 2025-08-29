import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export const search_catalog = async ({ query }: { query: string }) => {
  logger.info(`Searching catalog for: ${query}`);

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .textSearch('name', query, { type: 'plain' })
    .eq('is_active', true)
    .limit(10);

  if (error) {
    logger.error('Error searching for products', { error });
    throw new Error('Failed to search for products in database.');
  }

  return { products: data };
};

export const add_to_cart = async ({ productId, quantity }: { productId: string, quantity: number }) => {
    logger.info(`Adding ${quantity} of product ${productId} to cart.`);
    // This is a simplified implementation. A real implementation would involve
    // managing a cart in the database, probably linked to a session.
    // For now, we'll just simulate success.
    return { success: true, message: `Added ${quantity} of product ${productId} to cart.` };
};
