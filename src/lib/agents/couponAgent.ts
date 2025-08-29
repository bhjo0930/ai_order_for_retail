import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export const validate_coupon = async ({ code }: { code: string }) => {
  logger.info(`Validating coupon: ${code}`);

  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (error) {
    logger.error('Error validating coupon', { error, code });
    throw new Error(`Database error while validating coupon ${code}.`);
  }

  if (!data) {
    return { isValid: false, message: "Invalid coupon code." };
  }

  // Check if coupon is expired
  if (data.valid_until && new Date(data.valid_until) < new Date()) {
      return { isValid: false, message: "This coupon has expired." };
  }

  // In a real app, you'd check more conditions (e.g., usage limits, minimum order)

  return {
      isValid: true,
      coupon: data
  };
};
