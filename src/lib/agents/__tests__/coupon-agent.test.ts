import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CouponAgent } from '../coupon-agent';
import { Coupon, Cart, CartItem, CouponValidation, CouponRestriction } from '../../types';

// Mock database services
const mockCouponService = {
  validateCoupon: vi.fn(),
  getCoupon: vi.fn(),
  getActiveCoupons: vi.fn(),
  incrementCouponUsage: vi.fn(),
};

const mockSessionService = {
  getSession: vi.fn(),
  updateSession: vi.fn(),
};

const mockProductService = {
  getProduct: vi.fn(),
};

vi.mock('../../database', () => ({
  CouponService: mockCouponService,
  SessionService: mockSessionService,
  ProductService: mockProductService,
}));

describe('CouponAgent', () => {
  const sessionId = 'test-session-123';
  
  const mockCoupon: Coupon = {
    id: 'coupon-1',
    code: 'SAVE10',
    name: '10% 할인 쿠폰',
    description: '전 상품 10% 할인',
    discountType: 'percentage',
    discountValue: 10,
    minimumOrderAmount: 10000,
    maximumDiscountAmount: 5000,
    validFrom: new Date('2024-01-01'),
    validUntil: new Date('2024-12-31'),
    usageLimit: 1000,
    usageCount: 50,
    restrictions: [],
    isActive: true,
  };

  const mockCartItems: CartItem[] = [
    {
      productId: 'product-1',
      quantity: 2,
      selectedOptions: {},
      unitPrice: 4500,
      totalPrice: 9000,
      addedAt: new Date(),
    },
    {
      productId: 'product-2',
      quantity: 1,
      selectedOptions: {},
      unitPrice: 6000,
      totalPrice: 6000,
      addedAt: new Date(),
    },
  ];

  const mockCart: Cart = {
    sessionId,
    items: mockCartItems,
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validate_coupon', () => {
    it('should validate coupon successfully', async () => {
      const mockValidation: CouponValidation = {
        isValid: true,
        couponId: 'coupon-1',
        discountAmount: 1500,
      };

      mockCouponService.validateCoupon.mockResolvedValue(mockValidation);
      mockCouponService.getCoupon.mockResolvedValue(mockCoupon);

      const result = await CouponAgent.validate_coupon(
        'SAVE10',
        15000,
        mockCartItems,
        'user-123'
      );

      expect(result.isValid).toBe(true);
      expect(result.couponId).toBe('coupon-1');
      expect(result.couponCode).toBe('SAVE10');
      expect(result.discountType).toBe('percentage');
      expect(result.discountValue).toBe(10);
      expect(result.discountAmount).toBe(1500);

      expect(mockCouponService.validateCoupon).toHaveBeenCalledWith(
        'SAVE10',
        15000,
        mockCartItems
      );
    });

    it('should handle invalid coupon', async () => {
      const mockValidation: CouponValidation = {
        isValid: false,
        errorMessage: '쿠폰이 만료되었습니다.',
      };

      mockCouponService.validateCoupon.mockResolvedValue(mockValidation);

      const result = await CouponAgent.validate_coupon(
        'EXPIRED',
        15000,
        mockCartItems
      );

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('쿠폰이 만료되었습니다.');
      expect(result.errorCode).toBe('INVALID_COUPON');
    });

    it('should normalize coupon code', async () => {
      const mockValidation: CouponValidation = {
        isValid: true,
        couponId: 'coupon-1',
      };

      mockCouponService.validateCoupon.mockResolvedValue(mockValidation);
      mockCouponService.getCoupon.mockResolvedValue(mockCoupon);

      await CouponAgent.validate_coupon('  save10  ', 15000, mockCartItems);

      expect(mockCouponService.validateCoupon).toHaveBeenCalledWith(
        'SAVE10',
        15000,
        mockCartItems
      );
    });

    it('should handle coupon not found after validation', async () => {
      const mockValidation: CouponValidation = {
        isValid: true,
        couponId: 'coupon-1',
      };

      mockCouponService.validateCoupon.mockResolvedValue(mockValidation);
      mockCouponService.getCoupon.mockResolvedValue(null);

      const result = await CouponAgent.validate_coupon('SAVE10', 15000, mockCartItems);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('쿠폰 정보를 찾을 수 없습니다.');
      expect(result.errorCode).toBe('COUPON_NOT_FOUND');
    });

    it('should check coupon restrictions', async () => {
      const restrictedCoupon: Coupon = {
        ...mockCoupon,
        restrictions: [
          {
            type: 'category',
            operator: 'equals',
            value: 'coffee',
          },
        ],
      };

      const mockValidation: CouponValidation = {
        isValid: true,
        couponId: 'coupon-1',
      };

      mockCouponService.validateCoupon.mockResolvedValue(mockValidation);
      mockCouponService.getCoupon.mockResolvedValue(restrictedCoupon);
      mockProductService.getProduct
        .mockResolvedValueOnce({ category: 'tea' })
        .mockResolvedValueOnce({ category: 'dessert' });

      const result = await CouponAgent.validate_coupon('SAVE10', 15000, mockCartItems);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('coffee 카테고리 상품에만 적용 가능');
      expect(result.errorCode).toBe('RESTRICTION_FAILED');
    });

    it('should handle validation errors', async () => {
      mockCouponService.validateCoupon.mockRejectedValue(new Error('Database error'));

      const result = await CouponAgent.validate_coupon('SAVE10', 15000, mockCartItems);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('쿠폰 검증 중 오류가 발생했습니다');
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });
  });

  describe('apply_coupon', () => {
    beforeEach(() => {
      mockSessionService.getSession.mockResolvedValue(mockSession);
      mockCouponService.validateCoupon.mockResolvedValue({
        isValid: true,
        couponId: 'coupon-1',
        discountAmount: 1500,
      });
      mockCouponService.getCoupon.mockResolvedValue(mockCoupon);
    });

    it('should apply coupon successfully', async () => {
      const result = await CouponAgent.apply_coupon(sessionId, 'SAVE10');

      expect(result.success).toBe(true);
      expect(result.appliedDiscount).toEqual({
        couponId: 'coupon-1',
        couponCode: 'SAVE10',
        discountType: 'percentage',
        discountValue: 10,
        appliedAmount: 1500,
      });
      expect(result.newCartTotal).toBe(13500); // 15000 - 1500
      expect(result.savedAmount).toBe(1500);

      expect(mockSessionService.updateSession).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          cart: expect.objectContaining({
            discounts: expect.arrayContaining([
              expect.objectContaining({
                couponCode: 'SAVE10',
                appliedAmount: 1500,
              }),
            ]),
            total: 13500,
          }),
        })
      );

      expect(mockCouponService.incrementCouponUsage).toHaveBeenCalledWith('coupon-1');
    });

    it('should handle empty cart', async () => {
      const emptyCartSession = {
        ...mockSession,
        cart: { ...mockCart, items: [] },
      };
      mockSessionService.getSession.mockResolvedValue(emptyCartSession);

      const result = await CouponAgent.apply_coupon(sessionId, 'SAVE10');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('장바구니가 비어있습니다.');
      expect(result.errorCode).toBe('EMPTY_CART');
    });

    it('should handle invalid coupon', async () => {
      mockCouponService.validateCoupon.mockResolvedValue({
        isValid: false,
        errorMessage: '최소 주문 금액을 만족하지 않습니다.',
        errorCode: 'MINIMUM_ORDER_NOT_MET',
      });

      const result = await CouponAgent.apply_coupon(sessionId, 'SAVE10');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('최소 주문 금액을 만족하지 않습니다.');
      expect(result.errorCode).toBe('MINIMUM_ORDER_NOT_MET');
    });

    it('should prevent duplicate coupon application', async () => {
      const cartWithDiscount = {
        ...mockCart,
        discounts: [{
          couponId: 'coupon-1',
          couponCode: 'SAVE10',
          discountType: 'percentage' as const,
          discountValue: 10,
          appliedAmount: 1500,
        }],
      };

      mockSessionService.getSession.mockResolvedValue({
        ...mockSession,
        cart: cartWithDiscount,
      });

      const result = await CouponAgent.apply_coupon(sessionId, 'SAVE10');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('이미 적용된 쿠폰입니다.');
      expect(result.errorCode).toBe('ALREADY_APPLIED');
    });

    it('should check coupon stacking rules', async () => {
      const cartWithPercentageDiscount = {
        ...mockCart,
        discounts: [{
          couponId: 'other-coupon',
          couponCode: 'OTHER10',
          discountType: 'percentage' as const,
          discountValue: 15,
          appliedAmount: 2000,
        }],
      };

      mockSessionService.getSession.mockResolvedValue({
        ...mockSession,
        cart: cartWithPercentageDiscount,
      });

      const result = await CouponAgent.apply_coupon(sessionId, 'SAVE10');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('퍼센트 할인 쿠폰은 중복 사용할 수 없습니다.');
      expect(result.errorCode).toBe('STACKING_NOT_ALLOWED');
    });

    it('should handle session not found', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      const result = await CouponAgent.apply_coupon(sessionId, 'SAVE10');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('세션을 찾을 수 없습니다.');
    });
  });

  describe('remove_coupon', () => {
    const cartWithDiscount = {
      ...mockCart,
      discounts: [{
        couponId: 'coupon-1',
        couponCode: 'SAVE10',
        discountType: 'percentage' as const,
        discountValue: 10,
        appliedAmount: 1500,
      }],
      total: 13500,
    };

    beforeEach(() => {
      mockSessionService.getSession.mockResolvedValue({
        ...mockSession,
        cart: cartWithDiscount,
      });
    });

    it('should remove coupon successfully', async () => {
      const result = await CouponAgent.remove_coupon(sessionId, 'SAVE10');

      expect(result.success).toBe(true);
      expect(result.removedDiscount).toEqual({
        couponId: 'coupon-1',
        couponCode: 'SAVE10',
        discountType: 'percentage',
        discountValue: 10,
        appliedAmount: 1500,
      });
      expect(result.newCartTotal).toBe(15000); // Back to original total

      expect(mockSessionService.updateSession).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          cart: expect.objectContaining({
            discounts: [],
            total: 15000,
          }),
        })
      );
    });

    it('should handle coupon not applied', async () => {
      const result = await CouponAgent.remove_coupon(sessionId, 'NOTAPPLIED');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('적용된 쿠폰을 찾을 수 없습니다.');
      expect(result.errorCode).toBe('COUPON_NOT_APPLIED');
    });

    it('should handle session not found', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      const result = await CouponAgent.remove_coupon(sessionId, 'SAVE10');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('세션을 찾을 수 없습니다.');
    });
  });

  describe('list_available_coupons', () => {
    const mockCoupons = [
      mockCoupon,
      {
        ...mockCoupon,
        id: 'coupon-2',
        code: 'FIXED5000',
        name: '5000원 할인',
        discountType: 'fixed_amount' as const,
        discountValue: 5000,
        minimumOrderAmount: 20000,
      },
      {
        ...mockCoupon,
        id: 'coupon-3',
        code: 'FREESHIP',
        name: '무료배송',
        discountType: 'free_shipping' as const,
        discountValue: 0,
        minimumOrderAmount: 15000,
      },
    ];

    beforeEach(() => {
      mockCouponService.getActiveCoupons.mockResolvedValue(mockCoupons);
    });

    it('should list available coupons without cart context', async () => {
      const result = await CouponAgent.list_available_coupons('user-123');

      expect(result).toHaveLength(3);
      expect(result[0].coupon).toEqual(mockCoupons[0]);
      expect(result[0].isApplicable).toBe(true);
      expect(result[0].potentialDiscount).toBe(0); // No cart context
    });

    it('should list available coupons with cart context', async () => {
      const cartContext = {
        items: mockCartItems,
        subtotal: 15000,
        appliedCoupons: [],
      };

      const result = await CouponAgent.list_available_coupons('user-123', cartContext);

      expect(result).toHaveLength(3);
      
      // First coupon should be applicable (meets minimum order)
      expect(result.find(c => c.coupon.code === 'SAVE10')?.isApplicable).toBe(true);
      expect(result.find(c => c.coupon.code === 'SAVE10')?.potentialDiscount).toBe(1500);
      
      // Second coupon should not be applicable (doesn't meet minimum order)
      expect(result.find(c => c.coupon.code === 'FIXED5000')?.isApplicable).toBe(false);
      expect(result.find(c => c.coupon.code === 'FIXED5000')?.applicabilityReason)
        .toContain('최소 주문 금액');
      
      // Third coupon should be applicable
      expect(result.find(c => c.coupon.code === 'FREESHIP')?.isApplicable).toBe(true);
    });

    it('should sort coupons by priority', async () => {
      const cartContext = {
        items: mockCartItems,
        subtotal: 25000, // High enough for all coupons
        appliedCoupons: [],
      };

      const result = await CouponAgent.list_available_coupons('user-123', cartContext);

      // Should be sorted by priority (highest first)
      expect(result[0].priority).toBeGreaterThanOrEqual(result[1].priority);
      expect(result[1].priority).toBeGreaterThanOrEqual(result[2].priority);
    });

    it('should handle restrictions in availability check', async () => {
      const restrictedCoupon = {
        ...mockCoupon,
        restrictions: [{
          type: 'category' as const,
          operator: 'equals' as const,
          value: 'coffee',
        }],
      };

      mockCouponService.getActiveCoupons.mockResolvedValue([restrictedCoupon]);
      mockProductService.getProduct
        .mockResolvedValueOnce({ category: 'tea' })
        .mockResolvedValueOnce({ category: 'dessert' });

      const cartContext = {
        items: mockCartItems,
        subtotal: 15000,
        appliedCoupons: [],
      };

      const result = await CouponAgent.list_available_coupons('user-123', cartContext);

      expect(result[0].isApplicable).toBe(false);
      expect(result[0].applicabilityReason).toContain('coffee 카테고리 상품에만 적용 가능');
    });
  });

  describe('compute_discount', () => {
    it('should compute percentage discount', async () => {
      mockCouponService.getCoupon.mockResolvedValue(mockCoupon);

      const result = await CouponAgent.compute_discount('coupon-1', mockCart);

      expect(result.discountType).toBe('percentage');
      expect(result.baseDiscountAmount).toBe(1500); // 15000 * 0.1
      expect(result.finalDiscountAmount).toBe(1500);
      expect(result.applicableAmount).toBe(15000);
      expect(result.savings).toBe(1500);
    });

    it('should apply maximum discount limit for percentage', async () => {
      const highValueCart = {
        ...mockCart,
        items: [{ ...mockCartItems[0], totalPrice: 60000 }],
        subtotal: 60000,
        total: 60000,
      };

      mockCouponService.getCoupon.mockResolvedValue(mockCoupon);

      const result = await CouponAgent.compute_discount('coupon-1', highValueCart);

      expect(result.baseDiscountAmount).toBe(6000); // 60000 * 0.1
      expect(result.finalDiscountAmount).toBe(5000); // Capped at maximum
    });

    it('should compute fixed amount discount', async () => {
      const fixedCoupon = {
        ...mockCoupon,
        discountType: 'fixed_amount' as const,
        discountValue: 3000,
      };

      mockCouponService.getCoupon.mockResolvedValue(fixedCoupon);

      const result = await CouponAgent.compute_discount('coupon-1', mockCart);

      expect(result.discountType).toBe('fixed_amount');
      expect(result.baseDiscountAmount).toBe(3000);
      expect(result.finalDiscountAmount).toBe(3000);
    });

    it('should not exceed cart total for fixed amount', async () => {
      const highFixedCoupon = {
        ...mockCoupon,
        discountType: 'fixed_amount' as const,
        discountValue: 20000, // More than cart total
      };

      mockCouponService.getCoupon.mockResolvedValue(highFixedCoupon);

      const result = await CouponAgent.compute_discount('coupon-1', mockCart);

      expect(result.finalDiscountAmount).toBe(15000); // Capped at cart total
    });

    it('should handle free shipping discount', async () => {
      const freeShippingCoupon = {
        ...mockCoupon,
        discountType: 'free_shipping' as const,
        discountValue: 0,
      };

      mockCouponService.getCoupon.mockResolvedValue(freeShippingCoupon);

      const result = await CouponAgent.compute_discount('coupon-1', mockCart);

      expect(result.discountType).toBe('free_shipping');
      expect(result.finalDiscountAmount).toBe(0);
    });

    it('should handle coupon not found', async () => {
      mockCouponService.getCoupon.mockResolvedValue(null);

      await expect(CouponAgent.compute_discount('non-existent', mockCart))
        .rejects.toThrow('쿠폰을 찾을 수 없습니다.');
    });

    it('should handle unsupported discount type', async () => {
      const unsupportedCoupon = {
        ...mockCoupon,
        discountType: 'unsupported' as any,
      };

      mockCouponService.getCoupon.mockResolvedValue(unsupportedCoupon);

      await expect(CouponAgent.compute_discount('coupon-1', mockCart))
        .rejects.toThrow('지원하지 않는 할인 유형입니다.');
    });
  });

  describe('get_coupon_recommendations', () => {
    beforeEach(() => {
      mockSessionService.getSession.mockResolvedValue(mockSession);
      mockCouponService.getActiveCoupons.mockResolvedValue([
        mockCoupon,
        {
          ...mockCoupon,
          id: 'coupon-2',
          code: 'SAVE20',
          discountValue: 20,
        },
      ]);
    });

    it('should get coupon recommendations for session', async () => {
      const result = await CouponAgent.get_coupon_recommendations(sessionId, 2);

      expect(result).toHaveLength(2);
      expect(result.every(r => r.isApplicable && r.potentialDiscount > 0)).toBe(true);
    });

    it('should filter out already applied coupons', async () => {
      const cartWithDiscount = {
        ...mockCart,
        discounts: [{
          couponId: 'coupon-1',
          couponCode: 'SAVE10',
          discountType: 'percentage' as const,
          discountValue: 10,
          appliedAmount: 1500,
        }],
      };

      mockSessionService.getSession.mockResolvedValue({
        ...mockSession,
        cart: cartWithDiscount,
      });

      const result = await CouponAgent.get_coupon_recommendations(sessionId);

      expect(result.every(r => r.coupon.code !== 'SAVE10')).toBe(true);
    });

    it('should return empty array for empty cart', async () => {
      const emptyCartSession = {
        ...mockSession,
        cart: { ...mockCart, items: [] },
      };
      mockSessionService.getSession.mockResolvedValue(emptyCartSession);

      const result = await CouponAgent.get_coupon_recommendations(sessionId);

      expect(result).toHaveLength(0);
    });

    it('should handle session not found', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      await expect(CouponAgent.get_coupon_recommendations(sessionId))
        .rejects.toThrow('세션을 찾을 수 없습니다.');
    });
  });

  describe('restriction checking', () => {
    it('should check category restriction with equals operator', async () => {
      const restriction: CouponRestriction = {
        type: 'category',
        operator: 'equals',
        value: 'coffee',
      };

      mockProductService.getProduct
        .mockResolvedValueOnce({ category: 'coffee' })
        .mockResolvedValueOnce({ category: 'coffee' });

      // Use private method through validation
      const restrictedCoupon = {
        ...mockCoupon,
        restrictions: [restriction],
      };

      const mockValidation: CouponValidation = {
        isValid: true,
        couponId: 'coupon-1',
      };

      mockCouponService.validateCoupon.mockResolvedValue(mockValidation);
      mockCouponService.getCoupon.mockResolvedValue(restrictedCoupon);

      const result = await CouponAgent.validate_coupon('SAVE10', 15000, mockCartItems);

      expect(result.isValid).toBe(true);
    });

    it('should check product restriction with in operator', async () => {
      const restriction: CouponRestriction = {
        type: 'product',
        operator: 'in',
        value: 'product-1,product-3',
      };

      const restrictedCoupon = {
        ...mockCoupon,
        restrictions: [restriction],
      };

      const mockValidation: CouponValidation = {
        isValid: true,
        couponId: 'coupon-1',
      };

      mockCouponService.validateCoupon.mockResolvedValue(mockValidation);
      mockCouponService.getCoupon.mockResolvedValue(restrictedCoupon);

      const result = await CouponAgent.validate_coupon('SAVE10', 15000, mockCartItems);

      expect(result.isValid).toBe(true); // product-1 is in the cart
    });

    it('should check user restriction', async () => {
      const restriction: CouponRestriction = {
        type: 'user',
        operator: 'equals',
        value: 'user-123',
      };

      const restrictedCoupon = {
        ...mockCoupon,
        restrictions: [restriction],
      };

      const mockValidation: CouponValidation = {
        isValid: true,
        couponId: 'coupon-1',
      };

      mockCouponService.validateCoupon.mockResolvedValue(mockValidation);
      mockCouponService.getCoupon.mockResolvedValue(restrictedCoupon);

      const result = await CouponAgent.validate_coupon(
        'SAVE10',
        15000,
        mockCartItems,
        'user-123'
      );

      expect(result.isValid).toBe(true);
    });

    it('should check time restriction', async () => {
      const restriction: CouponRestriction = {
        type: 'time',
        operator: 'equals',
        value: '9-17', // 9 AM to 5 PM
      };

      const restrictedCoupon = {
        ...mockCoupon,
        restrictions: [restriction],
      };

      const mockValidation: CouponValidation = {
        isValid: true,
        couponId: 'coupon-1',
      };

      mockCouponService.validateCoupon.mockResolvedValue(mockValidation);
      mockCouponService.getCoupon.mockResolvedValue(restrictedCoupon);

      // Mock current time to be within business hours
      const originalDate = Date;
      const mockDate = new Date('2024-01-01T12:00:00Z'); // 12 PM
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = await CouponAgent.validate_coupon('SAVE10', 15000, mockCartItems);

      expect(result.isValid).toBe(true);

      vi.mocked(global.Date).mockRestore();
    });
  });
});