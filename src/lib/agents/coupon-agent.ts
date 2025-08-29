import { 
  Coupon, 
  Cart, 
  CartItem, 
  CouponValidation, 
  DiscountApplication, 
  AvailableCoupon, 
  DiscountCalculation,
  CartContext,
  CouponRestriction,
  AppliedDiscount
} from '../types';
import { 
  CouponService, 
  SessionService, 
  ProductService 
} from '../database';

/**
 * Coupon Agent - Handles coupon validation, discount calculation,
 * stacking rules, and coupon recommendations for the voice ordering system.
 * 
 * Requirements covered: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
export class CouponAgent {

  /**
   * Validate coupon code and check eligibility
   * Requirement 4.1: Coupon validation and authenticity
   */
  static async validate_coupon(
    code: string,
    cartTotal: number,
    items: CartItem[],
    userId?: string
  ): Promise<CouponValidation> {
    try {
      // Clean and normalize coupon code
      const normalizedCode = code.trim().toUpperCase();

      // Use database service for basic validation
      const validation = await CouponService.validateCoupon(
        normalizedCode,
        cartTotal,
        items
      );

      if (!validation.isValid) {
        return {
          isValid: false,
          errorMessage: validation.errorMessage || '쿠폰이 유효하지 않습니다.',
          errorCode: 'INVALID_COUPON'
        };
      }

      // Get full coupon details for additional validation
      const coupon = await CouponService.getCoupon(validation.couponId!);
      if (!coupon) {
        return {
          isValid: false,
          errorMessage: '쿠폰 정보를 찾을 수 없습니다.',
          errorCode: 'COUPON_NOT_FOUND'
        };
      }

      // Additional restriction checks
      const restrictionCheck = await this.checkCouponRestrictions(coupon, items, userId);
      if (!restrictionCheck.isValid) {
        return {
          isValid: false,
          errorMessage: restrictionCheck.errorMessage,
          errorCode: 'RESTRICTION_FAILED'
        };
      }

      return {
        isValid: true,
        couponId: coupon.id,
        couponCode: coupon.code,
        couponName: coupon.name,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: validation.discountAmount || 0,
        minimumOrderAmount: coupon.minimumOrderAmount,
        maximumDiscountAmount: coupon.maximumDiscountAmount,
        description: coupon.description,
        validUntil: coupon.validUntil
      };

    } catch (error) {
      console.error('Coupon validation error:', error);
      return {
        isValid: false,
        errorMessage: `쿠폰 검증 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'VALIDATION_ERROR'
      };
    }
  }

  /**
   * Apply coupon to session cart
   * Requirement 4.2: Discount calculation with various coupon types
   */
  static async apply_coupon(
    sessionId: string,
    couponCode: string
  ): Promise<DiscountApplication> {
    try {
      const session = await SessionService.getSession(sessionId);
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      const cart = session.cart;
      if (cart.items.length === 0) {
        return {
          success: false,
          errorMessage: '장바구니가 비어있습니다.',
          errorCode: 'EMPTY_CART'
        };
      }

      // Calculate current cart subtotal
      const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

      // Validate coupon
      const validation = await this.validate_coupon(
        couponCode,
        subtotal,
        cart.items,
        session.userId
      );

      if (!validation.isValid) {
        return {
          success: false,
          errorMessage: validation.errorMessage,
          errorCode: validation.errorCode
        };
      }

      // Check if coupon is already applied
      const existingDiscount = cart.discounts.find(d => d.couponCode === validation.couponCode);
      if (existingDiscount) {
        return {
          success: false,
          errorMessage: '이미 적용된 쿠폰입니다.',
          errorCode: 'ALREADY_APPLIED'
        };
      }

      // Get full coupon details
      const coupon = await CouponService.getCoupon(validation.couponId!);
      if (!coupon) {
        throw new Error('쿠폰 정보를 찾을 수 없습니다.');
      }

      // Check stacking rules
      const stackingCheck = await this.checkCouponStacking(cart.discounts, coupon);
      if (!stackingCheck.canStack) {
        return {
          success: false,
          errorMessage: stackingCheck.errorMessage,
          errorCode: 'STACKING_NOT_ALLOWED'
        };
      }

      // Calculate discount amount
      const discountCalculation = await this.compute_discount(validation.couponId!, cart);

      // Create applied discount
      const appliedDiscount: AppliedDiscount = {
        couponId: coupon.id,
        couponCode: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        appliedAmount: discountCalculation.finalDiscountAmount
      };

      // Add discount to cart
      cart.discounts.push(appliedDiscount);

      // Recalculate cart totals
      const newSubtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
      const totalDiscounts = cart.discounts.reduce((sum, discount) => sum + discount.appliedAmount, 0);
      cart.subtotal = newSubtotal;
      cart.total = Math.max(0, newSubtotal - totalDiscounts); // Ensure total doesn't go negative
      cart.updatedAt = new Date();

      // Update session
      await SessionService.updateSession(sessionId, { cart });

      // Increment coupon usage count
      await CouponService.incrementCouponUsage(coupon.id);

      return {
        success: true,
        appliedDiscount,
        newCartTotal: cart.total,
        savedAmount: discountCalculation.finalDiscountAmount,
        message: `${coupon.name} 쿠폰이 적용되었습니다. ${discountCalculation.finalDiscountAmount.toLocaleString()}원 할인되었습니다.`
      };

    } catch (error) {
      console.error('Apply coupon error:', error);
      return {
        success: false,
        errorMessage: `쿠폰 적용 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'APPLICATION_ERROR'
      };
    }
  }

  /**
   * Remove applied coupon from cart
   * Requirement 4.3: Coupon stacking and exclusivity rule enforcement
   */
  static async remove_coupon(
    sessionId: string,
    couponCode: string
  ): Promise<DiscountApplication> {
    try {
      const session = await SessionService.getSession(sessionId);
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      const cart = session.cart;
      const discountIndex = cart.discounts.findIndex(d => d.couponCode === couponCode);

      if (discountIndex === -1) {
        return {
          success: false,
          errorMessage: '적용된 쿠폰을 찾을 수 없습니다.',
          errorCode: 'COUPON_NOT_APPLIED'
        };
      }

      const removedDiscount = cart.discounts.splice(discountIndex, 1)[0];

      // Recalculate cart totals
      const newSubtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
      const totalDiscounts = cart.discounts.reduce((sum, discount) => sum + discount.appliedAmount, 0);
      cart.subtotal = newSubtotal;
      cart.total = newSubtotal - totalDiscounts;
      cart.updatedAt = new Date();

      // Update session
      await SessionService.updateSession(sessionId, { cart });

      return {
        success: true,
        removedDiscount,
        newCartTotal: cart.total,
        message: `${removedDiscount.couponCode} 쿠폰이 제거되었습니다.`
      };

    } catch (error) {
      console.error('Remove coupon error:', error);
      return {
        success: false,
        errorMessage: `쿠폰 제거 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        errorCode: 'REMOVAL_ERROR'
      };
    }
  }

  /**
   * Get available coupons for user
   * Requirement 4.6: Coupon recommendation system
   */
  static async list_available_coupons(
    userId?: string,
    cartContext?: CartContext
  ): Promise<AvailableCoupon[]> {
    try {
      // Get all active coupons
      const allCoupons = await CouponService.getActiveCoupons();

      const availableCoupons: AvailableCoupon[] = [];

      for (const coupon of allCoupons) {
        // Check if coupon is applicable to current cart context
        let isApplicable = true;
        let applicabilityReason = '';

        if (cartContext) {
          // Check minimum order amount
          if (coupon.minimumOrderAmount && cartContext.subtotal < coupon.minimumOrderAmount) {
            isApplicable = false;
            applicabilityReason = `최소 주문 금액 ${coupon.minimumOrderAmount.toLocaleString()}원 이상 필요`;
          }

          // Check restrictions
          if (isApplicable) {
            const restrictionCheck = await this.checkCouponRestrictions(coupon, cartContext.items, userId);
            if (!restrictionCheck.isValid) {
              isApplicable = false;
              applicabilityReason = restrictionCheck.errorMessage || '적용 조건을 만족하지 않음';
            }
          }
        }

        // Calculate potential discount
        let potentialDiscount = 0;
        if (isApplicable && cartContext) {
          const discountCalc = await this.compute_discount(coupon.id, {
            sessionId: '',
            items: cartContext.items,
            subtotal: cartContext.subtotal,
            discounts: [],
            taxes: [],
            total: cartContext.subtotal,
            currency: 'KRW',
            updatedAt: new Date()
          });
          potentialDiscount = discountCalc.finalDiscountAmount;
        }

        availableCoupons.push({
          coupon,
          isApplicable,
          applicabilityReason,
          potentialDiscount,
          priority: this.calculateCouponPriority(coupon, potentialDiscount, isApplicable)
        });
      }

      // Sort by priority (highest first)
      return availableCoupons.sort((a, b) => b.priority - a.priority);

    } catch (error) {
      console.error('List available coupons error:', error);
      throw new Error(`사용 가능한 쿠폰을 가져오는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Calculate discount amount for a specific coupon and cart
   * Requirement 4.2: Discount calculation with various coupon types
   */
  static async compute_discount(
    couponId: string,
    cart: Cart
  ): Promise<DiscountCalculation> {
    try {
      const coupon = await CouponService.getCoupon(couponId);
      if (!coupon) {
        throw new Error('쿠폰을 찾을 수 없습니다.');
      }

      const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
      let discountAmount = 0;
      let applicableAmount = subtotal;

      // Calculate base discount based on type
      switch (coupon.discountType) {
        case 'percentage':
          discountAmount = applicableAmount * (coupon.discountValue / 100);
          
          // Apply maximum discount limit if set
          if (coupon.maximumDiscountAmount && discountAmount > coupon.maximumDiscountAmount) {
            discountAmount = coupon.maximumDiscountAmount;
          }
          break;

        case 'fixed_amount':
          discountAmount = Math.min(coupon.discountValue, applicableAmount);
          break;

        case 'free_shipping':
          // Free shipping discount will be handled in delivery fee calculation
          discountAmount = 0;
          break;

        default:
          throw new Error('지원하지 않는 할인 유형입니다.');
      }

      // Ensure discount doesn't exceed cart total
      const finalDiscountAmount = Math.min(discountAmount, applicableAmount);

      return {
        couponId,
        couponCode: coupon.code,
        discountType: coupon.discountType,
        baseDiscountAmount: discountAmount,
        finalDiscountAmount,
        applicableAmount,
        savings: finalDiscountAmount,
        explanation: this.generateDiscountExplanation(coupon, finalDiscountAmount)
      };

    } catch (error) {
      console.error('Compute discount error:', error);
      throw new Error(`할인 계산 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Get best coupon recommendations for current cart
   * Requirement 4.6: Coupon recommendation system
   */
  static async get_coupon_recommendations(
    sessionId: string,
    limit: number = 3
  ): Promise<AvailableCoupon[]> {
    try {
      const session = await SessionService.getSession(sessionId);
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      const cart = session.cart;
      if (cart.items.length === 0) {
        return [];
      }

      const cartContext: CartContext = {
        items: cart.items,
        subtotal: cart.subtotal,
        appliedCoupons: cart.discounts
      };

      const availableCoupons = await this.list_available_coupons(session.userId, cartContext);

      // Filter out already applied coupons
      const appliedCouponCodes = cart.discounts.map(d => d.couponCode);
      const unappliedCoupons = availableCoupons.filter(
        ac => !appliedCouponCodes.includes(ac.coupon.code)
      );

      // Return top recommendations
      return unappliedCoupons
        .filter(ac => ac.isApplicable && ac.potentialDiscount > 0)
        .slice(0, limit);

    } catch (error) {
      console.error('Get coupon recommendations error:', error);
      throw new Error(`쿠폰 추천을 가져오는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  // Private helper methods

  private static async checkCouponRestrictions(
    coupon: Coupon,
    items: CartItem[],
    userId?: string
  ): Promise<{ isValid: boolean; errorMessage?: string }> {
    for (const restriction of coupon.restrictions) {
      switch (restriction.type) {
        case 'category':
          const hasValidCategory = await this.checkCategoryRestriction(restriction, items);
          if (!hasValidCategory) {
            return {
              isValid: false,
              errorMessage: `${restriction.value} 카테고리 상품에만 적용 가능합니다.`
            };
          }
          break;

        case 'product':
          const hasValidProduct = await this.checkProductRestriction(restriction, items);
          if (!hasValidProduct) {
            return {
              isValid: false,
              errorMessage: '특정 상품에만 적용 가능한 쿠폰입니다.'
            };
          }
          break;

        case 'user':
          if (userId && !this.checkUserRestriction(restriction, userId)) {
            return {
              isValid: false,
              errorMessage: '이 쿠폰은 특정 사용자만 사용할 수 있습니다.'
            };
          }
          break;

        case 'time':
          if (!this.checkTimeRestriction(restriction)) {
            return {
              isValid: false,
              errorMessage: '현재 시간에는 사용할 수 없는 쿠폰입니다.'
            };
          }
          break;
      }
    }

    return { isValid: true };
  }

  private static async checkCategoryRestriction(
    restriction: CouponRestriction,
    items: CartItem[]
  ): Promise<boolean> {
    const productIds = items.map(item => item.productId);
    const products = await Promise.all(
      productIds.map(id => ProductService.getProduct(id))
    );

    const categories = products.filter(p => p).map(p => p!.category);

    switch (restriction.operator) {
      case 'equals':
        return categories.includes(restriction.value);
      case 'not_equals':
        return !categories.includes(restriction.value);
      case 'in':
        const allowedCategories = restriction.value.split(',');
        return categories.some(cat => allowedCategories.includes(cat));
      case 'not_in':
        const excludedCategories = restriction.value.split(',');
        return !categories.some(cat => excludedCategories.includes(cat));
      default:
        return false;
    }
  }

  private static async checkProductRestriction(
    restriction: CouponRestriction,
    items: CartItem[]
  ): Promise<boolean> {
    const productIds = items.map(item => item.productId);

    switch (restriction.operator) {
      case 'equals':
        return productIds.includes(restriction.value);
      case 'not_equals':
        return !productIds.includes(restriction.value);
      case 'in':
        const allowedProducts = restriction.value.split(',');
        return productIds.some(id => allowedProducts.includes(id));
      case 'not_in':
        const excludedProducts = restriction.value.split(',');
        return !productIds.some(id => excludedProducts.includes(id));
      default:
        return false;
    }
  }

  private static checkUserRestriction(
    restriction: CouponRestriction,
    userId: string
  ): boolean {
    switch (restriction.operator) {
      case 'equals':
        return userId === restriction.value;
      case 'not_equals':
        return userId !== restriction.value;
      case 'in':
        const allowedUsers = restriction.value.split(',');
        return allowedUsers.includes(userId);
      case 'not_in':
        const excludedUsers = restriction.value.split(',');
        return !excludedUsers.includes(userId);
      default:
        return false;
    }
  }

  private static checkTimeRestriction(restriction: CouponRestriction): boolean {
    const now = new Date();
    const currentHour = now.getHours();

    // Example: "9-17" for 9 AM to 5 PM
    if (restriction.value.includes('-')) {
      const [startHour, endHour] = restriction.value.split('-').map(Number);
      return currentHour >= startHour && currentHour <= endHour;
    }

    return true;
  }

  private static async checkCouponStacking(
    existingDiscounts: AppliedDiscount[],
    newCoupon: Coupon
  ): Promise<{ canStack: boolean; errorMessage?: string }> {
    // Check if there are any existing discounts
    if (existingDiscounts.length === 0) {
      return { canStack: true };
    }

    // For now, implement simple stacking rules
    // In a real system, this would be more sophisticated
    
    // Don't allow multiple percentage discounts
    const hasPercentageDiscount = existingDiscounts.some(d => d.discountType === 'percentage');
    if (hasPercentageDiscount && newCoupon.discountType === 'percentage') {
      return {
        canStack: false,
        errorMessage: '퍼센트 할인 쿠폰은 중복 사용할 수 없습니다.'
      };
    }

    // Don't allow more than 3 coupons total
    if (existingDiscounts.length >= 3) {
      return {
        canStack: false,
        errorMessage: '최대 3개의 쿠폰만 동시에 사용할 수 있습니다.'
      };
    }

    return { canStack: true };
  }

  private static calculateCouponPriority(
    coupon: Coupon,
    potentialDiscount: number,
    isApplicable: boolean
  ): number {
    let priority = 0;

    // Higher discount amount = higher priority
    priority += potentialDiscount * 0.1;

    // Applicable coupons get higher priority
    if (isApplicable) {
      priority += 100;
    }

    // Percentage discounts often feel more valuable
    if (coupon.discountType === 'percentage') {
      priority += 10;
    }

    // Expiring soon gets higher priority
    const daysUntilExpiry = Math.ceil(
      (coupon.validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpiry <= 7) {
      priority += 20;
    }

    return priority;
  }

  private static generateDiscountExplanation(
    coupon: Coupon,
    discountAmount: number
  ): string {
    switch (coupon.discountType) {
      case 'percentage':
        return `${coupon.discountValue}% 할인으로 ${discountAmount.toLocaleString()}원 절약`;
      case 'fixed_amount':
        return `${discountAmount.toLocaleString()}원 할인`;
      case 'free_shipping':
        return '배송비 무료';
      default:
        return `${discountAmount.toLocaleString()}원 할인`;
    }
  }
}

// Export function declarations for LLM integration
export const couponAgentFunctions = {
  validate_coupon: {
    name: 'validate_coupon',
    description: '쿠폰 코드를 검증하고 적용 가능 여부를 확인합니다.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '쿠폰 코드'
        },
        cartTotal: {
          type: 'number',
          description: '장바구니 총액'
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
          description: '장바구니 상품 목록'
        },
        userId: {
          type: 'string',
          description: '사용자 ID (선택사항)'
        }
      },
      required: ['code', 'cartTotal', 'items']
    }
  },

  apply_coupon: {
    name: 'apply_coupon',
    description: '쿠폰을 장바구니에 적용합니다.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '세션 ID'
        },
        couponCode: {
          type: 'string',
          description: '적용할 쿠폰 코드'
        }
      },
      required: ['sessionId', 'couponCode']
    }
  },

  remove_coupon: {
    name: 'remove_coupon',
    description: '적용된 쿠폰을 제거합니다.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '세션 ID'
        },
        couponCode: {
          type: 'string',
          description: '제거할 쿠폰 코드'
        }
      },
      required: ['sessionId', 'couponCode']
    }
  },

  list_available_coupons: {
    name: 'list_available_coupons',
    description: '사용 가능한 쿠폰 목록을 가져옵니다.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '사용자 ID (선택사항)'
        },
        cartContext: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'object' },
              description: '장바구니 상품 목록'
            },
            subtotal: {
              type: 'number',
              description: '장바구니 소계'
            }
          },
          description: '장바구니 컨텍스트 (선택사항)'
        }
      }
    }
  },

  compute_discount: {
    name: 'compute_discount',
    description: '특정 쿠폰의 할인 금액을 계산합니다.',
    parameters: {
      type: 'object',
      properties: {
        couponId: {
          type: 'string',
          description: '쿠폰 ID'
        },
        cart: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'object' },
              description: '장바구니 상품 목록'
            },
            subtotal: { type: 'number', description: '소계' },
            total: { type: 'number', description: '총액' }
          },
          description: '장바구니 정보'
        }
      },
      required: ['couponId', 'cart']
    }
  },

  get_coupon_recommendations: {
    name: 'get_coupon_recommendations',
    description: '현재 장바구니에 적용 가능한 최적의 쿠폰을 추천합니다.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '세션 ID'
        },
        limit: {
          type: 'number',
          description: '추천 쿠폰 개수',
          default: 3
        }
      },
      required: ['sessionId']
    }
  }
};