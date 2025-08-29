import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrderAgent } from '../order-agent';
import { 
  Order, 
  OrderCreationRequest, 
  DeliveryAddress, 
  PickupLocation, 
  CustomerInfo,
  OrderItem,
  Cart
} from '../../types';

// Mock database services
const mockOrderService = {
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  getOrderByPaymentSession: vi.fn(),
};

const mockSessionService = {
  getSession: vi.fn(),
  updateSession: vi.fn(),
};

const mockStoreLocationService = {
  getStoreLocation: vi.fn(),
  getNearbyStoreLocations: vi.fn(),
  getActiveStoreLocations: vi.fn(),
};

const mockOrderCalculationService = {
  calculateOrderTotals: vi.fn(),
};

const mockPaymentIntegrationService = {
  createPaymentSession: vi.fn(),
  processPayment: vi.fn(),
  retryPayment: vi.fn(),
  cancelPayment: vi.fn(),
  getPaymentStatus: vi.fn(),
  generateReceipt: vi.fn(),
};

vi.mock('../../database', () => ({
  OrderService: mockOrderService,
  SessionService: mockSessionService,
  StoreLocationService: mockStoreLocationService,
  OrderCalculationService: mockOrderCalculationService,
  PaymentService: {},
}));

vi.mock('../services/payment-integration', () => ({
  paymentIntegrationService: mockPaymentIntegrationService,
}));

