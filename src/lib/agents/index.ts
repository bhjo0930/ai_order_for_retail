// Business Logic Agents for Mobile Voice Ordering System
// Export all agents and their function declarations

export { ProductAgent, productAgentFunctions } from './product-agent';
export { CouponAgent, couponAgentFunctions } from './coupon-agent';
export { OrderAgent, orderAgentFunctions } from './order-agent';

// Combined function declarations for LLM integration
export const allAgentFunctions = {
  // Product Agent functions
  search_catalog: productAgentFunctions.search_catalog,
  get_product: productAgentFunctions.get_product,
  add_to_cart: productAgentFunctions.add_to_cart,
  update_cart_item: productAgentFunctions.update_cart_item,
  clear_cart: productAgentFunctions.clear_cart,
  get_recommendations: productAgentFunctions.get_recommendations,
  update_inventory: productAgentFunctions.update_inventory,
  check_availability: productAgentFunctions.check_availability,

  // Coupon Agent functions
  validate_coupon: couponAgentFunctions.validate_coupon,
  apply_coupon: couponAgentFunctions.apply_coupon,
  remove_coupon: couponAgentFunctions.remove_coupon,
  list_available_coupons: couponAgentFunctions.list_available_coupons,
  compute_discount: couponAgentFunctions.compute_discount,
  get_coupon_recommendations: couponAgentFunctions.get_coupon_recommendations,

  // Order Agent functions
  create_order: orderAgentFunctions.create_order,
  quote_delivery_fee: orderAgentFunctions.quote_delivery_fee,
  set_order_status: orderAgentFunctions.set_order_status,
  get_pickup_locations: orderAgentFunctions.get_pickup_locations,
  schedule_pickup: orderAgentFunctions.schedule_pickup,
  get_order_status: orderAgentFunctions.get_order_status,
  validate_customer_info: orderAgentFunctions.validate_customer_info
};

// Agent routing helper
export class AgentRouter {
  static getAgentForFunction(functionName: string): string {
    const productFunctions = Object.keys(productAgentFunctions);
    const couponFunctions = Object.keys(couponAgentFunctions);
    const orderFunctions = Object.keys(orderAgentFunctions);

    if (productFunctions.includes(functionName)) {
      return 'product';
    } else if (couponFunctions.includes(functionName)) {
      return 'coupon';
    } else if (orderFunctions.includes(functionName)) {
      return 'order';
    } else {
      throw new Error(`Unknown function: ${functionName}`);
    }
  }

  static async executeFunction(
    functionName: string,
    parameters: Record<string, any>
  ): Promise<any> {
    const agent = this.getAgentForFunction(functionName);

    switch (agent) {
      case 'product':
        return await (ProductAgent as any)[functionName](...Object.values(parameters));
      case 'coupon':
        return await (CouponAgent as any)[functionName](...Object.values(parameters));
      case 'order':
        return await (OrderAgent as any)[functionName](...Object.values(parameters));
      default:
        throw new Error(`Unknown agent: ${agent}`);
    }
  }
}

// Import statements for the agents
import { ProductAgent, productAgentFunctions } from './product-agent';
import { CouponAgent, couponAgentFunctions } from './coupon-agent';
import { OrderAgent, orderAgentFunctions } from './order-agent';