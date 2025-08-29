import { supabase, supabaseAdmin, Database } from '../supabase';
import { 
  Product, 
  Order, 
  Coupon, 
  ConversationSession, 
  PaymentSession, 
  StoreLocation,
  Cart,
  CartItem,
  OrderItem
} from '../types';

// Product operations
export class ProductService {
  static async searchProducts(
    query: string = '', 
    categoryFilter?: string, 
    limit: number = 20
  ): Promise<Product[]> {
    const { data, error } = await supabase.rpc('search_products', {
      search_query: query,
      category_filter: categoryFilter,
      limit_count: limit
    });

    if (error) throw error;
    
    return data.map(this.mapDatabaseProductToProduct);
  }

  static async getProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        product_options (
          id,
          name,
          type,
          required,
          choices
        )
      `)
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return this.mapDatabaseProductToProduct(data);
  }

  static async updateInventory(productId: string, delta: number): Promise<void> {
    const { error } = await supabaseAdmin
      .from('products')
      .update({ 
        inventory_count: supabase.raw(`inventory_count + ${delta}`),
        updated_at: new Date().toISOString()
      })
      .eq('id', productId);

    if (error) throw error;
  }

  static async getProductsByCategory(category: string): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('category', category)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    
    return data.map(this.mapDatabaseProductToProduct);
  }

  private static mapDatabaseProductToProduct(dbProduct: any): Product {
    return {
      id: dbProduct.id,
      name: dbProduct.name,
      description: dbProduct.description || '',
      price: dbProduct.price,
      currency: dbProduct.currency,
      category: dbProduct.category,
      imageUrl: dbProduct.image_url,
      options: dbProduct.product_options || dbProduct.options || [],
      inventory: {
        count: dbProduct.inventory_count,
        isAvailable: dbProduct.inventory_count > 0,
        lowStockThreshold: 5
      },
      tags: dbProduct.tags || [],
      isActive: dbProduct.is_active
    };
  }
}

// Coupon operations
export class CouponService {
  static async validateCoupon(
    code: string, 
    cartTotal: number, 
    cartItems: CartItem[] = []
  ): Promise<{
    isValid: boolean;
    couponId?: string;
    discountAmount?: number;
    discountType?: string;
    errorMessage?: string;
  }> {
    const { data, error } = await supabase.rpc('validate_coupon', {
      coupon_code: code,
      cart_total: cartTotal,
      cart_items: JSON.stringify(cartItems)
    });

    if (error) throw error;
    
    return data[0] || { isValid: false, errorMessage: 'Unknown error' };
  }

  static async getCoupon(id: string): Promise<Coupon | null> {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return this.mapDatabaseCouponToCoupon(data);
  }

  static async getActiveCoupons(): Promise<Coupon[]> {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .gte('valid_until', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return data.map(this.mapDatabaseCouponToCoupon);
  }

  static async incrementCouponUsage(couponId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('coupons')
      .update({ 
        usage_count: supabase.raw('usage_count + 1'),
        updated_at: new Date().toISOString()
      })
      .eq('id', couponId);

    if (error) throw error;
  }

  private static mapDatabaseCouponToCoupon(dbCoupon: any): Coupon {
    return {
      id: dbCoupon.id,
      code: dbCoupon.code,
      name: dbCoupon.name,
      description: dbCoupon.description || '',
      discountType: dbCoupon.discount_type,
      discountValue: dbCoupon.discount_value,
      minimumOrderAmount: dbCoupon.minimum_order_amount,
      maximumDiscountAmount: dbCoupon.maximum_discount_amount,
      validFrom: new Date(dbCoupon.valid_from),
      validUntil: new Date(dbCoupon.valid_until),
      usageLimit: dbCoupon.usage_limit,
      usageCount: dbCoupon.usage_count,
      restrictions: dbCoupon.restrictions || [],
      isActive: dbCoupon.is_active
    };
  }
}

// Order operations
export class OrderService {
  static async createOrder(orderData: {
    sessionId: string;
    customerId?: string;
    items: OrderItem[];
    orderType: 'pickup' | 'delivery';
    customerInfo: any;
    deliveryInfo?: any;
    pickupInfo?: any;
    pricing: any;
    specialInstructions?: string;
  }): Promise<Order> {
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        session_id: orderData.sessionId,
        customer_id: orderData.customerId,
        order_type: orderData.orderType,
        status: 'created',
        payment_status: 'pending',
        customer_info: orderData.customerInfo,
        delivery_info: orderData.deliveryInfo,
        pickup_info: orderData.pickupInfo,
        pricing: orderData.pricing,
        special_instructions: orderData.specialInstructions
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Insert order items
    const orderItems = orderData.items.map(item => ({
      order_id: order.id,
      product_id: item.productId,
      quantity: item.quantity,
      selected_options: item.selectedOptions,
      unit_price: item.unitPrice,
      total_price: item.totalPrice
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Create initial status history
    await this.addStatusHistory(order.id, 'created', {});

    return this.mapDatabaseOrderToOrder(order);
  }

  static async getOrder(id: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        order_status_history (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return this.mapDatabaseOrderToOrder(data);
  }

  static async updateOrderStatus(
    orderId: string, 
    status: string, 
    metadata: any = {}
  ): Promise<void> {
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    await this.addStatusHistory(orderId, status, metadata);
  }

  static async updatePaymentStatus(
    orderId: string, 
    paymentStatus: string,
    metadata: any = {}
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('orders')
      .update({ 
        payment_status: paymentStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (error) throw error;
  }

  static async getOrderByPaymentSession(paymentSessionId: string): Promise<Order | null> {
    // First get the payment session to find the order ID
    const { data: paymentSession, error: paymentError } = await supabase
      .from('payment_sessions')
      .select('order_id')
      .eq('id', paymentSessionId)
      .single();

    if (paymentError || !paymentSession) {
      return null;
    }

    return this.getOrder(paymentSession.order_id);
  }

  static async getOrdersBySession(sessionId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        order_status_history (*)
      `)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return data.map(this.mapDatabaseOrderToOrder);
  }

  private static async addStatusHistory(
    orderId: string, 
    status: string, 
    metadata: any
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('order_status_history')
      .insert({
        order_id: orderId,
        status,
        metadata
      });

    if (error) throw error;
  }

  private static mapDatabaseOrderToOrder(dbOrder: any): Order {
    return {
      id: dbOrder.id,
      sessionId: dbOrder.session_id,
      customerId: dbOrder.customer_id,
      items: dbOrder.order_items?.map((item: any) => ({
        productId: item.product_id,
        quantity: item.quantity,
        selectedOptions: item.selected_options || {},
        unitPrice: item.unit_price,
        totalPrice: item.total_price
      })) || [],
      orderType: dbOrder.order_type,
      status: {
        current: dbOrder.status,
        history: dbOrder.order_status_history?.map((h: any) => ({
          status: h.status,
          timestamp: new Date(h.created_at),
          metadata: h.metadata
        })) || [],
        estimatedCompletion: undefined // Will be calculated based on order type and current status
      },
      paymentStatus: {
        current: dbOrder.payment_status,
        history: [] // Will be populated from payment service
      },
      customerInfo: dbOrder.customer_info,
      deliveryInfo: dbOrder.delivery_info,
      pickupInfo: dbOrder.pickup_info,
      pricing: dbOrder.pricing,
      timestamps: {
        created: new Date(dbOrder.created_at),
        confirmed: undefined, // Will be populated from status history
        preparing: undefined,
        ready: undefined,
        completed: undefined,
        cancelled: undefined
      },
      specialInstructions: dbOrder.special_instructions
    };
  }
}