describe('OrderAgent', () => {
  const sessionId = 'test-session-123';
  const orderId = 'order-123';
  
  const mockCustomerInfo: CustomerInfo = {
    name: '김철수',
    phone: '010-1234-5678',
    email: 'test@example.com',
  };

  const mockDeliveryAddress: DeliveryAddress = {
    street: '서울시 강남구 테헤란로 123',
    city: '서울',
    postalCode: '06142',
    country: '대한민국',
    instructions: '문 앞에 놓아주세요',
  };

  const mockPickupLocation: PickupLocation = {
    id: 'store-1',
    name: '강남점',
    address: '서울시 강남구 강남대로 456',
    phone: '02-1234-5678',
    coordinates: { lat: 37.5665, lng: 126.9780 },
    operatingHours: {
      monday: { open: '09:00', close: '22:00', isClosed: false },
      tuesday: { open: '09:00', close: '22:00', isClosed: false },
      wednesday: { open: '09:00', close: '22:00', isClosed: false },
      thursday: { open: '09:00', close: '22:00', isClosed: false },
      friday: { open: '09:00', close: '22:00', isClosed: false },
      saturday: { open: '10:00', close: '21:00', isClosed: false },
      sunday: { open: '10:00', close: '21:00', isClosed: false },
    },
    isCurrentlyOpen: true,
    estimatedPickupTime: new Date(Date.now() + 15 * 60 * 1000),
  };

  const mockCartItems: OrderItem[] = [
    {
      productId: 'product-1',
      quantity: 2,
      selectedOptions: { size: 'regular' },
      unitPrice: 4500,
      totalPrice: 9000,
    },
    {
      productId: 'product-2',
      quantity: 1,
      selectedOptions: {},
      unitPrice: 6000,
      totalPrice: 6000,
    },
  ];

  const mockCart: Cart = {
    sessionId,
    items: mockCartItems.map(item => ({
      ...item,
      addedAt: new Date(),
    })),
    subtotal: 15000,
    discounts: [],
    taxes: [],
    total: 15000,
    currency: 'KRW',
    updatedAt: new Date(),
  };

  const mockSession = {
    sessionId,
    userId: 'user-123',
    cart: mockCart,
    currentState: 'idle',
    conversationHistory: [],
    preferences: {},
    createdAt: new Date(),
    lastActivity: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
  };

  const mockOrder: Order = {
    id: orderId,
    sessionId,
    customerId: 'user-123',
    items: mockCartItems,
    orderType: 'pickup',
    status: {
      current: 'created',
      history: [{
        status: 'created',
        timestamp: new Date(),
        metadata: {},
      }],
    },
    paymentStatus: {
      current: 'pending',
      history: [],
    },
    customerInfo: mockCustomerInfo,
    pickupInfo: {
      locationId: 'store-1',
      locationName: '강남점',
      address: '서울시 강남구 강남대로 456',
      estimatedTime: new Date(Date.now() + 15 * 60 * 1000),
    },
    pricing: {
      subtotal: 15000,
      discounts: [],
      taxes: [{
        type: 'VAT',
        rate: 0.1,
        amount: 1500,
      }],
      total: 16500,
      currency: 'KRW',
    },
    timestamps: {
      created: new Date(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionService.getSession.mockResolvedValue(mockSession);
    mockOrderCalculationService.calculateOrderTotals.mockResolvedValue({
      subtotal: 15000,
      taxTotal: 1500,
      finalTotal: 16500,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create_order', () => {
    it('should create pickup order successfully', async () => {
      const orderDetails: OrderCreationRequest = {
        orderType: 'pickup',
        customerInfo: mockCustomerInfo,
        pickupLocation: { id: 'store-1' },
        specialInstructions: '빨리 준비해주세요',
      };

      mockStoreLocationService.getStoreLocation.mockResolvedValue({
        id: 'store-1',
        name: '강남점',
        address: '서울시 강남구 강남대로 456',
      });

      mockOrderService.createOrder.mockResolvedValue(mockOrder);

      const result = await OrderAgent.create_order(sessionId, orderDetails);

      expect(result.success).toBe(true);
      expect(result.order).toEqual(mockOrder);
      expect(result.message).toContain('주문이 성공적으로 생성되었습니다');

      expect(mockOrderService.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId,
          customerId: 'user-123',
          items: mockCartItems,
          orderType: 'pickup',
          customerInfo: mockCustomerInfo,
          pickupInfo: expect.objectContaining({
            locationId: 'store-1',
            locationName: '강남점',
          }),
          pricing: expect.objectContaining({
            total: 16500,
          }),
        })
      );

      // Should clear cart after order creation
      expect(mockSessionService.updateSession).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          cart: expect.objectContaining({
            items: [],
            total: 0,
          }),
          currentOrderId: orderId,
        })
      );
    });

    it('should create delivery order successfully', async () => {
      const orderDetails: OrderCreationRequest = {
        orderType: 'delivery',
        customerInfo: mockCustomerInfo,
        deliveryAddress: mockDeliveryAddress,
      };

      const deliveryOrder = {
        ...mockOrder,
        orderType: 'delivery' as const,
        deliveryInfo: {
          address: mockDeliveryAddress,
          fee: 3000,
          estimatedTime: 30,
          instructions: mockDeliveryAddress.instructions,
        },
        pricing: {
          ...mockOrder.pricing,
          deliveryFee: 3000,
          total: 19500, // 16500 + 3000 delivery fee
        },
      };

      mockOrderService.createOrder.mockResolvedValue(deliveryOrder);

      const result = await OrderAgent.create_order(sessionId, orderDetails);

      expect(result.success).toBe(true);
      expect(result.order.orderType).toBe('delivery');
      expect(result.order.deliveryInfo?.fee).toBe(3000);
      expect(result.order.pricing.total).toBe(19500);
    });

    it('should validate customer information', async () => {
      const orderDetails: OrderCreationRequest = {
        orderType: 'pickup',
        customerInfo: {
          name: 'A', // Too short
          phone: '123', // Invalid format
        },
        pickupLocation: { id: 'store-1' },
      };

      const result = await OrderAgent.create_order(sessionId, orderDetails);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('고객 이름은 2글자 이상이어야 합니다');
    });

    it('should validate delivery address for delivery orders', async () => {
      const orderDetails: OrderCreationRequest = {
        orderType: 'delivery',
        customerInfo: mockCustomerInfo,
        deliveryAddress: {
          street: 'A', // Too short
          city: '',
          postalCode: '',
          country: '',
        },
      };

      const result = await OrderAgent.create_order(sessionId, orderDetails);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('상세 주소를 입력해주세요');
    });

    it('should require delivery address for delivery orders', async () => {
      const orderDetails: OrderCreationRequest = {
        orderType: 'delivery',
        customerInfo: mockCustomerInfo,
        // Missing deliveryAddress
      };

      const result = await OrderAgent.create_order(sessionId, orderDetails);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('배달 주문에는 배달 주소가 필요합니다.');
    });

    it('should require pickup location for pickup orders', async () => {
      const orderDetails: OrderCreationRequest = {
        orderType: 'pickup',
        customerInfo: mockCustomerInfo,
        // Missing pickupLocation
      };

      const result = await OrderAgent.create_order(sessionId, orderDetails);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('픽업 주문에는 픽업 장소가 필요합니다.');
    });

    it('should handle empty cart', async () => {
      const emptyCartSession = {
        ...mockSession,
        cart: { ...mockCart, items: [] },
      };
      mockSessionService.getSession.mockResolvedValue(emptyCartSession);

      const orderDetails: OrderCreationRequest = {
        orderType: 'pickup',
        customerInfo: mockCustomerInfo,
        pickupLocation: { id: 'store-1' },
      };

      const result = await OrderAgent.create_order(sessionId, orderDetails);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('장바구니가 비어있습니다.');
    });

    it('should handle session not found', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      const orderDetails: OrderCreationRequest = {
        orderType: 'pickup',
        customerInfo: mockCustomerInfo,
        pickupLocation: { id: 'store-1' },
      };

      const result = await OrderAgent.create_order(sessionId, orderDetails);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('세션을 찾을 수 없습니다.');
    });
  });

  describe('quote_delivery_fee', () => {
    it('should calculate basic delivery fee', async () => {
      const result = await OrderAgent.quote_delivery_fee(mockDeliveryAddress, mockCartItems);

      expect(result.address).toEqual(mockDeliveryAddress);
      expect(result.fee).toBeGreaterThanOrEqual(3000); // Base fee
      expect(result.estimatedDeliveryTime).toBeGreaterThan(0);
      expect(result.breakdown).toBeDefined();
      expect(result.freeDeliveryThreshold).toBe(30000);
    });

    it('should apply free delivery for large orders', async () => {
      const largeOrderItems = [
        {
          ...mockCartItems[0],
          totalPrice: 35000, // Above free delivery threshold
        },
      ];

      const result = await OrderAgent.quote_delivery_fee(mockDeliveryAddress, largeOrderItems);

      expect(result.fee).toBeLessThan(3000); // Should have discount
      expect(result.message).toContain('무료 배송');
    });

    it('should add peak hour surcharge', async () => {
      // Mock current time to be during peak hours (12 PM)
      const originalDate = Date;
      const mockDate = new Date('2024-01-01T12:00:00Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = await OrderAgent.quote_delivery_fee(mockDeliveryAddress, mockCartItems);

      expect(result.breakdown.peakHourSurcharge).toBe(1000);
      expect(result.estimatedDeliveryTime).toBeGreaterThan(30); // Additional time

      vi.mocked(global.Date).mockRestore();
    });

    it('should calculate distance-based fee', async () => {
      // The mock implementation uses a simple distance calculation
      const result = await OrderAgent.quote_delivery_fee(mockDeliveryAddress, mockCartItems);

      expect(result.breakdown.baseFee).toBe(3000);
      expect(result.breakdown.distanceFee).toBeGreaterThanOrEqual(0);
    });
  });

  describe('set_order_status', () => {
    beforeEach(() => {
      mockOrderService.getOrder.mockResolvedValue(mockOrder);
      mockOrderService.updateOrderStatus.mockResolvedValue(undefined);
    });

    it('should update order status successfully', async () => {
      const updatedOrder = {
        ...mockOrder,
        status: {
          current: 'confirmed' as const,
          history: [
            ...mockOrder.status.history,
            {
              status: 'confirmed' as const,
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      };

      mockOrderService.getOrder
        .mockResolvedValueOnce(mockOrder) // First call for validation
        .mockResolvedValueOnce(updatedOrder); // Second call for updated order

      const result = await OrderAgent.set_order_status(orderId, 'confirmed');

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('created');
      expect(result.newStatus).toBe('confirmed');
      expect(result.message).toContain('주문이 확인되었습니다');
      expect(result.notificationRequired).toBe(true);

      expect(mockOrderService.updateOrderStatus).toHaveBeenCalledWith(
        orderId,
        'confirmed',
        {}
      );
    });

    it('should validate status transitions', async () => {
      const completedOrder = {
        ...mockOrder,
        status: { ...mockOrder.status, current: 'completed' as const },
      };
      mockOrderService.getOrder.mockResolvedValue(completedOrder);

      const result = await OrderAgent.set_order_status(orderId, 'preparing');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('상태 변경이 불가능합니다');
    });

    it('should handle order not found', async () => {
      mockOrderService.getOrder.mockResolvedValue(null);

      const result = await OrderAgent.set_order_status(orderId, 'confirmed');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('주문을 찾을 수 없습니다.');
    });

    it('should calculate estimated completion time', async () => {
      const updatedOrder = {
        ...mockOrder,
        status: { ...mockOrder.status, current: 'preparing' as const },
      };

      mockOrderService.getOrder
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce(updatedOrder);

      const result = await OrderAgent.set_order_status(orderId, 'preparing');

      expect(result.estimatedCompletion).toBeInstanceOf(Date);
      expect(result.estimatedCompletion!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('get_pickup_locations', () => {
    const mockStoreLocations = [
      {
        id: 'store-1',
        name: '강남점',
        address: '서울시 강남구 강남대로 456',
        phone: '02-1234-5678',
        coordinates: { lat: 37.5665, lng: 126.9780 },
        operatingHours: mockPickupLocation.operatingHours,
      },
      {
        id: 'store-2',
        name: '홍대점',
        address: '서울시 마포구 홍익로 123',
        phone: '02-2345-6789',
        coordinates: { lat: 37.5563, lng: 126.9236 },
        operatingHours: mockPickupLocation.operatingHours,
      },
    ];

    it('should get all active pickup locations', async () => {
      mockStoreLocationService.getActiveStoreLocations.mockResolvedValue(mockStoreLocations);

      const result = await OrderAgent.get_pickup_locations();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'store-1',
          name: '강남점',
          address: '서울시 강남구 강남대로 456',
          isCurrentlyOpen: expect.any(Boolean),
          estimatedPickupTime: expect.any(Date),
        })
      );

      expect(mockStoreLocationService.getActiveStoreLocations).toHaveBeenCalled();
    });

    it('should get nearby pickup locations with coordinates', async () => {
      const location = { lat: 37.5665, lng: 126.9780 };
      mockStoreLocationService.getNearbyStoreLocations.mockResolvedValue(mockStoreLocations);

      const result = await OrderAgent.get_pickup_locations(location);

      expect(result).toHaveLength(2);
      expect(result[0].distance).toBeDefined();
      expect(result[0].distance).toBeGreaterThanOrEqual(0);

      expect(mockStoreLocationService.getNearbyStoreLocations).toHaveBeenCalledWith(
        37.5665,
        126.9780,
        10
      );
    });

    it('should sort locations by distance when coordinates provided', async () => {
      const location = { lat: 37.5665, lng: 126.9780 };
      mockStoreLocationService.getNearbyStoreLocations.mockResolvedValue(mockStoreLocations);

      const result = await OrderAgent.get_pickup_locations(location);

      // Should be sorted by distance (closest first)
      if (result.length > 1) {
        expect(result[0].distance).toBeLessThanOrEqual(result[1].distance!);
      }
    });

    it('should sort locations by name when no coordinates', async () => {
      mockStoreLocationService.getActiveStoreLocations.mockResolvedValue(mockStoreLocations);

      const result = await OrderAgent.get_pickup_locations();

      // Should be sorted alphabetically
      expect(result[0].name.localeCompare(result[1].name)).toBeLessThanOrEqual(0);
    });
  });

  describe('schedule_pickup', () => {
    beforeEach(() => {
      mockOrderService.getOrder.mockResolvedValue(mockOrder);
      mockStoreLocationService.getStoreLocation.mockResolvedValue({
        id: 'store-1',
        name: '강남점',
        address: '서울시 강남구 강남대로 456',
        phone: '02-1234-5678',
        coordinates: { lat: 37.5665, lng: 126.9780 },
        operatingHours: mockPickupLocation.operatingHours,
      });
    });

    it('should schedule pickup successfully', async () => {
      const preferredTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours from now

      const result = await OrderAgent.schedule_pickup(orderId, 'store-1', preferredTime);

      expect(result.success).toBe(true);
      expect(result.pickupLocation.id).toBe('store-1');
      expect(result.scheduledTime).toBeInstanceOf(Date);
      expect(result.confirmationCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(result.message).toContain('픽업 예약이 완료되었습니다');
    });

    it('should handle order not found', async () => {
      mockOrderService.getOrder.mockResolvedValue(null);

      const preferredTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      const result = await OrderAgent.schedule_pickup(orderId, 'store-1', preferredTime);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('주문을 찾을 수 없습니다.');
    });

    it('should validate order type is pickup', async () => {
      const deliveryOrder = { ...mockOrder, orderType: 'delivery' as const };
      mockOrderService.getOrder.mockResolvedValue(deliveryOrder);

      const preferredTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      const result = await OrderAgent.schedule_pickup(orderId, 'store-1', preferredTime);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('픽업 주문이 아닙니다.');
    });

    it('should validate pickup time is in the future', async () => {
      const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

      const result = await OrderAgent.schedule_pickup(orderId, 'store-1', pastTime);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('픽업 시간은 현재 시간 이후여야 합니다.');
    });

    it('should validate store operating hours', async () => {
      // Mock a time when store is closed (3 AM)
      const closedTime = new Date();
      closedTime.setHours(3, 0, 0, 0);

      const result = await OrderAgent.schedule_pickup(orderId, 'store-1', closedTime.toISOString());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('해당 시간에는 매장이 운영하지 않습니다.');
    });

    it('should handle invalid time format', async () => {
      const result = await OrderAgent.schedule_pickup(orderId, 'store-1', 'invalid-time');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('올바른 시간 형식이 아닙니다.');
    });

    it('should handle store not found', async () => {
      mockStoreLocationService.getStoreLocation.mockResolvedValue(null);

      const preferredTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      const result = await OrderAgent.schedule_pickup(orderId, 'non-existent', preferredTime);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('픽업 장소를 찾을 수 없습니다.');
    });
  });

  describe('get_order_status', () => {
    it('should get order status and tracking info', async () => {
      const orderWithHistory = {
        ...mockOrder,
        status: {
          current: 'preparing' as const,
          history: [
            {
              status: 'created' as const,
              timestamp: new Date(Date.now() - 10 * 60 * 1000),
              metadata: {},
            },
            {
              status: 'confirmed' as const,
              timestamp: new Date(Date.now() - 5 * 60 * 1000),
              metadata: {},
            },
            {
              status: 'preparing' as const,
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      };

      mockOrderService.getOrder.mockResolvedValue(orderWithHistory);

      const result = await OrderAgent.get_order_status(orderId);

      expect(result.order).toEqual(orderWithHistory);
      expect(result.trackingInfo.currentStatus).toBe('preparing');
      expect(result.trackingInfo.statusHistory).toHaveLength(3);
      expect(result.trackingInfo.estimatedCompletion).toBeInstanceOf(Date);
      expect(result.trackingInfo.nextUpdate).toBe('조리 완료 예정');
    });

    it('should handle order not found', async () => {
      mockOrderService.getOrder.mockResolvedValue(null);

      await expect(OrderAgent.get_order_status(orderId))
        .rejects.toThrow('주문을 찾을 수 없습니다.');
    });
  });

  describe('payment integration', () => {
    describe('create_payment_session', () => {
      it('should create payment session successfully', async () => {
        mockPaymentIntegrationService.createPaymentSession.mockResolvedValue({
          success: true,
          paymentSession: {
            sessionId: 'pay-session-123',
            orderId,
            amount: 16500,
            currency: 'KRW',
            status: 'created',
          },
          message: '결제 세션이 생성되었습니다.',
        });

        const result = await OrderAgent.create_payment_session(orderId, sessionId);

        expect(result.success).toBe(true);
        expect(result.paymentSessionId).toBe('pay-session-123');
        expect(result.message).toBe('결제 세션이 생성되었습니다.');
      });

      it('should handle payment session creation failure', async () => {
        mockPaymentIntegrationService.createPaymentSession.mockResolvedValue({
          success: false,
          message: '주문을 찾을 수 없습니다.',
          errorCode: 'ORDER_NOT_FOUND',
        });

        const result = await OrderAgent.create_payment_session(orderId, sessionId);

        expect(result.success).toBe(false);
        expect(result.message).toBe('주문을 찾을 수 없습니다.');
        expect(result.errorCode).toBe('ORDER_NOT_FOUND');
      });
    });

    describe('process_payment', () => {
      it('should process payment successfully', async () => {
        mockPaymentIntegrationService.processPayment.mockResolvedValue({
          success: true,
          paymentSession: {
            sessionId: 'pay-session-123',
            status: 'pending',
          },
          message: '결제 처리가 시작되었습니다.',
        });

        const result = await OrderAgent.process_payment('pay-session-123', sessionId);

        expect(result.success).toBe(true);
        expect(result.status).toBe('pending');
        expect(result.message).toBe('결제 처리가 시작되었습니다.');
      });
    });

    describe('retry_payment', () => {
      it('should retry payment successfully', async () => {
        mockPaymentIntegrationService.retryPayment.mockResolvedValue({
          success: true,
          paymentSession: {
            sessionId: 'pay-session-retry-123',
          },
          message: '결제 재시도가 준비되었습니다.',
        });

        const result = await OrderAgent.retry_payment('pay-session-123', sessionId);

        expect(result.success).toBe(true);
        expect(result.newPaymentSessionId).toBe('pay-session-retry-123');
        expect(result.message).toBe('결제 재시도가 준비되었습니다.');
      });
    });

    describe('cancel_payment', () => {
      it('should cancel payment successfully', async () => {
        mockPaymentIntegrationService.cancelPayment.mockResolvedValue({
          success: true,
          message: '결제가 취소되었습니다.',
        });

        const result = await OrderAgent.cancel_payment('pay-session-123', sessionId, orderId);

        expect(result.success).toBe(true);
        expect(result.message).toBe('결제가 취소되었습니다.');
      });
    });

    describe('get_payment_status', () => {
      it('should get payment status successfully', async () => {
        mockPaymentIntegrationService.getPaymentStatus.mockResolvedValue({
          paymentStatus: { current: 'completed' },
          canRetry: false,
          canCancel: false,
        });

        const result = await OrderAgent.get_payment_status(orderId);

        expect(result).toEqual({
          paymentStatus: 'completed',
          canRetry: false,
          canCancel: false,
          message: '결제 완료',
        });
      });

      it('should return null when payment status not found', async () => {
        mockPaymentIntegrationService.getPaymentStatus.mockResolvedValue(null);

        const result = await OrderAgent.get_payment_status(orderId);

        expect(result).toBeNull();
      });
    });

    describe('generate_receipt', () => {
      it('should generate receipt successfully', async () => {
        mockPaymentIntegrationService.generateReceipt.mockResolvedValue({
          receiptId: 'receipt-123',
          receiptUrl: 'https://example.com/receipt/123',
        });

        const result = await OrderAgent.generate_receipt('pay-session-123', orderId);

        expect(result.success).toBe(true);
        expect(result.receiptId).toBe('receipt-123');
        expect(result.receiptUrl).toBe('https://example.com/receipt/123');
        expect(result.message).toBe('영수증이 생성되었습니다.');
      });

      it('should handle receipt generation failure', async () => {
        mockPaymentIntegrationService.generateReceipt.mockResolvedValue(null);

        const result = await OrderAgent.generate_receipt('pay-session-123', orderId);

        expect(result.success).toBe(false);
        expect(result.message).toBe('영수증 생성에 실패했습니다.');
      });
    });
  });

  describe('validate_customer_info', () => {
    it('should validate correct customer info', async () => {
      const result = await OrderAgent.validate_customer_info(mockCustomerInfo);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate name length', async () => {
      const invalidCustomerInfo = {
        ...mockCustomerInfo,
        name: 'A', // Too short
      };

      const result = await OrderAgent.validate_customer_info(invalidCustomerInfo);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('이름은 2글자 이상이어야 합니다.');
    });

    it('should validate phone number format', async () => {
      const invalidCustomerInfo = {
        ...mockCustomerInfo,
        phone: '123-456', // Invalid format
      };

      const result = await OrderAgent.validate_customer_info(invalidCustomerInfo);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('올바른 휴대폰 번호를 입력해주세요. (예: 010-1234-5678)');
    });

    it('should validate email format when provided', async () => {
      const invalidCustomerInfo = {
        ...mockCustomerInfo,
        email: 'invalid-email', // Invalid format
      };

      const result = await OrderAgent.validate_customer_info(invalidCustomerInfo);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('올바른 이메일 주소를 입력해주세요.');
    });

    it('should provide phone number formatting suggestions', async () => {
      const invalidCustomerInfo = {
        ...mockCustomerInfo,
        phone: '01012345678', // Missing dashes
      };

      const result = await OrderAgent.validate_customer_info(invalidCustomerInfo);

      expect(result.isValid).toBe(false);
      expect(result.suggestions?.phone).toBe('010-1234-5678');
    });
  });
});