import { 
  Order, 
  OrderCreationRequest, 
  OrderCreated, 
  DeliveryAddress, 
  DeliveryQuote, 
  OrderUpdate, 
  PickupLocation, 
  PickupSchedule, 
  OrderStatus, 
  OrderStatusMetadata, 
  CustomerInfo, 
  GeoLocation,
  OrderItem,
  OrderPricing,
  DeliveryInfo,
  PickupInfo
} from '../types';
import { 
  OrderService, 
  SessionService, 
  StoreLocationService, 
  OrderCalculationService,
  PaymentService
} from '../database';
import { paymentIntegrationService } from '../services/payment-integration';

/**
 * Order Agent - Handles order creation workflow, delivery/pickup management,
 * status tracking, and customer information collection for the voice ordering system.
 * 
 * Requirements covered: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export class OrderAgent {

  /**
   * Create new order from session cart
   * Requirement 5.1: Order creation workflow for pickup and delivery
   */
  static async create_order(
    sessionId: string,
    orderDetails: OrderCreationRequest
  ): Promise<OrderCreated> {
    try {
      const session = await SessionService.getSession(sessionId);
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      const cart = session.cart;
      if (cart.items.length === 0) {
        throw new Error('장바구니가 비어있습니다.');
      }

      // Validate customer information
      this.validateCustomerInfo(orderDetails.customerInfo);

      // Validate order type specific information
      if (orderDetails.orderType === 'delivery') {
        if (!orderDetails.deliveryAddress) {
          throw new Error('배달 주문에는 배달 주소가 필요합니다.');
        }
        this.validateDeliveryAddress(orderDetails.deliveryAddress);
      } else if (orderDetails.orderType === 'pickup') {
        if (!orderDetails.pickupLocation) {
          throw new Error('픽업 주문에는 픽업 장소가 필요합니다.');
        }
      }

      // Convert cart items to order items
      const orderItems: OrderItem[] = cart.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice
      }));

      // Calculate delivery fee if needed
      let deliveryFee = 0;
      let deliveryInfo: DeliveryInfo | undefined;
      let pickupInfo: PickupInfo | undefined;

      if (orderDetails.orderType === 'delivery') {
        const deliveryQuote = await this.quote_delivery_fee(
          orderDetails.deliveryAddress!,
          orderItems
        );
        deliveryFee = deliveryQuote.fee;
        
        deliveryInfo = {
          address: orderDetails.deliveryAddress!,
          fee: deliveryFee,
          estimatedTime: deliveryQuote.estimatedDeliveryTime,
          instructions: orderDetails.deliveryAddress!.instructions
        };
      } else {
        const location = await StoreLocationService.getStoreLocation(orderDetails.pickupLocation!.id);
        if (!location) {
          throw new Error('픽업 장소를 찾을 수 없습니다.');
        }

        pickupInfo = {
          locationId: location.id,
          locationName: location.name,
          address: location.address,
          estimatedTime: this.calculatePickupTime(),
          instructions: orderDetails.specialInstructions
        };
      }

      // Calculate final pricing
      const totals = await OrderCalculationService.calculateOrderTotals(
        cart.items,
        cart.discounts,
        deliveryFee
      );

      const pricing: OrderPricing = {
        subtotal: totals.subtotal,
        discounts: cart.discounts,
        taxes: [{
          type: 'VAT',
          rate: 0.1,
          amount: totals.taxTotal
        }],
        deliveryFee: deliveryFee > 0 ? deliveryFee : undefined,
        total: totals.finalTotal,
        currency: 'KRW'
      };

      // Create order in database
      const order = await OrderService.createOrder({
        sessionId,
        customerId: session.userId,
        items: orderItems,
        orderType: orderDetails.orderType,
        customerInfo: orderDetails.customerInfo,
        deliveryInfo,
        pickupInfo,
        pricing,
        specialInstructions: orderDetails.specialInstructions
      });

      // Clear cart after successful order creation
      const emptyCart = {
        sessionId,
        items: [],
        subtotal: 0,
        discounts: [],
        taxes: [],
        total: 0,
        currency: 'KRW',
        updatedAt: new Date()
      };

      await SessionService.updateSession(sessionId, { 
        cart: emptyCart,
        currentOrderId: order.id
      });

      return {
        success: true,
        order,
        estimatedCompletion: this.calculateEstimatedCompletion(order),
        message: `주문이 성공적으로 생성되었습니다. 주문번호: ${order.id.slice(-8)}`
      };

    } catch (error) {
      console.error('Create order error:', error);
      return {
        success: false,
        errorMessage: `주문 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'ORDER_CREATION_ERROR'
      };
    }
  }

  /**
   * Calculate delivery fee and estimated time
   * Requirement 5.2: Delivery fee calculation
   */
  static async quote_delivery_fee(
    address: DeliveryAddress,
    items: OrderItem[]
  ): Promise<DeliveryQuote> {
    try {
      // Basic delivery fee calculation
      // In a real system, this would integrate with mapping services
      let baseFee = 3000; // Base delivery fee in KRW
      let estimatedTime = 30; // Base delivery time in minutes

      // Calculate distance-based fee (mock calculation)
      const distanceKm = this.calculateDistance(address);
      if (distanceKm > 5) {
        baseFee += Math.ceil((distanceKm - 5) / 2) * 1000; // Additional 1000 KRW per 2km
        estimatedTime += Math.ceil((distanceKm - 5) / 2) * 5; // Additional 5 minutes per 2km
      }

      // Weight-based fee adjustment
      const totalWeight = this.calculateOrderWeight(items);
      if (totalWeight > 5) {
        baseFee += Math.ceil((totalWeight - 5) / 2) * 500; // Additional 500 KRW per 2kg
      }

      // Time-based adjustment (peak hours)
      const now = new Date();
      const hour = now.getHours();
      if ((hour >= 11 && hour <= 13) || (hour >= 18 && hour <= 20)) {
        baseFee += 1000; // Peak hour surcharge
        estimatedTime += 10; // Additional time during peak hours
      }

      // Minimum order for free delivery
      const orderTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
      if (orderTotal >= 30000) {
        baseFee = Math.max(0, baseFee - 2000); // 2000 KRW discount for orders over 30,000 KRW
      }

      return {
        address,
        fee: baseFee,
        estimatedDeliveryTime: estimatedTime,
        breakdown: {
          baseFee: 3000,
          distanceFee: baseFee - 3000 > 0 ? baseFee - 3000 : 0,
          peakHourSurcharge: (hour >= 11 && hour <= 13) || (hour >= 18 && hour <= 20) ? 1000 : 0,
          discount: orderTotal >= 30000 ? -2000 : 0
        },
        freeDeliveryThreshold: 30000,
        message: baseFee === 0 ? '무료 배송' : `배송비 ${baseFee.toLocaleString()}원`
      };

    } catch (error) {
      console.error('Quote delivery fee error:', error);
      throw new Error(`배송비 계산 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Update order status with tracking
   * Requirement 5.6: Order status tracking and update notifications
   */
  static async set_order_status(
    orderId: string,
    status: OrderStatus['current'],
    metadata?: OrderStatusMetadata
  ): Promise<OrderUpdate> {
    try {
      const order = await OrderService.getOrder(orderId);
      if (!order) {
        throw new Error('주문을 찾을 수 없습니다.');
      }

      // Validate status transition
      const isValidTransition = this.validateStatusTransition(order.status.current, status);
      if (!isValidTransition) {
        throw new Error(`${order.status.current}에서 ${status}로 상태 변경이 불가능합니다.`);
      }

      // Update order status
      await OrderService.updateOrderStatus(orderId, status, metadata || {});

      // Get updated order
      const updatedOrder = await OrderService.getOrder(orderId);
      if (!updatedOrder) {
        throw new Error('업데이트된 주문 정보를 가져올 수 없습니다.');
      }

      // Calculate new estimated completion time
      const estimatedCompletion = this.calculateEstimatedCompletion(updatedOrder);

      return {
        success: true,
        orderId,
        previousStatus: order.status.current,
        newStatus: status,
        estimatedCompletion,
        message: this.getStatusUpdateMessage(status),
        notificationRequired: this.shouldNotifyCustomer(status)
      };

    } catch (error) {
      console.error('Set order status error:', error);
      return {
        success: false,
        orderId,
        errorMessage: `주문 상태 업데이트 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'STATUS_UPDATE_ERROR'
      };
    }
  }

  /**
   * Get available pickup locations
   * Requirement 5.3: Pickup location management
   */
  static async get_pickup_locations(location?: GeoLocation): Promise<PickupLocation[]> {
    try {
      let storeLocations;
      
      if (location) {
        // Get nearby locations
        storeLocations = await StoreLocationService.getNearbyStoreLocations(
          location.lat,
          location.lng,
          10 // 10km radius
        );
      } else {
        // Get all active locations
        storeLocations = await StoreLocationService.getActiveStoreLocations();
      }

      return storeLocations.map(store => ({
        id: store.id,
        name: store.name,
        address: store.address,
        phone: store.phone,
        coordinates: store.coordinates,
        operatingHours: store.operatingHours,
        isCurrentlyOpen: this.isStoreCurrentlyOpen(store.operatingHours),
        estimatedPickupTime: this.calculatePickupTime(),
        distance: location && store.coordinates ? 
          this.calculateDistanceFromCoordinates(
            location.lat, 
            location.lng, 
            store.coordinates.lat, 
            store.coordinates.lng
          ) : undefined
      })).sort((a, b) => {
        // Sort by distance if available, otherwise by name
        if (a.distance !== undefined && b.distance !== undefined) {
          return a.distance - b.distance;
        }
        return a.name.localeCompare(b.name);
      });

    } catch (error) {
      console.error('Get pickup locations error:', error);
      throw new Error(`픽업 장소를 가져오는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Schedule pickup time and location
   * Requirement 5.3: Pickup location management
   */
  static async schedule_pickup(
    orderId: string,
    locationId: string,
    preferredTime: string
  ): Promise<PickupSchedule> {
    try {
      const order = await OrderService.getOrder(orderId);
      if (!order) {
        throw new Error('주문을 찾을 수 없습니다.');
      }

      if (order.orderType !== 'pickup') {
        throw new Error('픽업 주문이 아닙니다.');
      }

      const location = await StoreLocationService.getStoreLocation(locationId);
      if (!location) {
        throw new Error('픽업 장소를 찾을 수 없습니다.');
      }

      // Parse preferred time
      const preferredDate = new Date(preferredTime);
      if (isNaN(preferredDate.getTime())) {
        throw new Error('올바른 시간 형식이 아닙니다.');
      }

      // Validate pickup time is in the future
      if (preferredDate <= new Date()) {
        throw new Error('픽업 시간은 현재 시간 이후여야 합니다.');
      }

      // Check if store is open at preferred time
      const isOpenAtTime = this.isStoreOpenAtTime(location.operatingHours, preferredDate);
      if (!isOpenAtTime) {
        throw new Error('해당 시간에는 매장이 운영하지 않습니다.');
      }

      // Update order with pickup information
      const pickupInfo: PickupInfo = {
        locationId: location.id,
        locationName: location.name,
        address: location.address,
        estimatedTime: preferredDate,
        instructions: `${location.name}에서 픽업 예정`
      };

      // This would typically update the order in the database
      // For now, we'll just return the schedule information

      return {
        success: true,
        orderId,
        pickupLocation: {
          id: location.id,
          name: location.name,
          address: location.address,
          phone: location.phone,
          coordinates: location.coordinates,
          operatingHours: location.operatingHours,
          isCurrentlyOpen: this.isStoreCurrentlyOpen(location.operatingHours),
          estimatedPickupTime: this.calculatePickupTime(),
          distance: undefined
        },
        scheduledTime: preferredDate,
        confirmationCode: this.generatePickupConfirmationCode(),
        message: `${location.name}에서 ${preferredDate.toLocaleString('ko-KR')}에 픽업 예약이 완료되었습니다.`
      };

    } catch (error) {
      console.error('Schedule pickup error:', error);
      return {
        success: false,
        orderId,
        errorMessage: `픽업 예약 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'PICKUP_SCHEDULE_ERROR'
      };
    }
  }

  /**
   * Get order status and tracking information
   * Requirement 5.6: Order status tracking
   */
  static async get_order_status(orderId: string): Promise<{
    order: Order;
    trackingInfo: {
      currentStatus: string;
      statusHistory: Array<{
        status: string;
        timestamp: Date;
        description: string;
      }>;
      estimatedCompletion?: Date;
      nextUpdate?: string;
    };
  }> {
    try {
      const order = await OrderService.getOrder(orderId);
      if (!order) {
        throw new Error('주문을 찾을 수 없습니다.');
      }

      const trackingInfo = {
        currentStatus: order.status.current,
        statusHistory: order.status.history.map(h => ({
          status: h.status,
          timestamp: h.timestamp,
          description: this.getStatusDescription(h.status)
        })),
        estimatedCompletion: this.calculateEstimatedCompletion(order),
        nextUpdate: this.getNextStatusUpdate(order.status.current)
      };

      return {
        order,
        trackingInfo
      };

    } catch (error) {
      console.error('Get order status error:', error);
      throw new Error(`주문 상태 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Create payment session for order
   * Requirement 6.1: Connect mock payment completion to order confirmation
   */
  static async create_payment_session(
    orderId: string,
    sessionId: string
  ): Promise<{
    success: boolean;
    paymentSessionId?: string;
    message: string;
    errorCode?: string;
  }> {
    try {
      const result = await paymentIntegrationService.createPaymentSession(orderId, sessionId);
      
      return {
        success: result.success,
        paymentSessionId: result.paymentSession?.sessionId,
        message: result.message,
        errorCode: result.errorCode
      };

    } catch (error) {
      console.error('Create payment session error:', error);
      return {
        success: false,
        message: `결제 세션 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'PAYMENT_SESSION_ERROR'
      };
    }
  }

  /**
   * Process payment for order
   * Requirement 6.1: Connect mock payment completion to order confirmation
   */
  static async process_payment(
    paymentSessionId: string,
    sessionId: string
  ): Promise<{
    success: boolean;
    status?: string;
    message: string;
    errorCode?: string;
  }> {
    try {
      const result = await paymentIntegrationService.processPayment(paymentSessionId, sessionId);
      
      return {
        success: result.success,
        status: result.paymentSession?.status,
        message: result.message,
        errorCode: result.errorCode
      };

    } catch (error) {
      console.error('Process payment error:', error);
      return {
        success: false,
        message: `결제 처리 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'PAYMENT_PROCESSING_ERROR'
      };
    }
  }

  /**
   * Retry failed payment
   * Requirement 6.2: Implement payment failure handling with retry options
   */
  static async retry_payment(
    paymentSessionId: string,
    sessionId: string
  ): Promise<{
    success: boolean;
    newPaymentSessionId?: string;
    message: string;
    errorCode?: string;
  }> {
    try {
      const result = await paymentIntegrationService.retryPayment(paymentSessionId, sessionId);
      
      return {
        success: result.success,
        newPaymentSessionId: result.paymentSession?.sessionId,
        message: result.message,
        errorCode: result.errorCode
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
  static async cancel_payment(
    paymentSessionId: string,
    sessionId: string,
    orderId: string
  ): Promise<{
    success: boolean;
    refundAmount?: number;
    message: string;
  }> {
    try {
      const result = await paymentIntegrationService.cancelPayment(paymentSessionId, sessionId, orderId);
      
      return {
        success: result.success,
        message: result.message
      };

    } catch (error) {
      console.error('Cancel payment error:', error);
      return {
        success: false,
        message: `결제 취소 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      };
    }
  }

  /**
   * Get payment status for order
   * Requirement 6.3: Add payment status updates to order tracking system
   */
  static async get_payment_status(orderId: string): Promise<{
    paymentStatus: string;
    canRetry: boolean;
    canCancel: boolean;
    message: string;
  } | null> {
    try {
      const result = await paymentIntegrationService.getPaymentStatus(orderId);
      
      if (!result) {
        return null;
      }

      return {
        paymentStatus: result.paymentStatus.current,
        canRetry: result.canRetry,
        canCancel: result.canCancel,
        message: this.getPaymentStatusMessage(result.paymentStatus.current)
      };

    } catch (error) {
      console.error('Get payment status error:', error);
      return null;
    }
  }

  /**
   * Generate payment receipt
   * Requirement 6.4: Create payment receipt generation for completed orders
   */
  static async generate_receipt(
    paymentSessionId: string,
    orderId: string
  ): Promise<{
    success: boolean;
    receiptId?: string;
    receiptUrl?: string;
    message: string;
  }> {
    try {
      const receipt = await paymentIntegrationService.generateReceipt(paymentSessionId, orderId);
      
      if (!receipt) {
        return {
          success: false,
          message: '영수증 생성에 실패했습니다.'
        };
      }

      return {
        success: true,
        receiptId: receipt.receiptId,
        receiptUrl: receipt.receiptUrl,
        message: '영수증이 생성되었습니다.'
      };

    } catch (error) {
      console.error('Generate receipt error:', error);
      return {
        success: false,
        message: `영수증 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      };
    }
  }

  /**
   * Validate customer information
   * Requirement 5.4: Customer information collection and validation
   */
  static async validate_customer_info(customerInfo: CustomerInfo): Promise<{
    isValid: boolean;
    errors: string[];
    suggestions?: Partial<CustomerInfo>;
  }> {
    const errors: string[] = [];

    // Validate name
    if (!customerInfo.name || customerInfo.name.trim().length < 2) {
      errors.push('이름은 2글자 이상이어야 합니다.');
    }

    // Validate phone number
    const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
    if (!customerInfo.phone || !phoneRegex.test(customerInfo.phone.replace(/\s/g, ''))) {
      errors.push('올바른 휴대폰 번호를 입력해주세요. (예: 010-1234-5678)');
    }

    // Validate email if provided
    if (customerInfo.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerInfo.email)) {
        errors.push('올바른 이메일 주소를 입력해주세요.');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      suggestions: errors.length > 0 ? {
        phone: customerInfo.phone ? this.formatPhoneNumber(customerInfo.phone) : undefined
      } : undefined
    };
  }

  // Private helper methods

  private static validateCustomerInfo(customerInfo: CustomerInfo): void {
    if (!customerInfo.name || customerInfo.name.trim().length < 2) {
      throw new Error('고객 이름은 2글자 이상이어야 합니다.');
    }

    const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
    if (!customerInfo.phone || !phoneRegex.test(customerInfo.phone.replace(/\s/g, ''))) {
      throw new Error('올바른 휴대폰 번호를 입력해주세요.');
    }
  }

  private static validateDeliveryAddress(address: DeliveryAddress): void {
    if (!address.street || address.street.trim().length < 5) {
      throw new Error('상세 주소를 입력해주세요.');
    }

    if (!address.city || address.city.trim().length < 2) {
      throw new Error('시/도를 입력해주세요.');
    }
  }

  private static calculateDistance(address: DeliveryAddress): number {
    // Mock distance calculation based on address
    // In a real system, this would use a geocoding service
    const baseDistance = 3; // Base distance in km
    
    // Simple heuristic based on city
    if (address.city.includes('서울')) {
      return baseDistance + Math.random() * 5;
    } else if (address.city.includes('경기')) {
      return baseDistance + Math.random() * 10;
    } else {
      return baseDistance + Math.random() * 15;
    }
  }

  private static calculateDistanceFromCoordinates(
    lat1: number, lng1: number, lat2: number, lng2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private static calculateOrderWeight(items: OrderItem[]): number {
    // Mock weight calculation
    // In a real system, products would have weight information
    return items.reduce((total, item) => total + (item.quantity * 0.5), 0); // Assume 0.5kg per item
  }

  private static calculatePickupTime(): Date {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15); // 15 minutes from now
    return now;
  }

  private static calculateEstimatedCompletion(order: Order): Date {
    const now = new Date();
    let estimatedMinutes = 0;

    switch (order.status.current) {
      case 'created':
      case 'confirmed':
        estimatedMinutes = order.orderType === 'pickup' ? 15 : 45;
        break;
      case 'preparing':
        estimatedMinutes = order.orderType === 'pickup' ? 10 : 35;
        break;
      case 'ready':
        estimatedMinutes = order.orderType === 'pickup' ? 0 : 25;
        break;
      case 'in_transit':
        estimatedMinutes = 15;
        break;
      default:
        estimatedMinutes = 0;
    }

    const estimated = new Date(now);
    estimated.setMinutes(estimated.getMinutes() + estimatedMinutes);
    return estimated;
  }

  private static validateStatusTransition(
    currentStatus: OrderStatus['current'],
    newStatus: OrderStatus['current']
  ): boolean {
    const validTransitions: Record<string, string[]> = {
      'created': ['confirmed', 'cancelled'],
      'confirmed': ['preparing', 'cancelled'],
      'preparing': ['ready', 'cancelled'],
      'ready': ['in_transit', 'completed', 'cancelled'],
      'in_transit': ['delivered', 'cancelled'],
      'delivered': ['completed'],
      'completed': [],
      'cancelled': []
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  private static getStatusUpdateMessage(status: OrderStatus['current']): string {
    const messages: Record<string, string> = {
      'created': '주문이 생성되었습니다.',
      'confirmed': '주문이 확인되었습니다.',
      'preparing': '주문을 준비 중입니다.',
      'ready': '주문이 준비되었습니다.',
      'in_transit': '배달이 시작되었습니다.',
      'delivered': '배달이 완료되었습니다.',
      'completed': '주문이 완료되었습니다.',
      'cancelled': '주문이 취소되었습니다.'
    };

    return messages[status] || '주문 상태가 업데이트되었습니다.';
  }

  private static shouldNotifyCustomer(status: OrderStatus['current']): boolean {
    return ['confirmed', 'ready', 'in_transit', 'delivered', 'completed', 'cancelled'].includes(status);
  }

  private static getStatusDescription(status: string): string {
    const descriptions: Record<string, string> = {
      'created': '주문 생성',
      'confirmed': '주문 확인',
      'preparing': '조리 중',
      'ready': '픽업/배달 준비 완료',
      'in_transit': '배달 중',
      'delivered': '배달 완료',
      'completed': '주문 완료',
      'cancelled': '주문 취소'
    };

    return descriptions[status] || status;
  }

  private static getNextStatusUpdate(currentStatus: OrderStatus['current']): string | undefined {
    const nextUpdates: Record<string, string> = {
      'created': '주문 확인 중',
      'confirmed': '조리 시작 예정',
      'preparing': '조리 완료 예정',
      'ready': '픽업/배달 시작 예정',
      'in_transit': '배달 완료 예정'
    };

    return nextUpdates[currentStatus];
  }

  private static isStoreCurrentlyOpen(operatingHours: any): boolean {
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentTime = now.getHours() * 100 + now.getMinutes();

    const todayHours = operatingHours[dayOfWeek];
    if (!todayHours || todayHours.isClosed) {
      return false;
    }

    const openTime = parseInt(todayHours.open.replace(':', ''));
    const closeTime = parseInt(todayHours.close.replace(':', ''));

    return currentTime >= openTime && currentTime <= closeTime;
  }

  private static isStoreOpenAtTime(operatingHours: any, time: Date): boolean {
    const dayOfWeek = time.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const timeValue = time.getHours() * 100 + time.getMinutes();

    const dayHours = operatingHours[dayOfWeek];
    if (!dayHours || dayHours.isClosed) {
      return false;
    }

    const openTime = parseInt(dayHours.open.replace(':', ''));
    const closeTime = parseInt(dayHours.close.replace(':', ''));

    return timeValue >= openTime && timeValue <= closeTime;
  }

  private static generatePickupConfirmationCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private static formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  }

  private static getPaymentStatusMessage(status: string): string {
    const messages: Record<string, string> = {
      'pending': '결제 대기 중',
      'processing': '결제 처리 중',
      'completed': '결제 완료',
      'failed': '결제 실패',
      'cancelled': '결제 취소됨'
    };

    return messages[status] || '알 수 없는 결제 상태';
  }
}

// Export function declarations for LLM integration
export const orderAgentFunctions = {
  create_order: {
    name: 'create_order',
    description: '장바구니에서 주문을 생성합니다.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '세션 ID'
        },
        orderDetails: {
          type: 'object',
          properties: {
            orderType: {
              type: 'string',
              enum: ['pickup', 'delivery'],
              description: '주문 유형 (픽업 또는 배달)'
            },
            customerInfo: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '고객 이름' },
                phone: { type: 'string', description: '휴대폰 번호' },
                email: { type: 'string', description: '이메일 (선택사항)' }
              },
              required: ['name', 'phone'],
              description: '고객 정보'
            },
            deliveryAddress: {
              type: 'object',
              properties: {
                street: { type: 'string', description: '상세 주소' },
                city: { type: 'string', description: '시/도' },
                postalCode: { type: 'string', description: '우편번호' },
                country: { type: 'string', description: '국가' },
                instructions: { type: 'string', description: '배달 요청사항' }
              },
              description: '배달 주소 (배달 주문시 필수)'
            },
            pickupLocation: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '픽업 장소 ID' }
              },
              description: '픽업 장소 (픽업 주문시 필수)'
            },
            specialInstructions: {
              type: 'string',
              description: '특별 요청사항'
            }
          },
          required: ['orderType', 'customerInfo']
        }
      },
      required: ['sessionId', 'orderDetails']
    }
  },

  quote_delivery_fee: {
    name: 'quote_delivery_fee',
    description: '배달 주소와 주문 내용을 기반으로 배달비를 계산합니다.',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            postalCode: { type: 'string' },
            country: { type: 'string' }
          },
          required: ['street', 'city'],
          description: '배달 주소'
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              quantity: { type: 'number' },
              unitPrice: { type: 'number' },
              totalPrice: { type: 'number' }
            }
          },
          description: '주문 상품 목록'
        }
      },
      required: ['address', 'items']
    }
  },

  set_order_status: {
    name: 'set_order_status',
    description: '주문 상태를 업데이트합니다.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: '주문 ID'
        },
        status: {
          type: 'string',
          enum: ['created', 'confirmed', 'preparing', 'ready', 'in_transit', 'delivered', 'completed', 'cancelled'],
          description: '새로운 주문 상태'
        },
        metadata: {
          type: 'object',
          description: '상태 변경과 관련된 추가 정보',
          additionalProperties: true
        }
      },
      required: ['orderId', 'status']
    }
  },

  get_pickup_locations: {
    name: 'get_pickup_locations',
    description: '픽업 가능한 매장 목록을 가져옵니다.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'object',
          properties: {
            lat: { type: 'number', description: '위도' },
            lng: { type: 'number', description: '경도' }
          },
          description: '현재 위치 (선택사항, 거리순 정렬용)'
        }
      }
    }
  },

  schedule_pickup: {
    name: 'schedule_pickup',
    description: '픽업 시간과 장소를 예약합니다.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: '주문 ID'
        },
        locationId: {
          type: 'string',
          description: '픽업 장소 ID'
        },
        preferredTime: {
          type: 'string',
          description: '희망 픽업 시간 (ISO 8601 형식)'
        }
      },
      required: ['orderId', 'locationId', 'preferredTime']
    }
  },

  get_order_status: {
    name: 'get_order_status',
    description: '주문 상태와 추적 정보를 조회합니다.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: '주문 ID'
        }
      },
      required: ['orderId']
    }
  },

  validate_customer_info: {
    name: 'validate_customer_info',
    description: '고객 정보의 유효성을 검증합니다.',
    parameters: {
      type: 'object',
      properties: {
        customerInfo: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '고객 이름' },
            phone: { type: 'string', description: '휴대폰 번호' },
            email: { type: 'string', description: '이메일' }
          },
          required: ['name', 'phone'],
          description: '검증할 고객 정보'
        }
      },
      required: ['customerInfo']
    }
  },

  create_payment_session: {
    name: 'create_payment_session',
    description: '주문에 대한 결제 세션을 생성합니다.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: '주문 ID'
        },
        sessionId: {
          type: 'string',
          description: '세션 ID'
        }
      },
      required: ['orderId', 'sessionId']
    }
  },

  process_payment: {
    name: 'process_payment',
    description: '결제를 처리합니다.',
    parameters: {
      type: 'object',
      properties: {
        paymentSessionId: {
          type: 'string',
          description: '결제 세션 ID'
        },
        sessionId: {
          type: 'string',
          description: '세션 ID'
        }
      },
      required: ['paymentSessionId', 'sessionId']
    }
  },

  retry_payment: {
    name: 'retry_payment',
    description: '실패한 결제를 재시도합니다.',
    parameters: {
      type: 'object',
      properties: {
        paymentSessionId: {
          type: 'string',
          description: '결제 세션 ID'
        },
        sessionId: {
          type: 'string',
          description: '세션 ID'
        }
      },
      required: ['paymentSessionId', 'sessionId']
    }
  },

  cancel_payment: {
    name: 'cancel_payment',
    description: '결제를 취소합니다.',
    parameters: {
      type: 'object',
      properties: {
        paymentSessionId: {
          type: 'string',
          description: '결제 세션 ID'
        },
        sessionId: {
          type: 'string',
          description: '세션 ID'
        },
        orderId: {
          type: 'string',
          description: '주문 ID'
        }
      },
      required: ['paymentSessionId', 'sessionId', 'orderId']
    }
  },

  get_payment_status: {
    name: 'get_payment_status',
    description: '주문의 결제 상태를 조회합니다.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: '주문 ID'
        }
      },
      required: ['orderId']
    }
  },

  generate_receipt: {
    name: 'generate_receipt',
    description: '결제 완료된 주문의 영수증을 생성합니다.',
    parameters: {
      type: 'object',
      properties: {
        paymentSessionId: {
          type: 'string',
          description: '결제 세션 ID'
        },
        orderId: {
          type: 'string',
          description: '주문 ID'
        }
      },
      required: ['paymentSessionId', 'orderId']
    }
  }
};