// Session operations
export class SessionService {
  static async createSession(sessionId: string, userId?: string): Promise<ConversationSession> {
    const sessionData = {
      id: sessionId,
      user_id: userId,
      current_state: 'idle',
      conversation_history: [],
      cart: {
        sessionId,
        items: [],
        subtotal: 0,
        discounts: [],
        taxes: [],
        total: 0,
        currency: 'KRW',
        updatedAt: new Date()
      },
      preferences: {
        language: 'ko-KR',
        currency: 'KRW'
      }
    };

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) throw error;

    return this.mapDatabaseSessionToSession(data);
  }

  static async getSession(sessionId: string): Promise<ConversationSession | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return this.mapDatabaseSessionToSession(data);
  }

  static async updateSession(
    sessionId: string, 
    updates: Partial<{
      currentState: string;
      conversationHistory: any[];
      cart: Cart;
      currentOrderId: string;
      preferences: any;
    }>
  ): Promise<void> {
    const updateData: any = {
      last_activity: new Date().toISOString()
    };

    if (updates.currentState) updateData.current_state = updates.currentState;
    if (updates.conversationHistory) updateData.conversation_history = updates.conversationHistory;
    if (updates.cart) updateData.cart = updates.cart;
    if (updates.currentOrderId) updateData.current_order_id = updates.currentOrderId;
    if (updates.preferences) updateData.preferences = updates.preferences;

    const { error } = await supabaseAdmin
      .from('sessions')
      .update(updateData)
      .eq('id', sessionId);

    if (error) throw error;
  }

  static async updateSessionState(
    sessionId: string,
    state: string,
    context: any = {}
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('sessions')
      .update({
        current_state: state,
        last_activity: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) throw error;
  }

  static async extendSession(sessionId: string, hours: number = 2): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hours);

    const { error } = await supabaseAdmin
      .from('sessions')
      .update({ 
        expires_at: expiresAt.toISOString(),
        last_activity: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) throw error;
  }

  static async cleanupExpiredSessions(): Promise<number> {
    const { data, error } = await supabaseAdmin.rpc('cleanup_expired_sessions');
    
    if (error) throw error;
    
    return data || 0;
  }

  private static mapDatabaseSessionToSession(dbSession: any): ConversationSession {
    return {
      sessionId: dbSession.id,
      userId: dbSession.user_id,
      currentState: {
        current: dbSession.current_state,
        context: {
          retryCount: 0,
          missingSlots: [],
          pendingActions: []
        },
        allowedTransitions: [] // Will be populated by state machine logic
      },
      conversationHistory: dbSession.conversation_history || [],
      cart: dbSession.cart || {
        sessionId: dbSession.id,
        items: [],
        subtotal: 0,
        discounts: [],
        taxes: [],
        total: 0,
        currency: 'KRW',
        updatedAt: new Date()
      },
      currentOrder: undefined, // Will be loaded separately if needed
      preferences: dbSession.preferences || {
        language: 'ko-KR',
        currency: 'KRW'
      },
      createdAt: new Date(dbSession.created_at),
      lastActivity: new Date(dbSession.last_activity),
      expiresAt: new Date(dbSession.expires_at)
    };
  }
}

// Payment operations (Mock)
export class PaymentService {
  static async createPaymentSession(
    sessionId: string,
    orderId: string,
    amount: number,
    currency: string = 'KRW'
  ): Promise<PaymentSession> {
    const { data, error } = await supabaseAdmin
      .from('payment_sessions')
      .insert({
        session_id: sessionId,
        order_id: orderId,
        amount,
        currency,
        status: 'created'
      })
      .select()
      .single();

    if (error) throw error;

    return this.mapDatabasePaymentSessionToPaymentSession(data);
  }

  static async getPaymentSession(paymentSessionId: string): Promise<PaymentSession | null> {
    const { data, error } = await supabase
      .from('payment_sessions')
      .select('*')
      .eq('id', paymentSessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return this.mapDatabasePaymentSessionToPaymentSession(data);
  }

  static async updatePaymentStatus(
    paymentSessionId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('payment_sessions')
      .update({ status })
      .eq('id', paymentSessionId);

    if (error) throw error;
  }

  static async simulatePaymentResult(
    paymentSessionId: string,
    result: 'success' | 'failure',
    delayMs: number = 2000
  ): Promise<void> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const status = result === 'success' ? 'completed' : 'failed';
    await this.updatePaymentStatus(paymentSessionId, status);
  }

  private static mapDatabasePaymentSessionToPaymentSession(dbPayment: any): PaymentSession {
    return {
      sessionId: dbPayment.id,
      orderId: dbPayment.order_id,
      amount: dbPayment.amount,
      currency: dbPayment.currency,
      status: dbPayment.status,
      createdAt: new Date(dbPayment.created_at),
      expiresAt: new Date(dbPayment.expires_at)
    };
  }
}

// Store location operations
export class StoreLocationService {
  static async getActiveStoreLocations(): Promise<StoreLocation[]> {
    const { data, error } = await supabase
      .from('store_locations')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    
    return data.map(this.mapDatabaseStoreLocationToStoreLocation);
  }

  static async getStoreLocation(id: string): Promise<StoreLocation | null> {
    const { data, error } = await supabase
      .from('store_locations')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return this.mapDatabaseStoreLocationToStoreLocation(data);
  }

  static async getNearbyStoreLocations(
    lat: number,
    lng: number,
    radiusKm: number = 10
  ): Promise<StoreLocation[]> {
    // This would require PostGIS extension for proper geographic queries
    // For now, return all active locations
    return this.getActiveStoreLocations();
  }

  private static mapDatabaseStoreLocationToStoreLocation(dbLocation: any): StoreLocation {
    return {
      id: dbLocation.id,
      name: dbLocation.name,
      address: dbLocation.address,
      phone: dbLocation.phone,
      coordinates: dbLocation.coordinates ? {
        lat: dbLocation.coordinates.x,
        lng: dbLocation.coordinates.y
      } : undefined,
      operatingHours: dbLocation.operating_hours || {},
      isActive: dbLocation.is_active
    };
  }
}

// Utility functions for order calculations
export class OrderCalculationService {
  static async calculateOrderTotals(
    items: CartItem[],
    appliedCoupons: any[] = [],
    deliveryFee: number = 0
  ): Promise<{
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    finalTotal: number;
  }> {
    const itemsJson = JSON.stringify(items.map(item => ({
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice
    })));

    const couponsJson = JSON.stringify(appliedCoupons);

    const { data, error } = await supabase.rpc('calculate_order_totals', {
      items: itemsJson,
      applied_coupons: couponsJson,
      delivery_fee: deliveryFee
    });

    if (error) throw error;
    
    return data[0] || {
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      finalTotal: 0
    };
  }

  static async updateInventoryForOrder(orderId: string): Promise<void> {
    const { data, error } = await supabaseAdmin.rpc('update_inventory_for_order', {
      order_uuid: orderId
    });

    if (error) throw error;
    
    return data;
  }
}

// All services are already exported above as classes