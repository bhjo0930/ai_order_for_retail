import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProductAgent } from '../product-agent';
import { Product, Cart, CartItem, ProductFilters } from '../../types';

// Mock database services
vi.mock('../../database', () => ({
  ProductService: {
    searchProducts: vi.fn(),
    getProduct: vi.fn(),
    getProductsByCategory: vi.fn(),
    updateInventory: vi.fn(),
  },
  SessionService: {
    getSession: vi.fn(),
    updateSession: vi.fn(),
  },
  OrderCalculationService: {
    calculateOrderTotals: vi.fn(),
  },
}));

describe('ProductAgent', () => {
  const sessionId = 'test-session-123';
  
  const mockProduct: Product = {
    id: 'product-1',
    name: '아메리카노',
    description: '진한 에스프레소와 뜨거운 물로 만든 커피',
    price: 4500,
    currency: 'KRW',
    category: 'coffee',
    imageUrl: 'https://example.com/americano.jpg',
    options: [
      {
        id: 'size',
        name: '사이즈',
        type: 'single',
        required: true,
        choices: [
          { id: 'regular', name: '레귤러', priceModifier: 0, isAvailable: true },
          { id: 'large', name: '라지', priceModifier: 500, isAvailable: true },
        ],
      },
    ],
    inventory: {
      count: 100,
      isAvailable: true,
      lowStockThreshold: 10,
    },
    tags: ['hot', 'coffee', 'espresso'],
    isActive: true,
  };

  const mockCart: Cart = {
    sessionId,
    items: [],
    subtotal: 0,
    discounts: [],
    taxes: [],
    total: 0,
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

  describe('search_catalog', () => {
    it('should search products successfully', async () => {
      const mockProducts = [mockProduct];
      const { ProductService } = await import('../../database');
      vi.mocked(ProductService.searchProducts).mockResolvedValue(mockProducts);

      const result = await ProductAgent.search_catalog('아메리카노');

      expect(result).toEqual({
        query: '아메리카노',
        products: mockProducts,
        totalCount: 1,
        hasMore: false,
        filters: undefined,
        suggestions: expect.any(Array),
      });

      expect(mockProductService.searchProducts).toHaveBeenCalledWith(
        '아메리카노',
        undefined,
        20
      );
    });

    it('should apply price range filter', async () => {
      const mockProducts = [mockProduct];
      mockProductService.searchProducts.mockResolvedValue([
        mockProduct,
        { ...mockProduct, id: 'product-2', price: 6000 },
      ]);

      const filters: ProductFilters = {
        priceRange: [4000, 5000],
      };

      const result = await ProductAgent.search_catalog('커피', filters);

      expect(result.products).toHaveLength(1);
      expect(result.products[0].price).toBeLessThanOrEqual(5000);
      expect(result.products[0].price).toBeGreaterThanOrEqual(4000);
    });

    it('should apply availability filter', async () => {
      const unavailableProduct = {
        ...mockProduct,
        id: 'product-2',
        inventory: { ...mockProduct.inventory, isAvailable: false },
      };
      
      mockProductService.searchProducts.mockResolvedValue([
        mockProduct,
        unavailableProduct,
      ]);

      const filters: ProductFilters = {
        availability: true,
      };

      const result = await ProductAgent.search_catalog('커피', filters);

      expect(result.products).toHaveLength(1);
      expect(result.products[0].inventory.isAvailable).toBe(true);
    });

    it('should apply tags filter', async () => {
      const mockProducts = [
        mockProduct,
        { ...mockProduct, id: 'product-2', tags: ['cold', 'coffee'] },
      ];
      mockProductService.searchProducts.mockResolvedValue(mockProducts);

      const filters: ProductFilters = {
        tags: ['hot'],
      };

      const result = await ProductAgent.search_catalog('커피', filters);

      expect(result.products).toHaveLength(1);
      expect(result.products[0].tags).toContain('hot');
    });

    it('should sort products by relevance', async () => {
      const exactMatch = { ...mockProduct, name: '아메리카노' };
      const partialMatch = { ...mockProduct, id: 'product-2', name: '아이스 아메리카노' };
      const containsMatch = { ...mockProduct, id: 'product-3', name: '카페 아메리카노' };

      mockProductService.searchProducts.mockResolvedValue([
        containsMatch,
        partialMatch,
        exactMatch,
      ]);

      const result = await ProductAgent.search_catalog('아메리카노');

      expect(result.products[0].name).toBe('아메리카노'); // Exact match first
    });

    it('should handle search errors', async () => {
      mockProductService.searchProducts.mockRejectedValue(new Error('Database error'));

      await expect(ProductAgent.search_catalog('커피'))
        .rejects.toThrow('제품 검색 중 오류가 발생했습니다');
    });

    it('should generate search suggestions', async () => {
      const mockProducts = [
        { ...mockProduct, category: 'coffee', tags: ['hot', 'espresso'] },
        { ...mockProduct, id: 'product-2', category: 'tea', tags: ['hot', 'green'] },
      ];
      mockProductService.searchProducts.mockResolvedValue(mockProducts);

      const result = await ProductAgent.search_catalog('음료');

      expect(result.suggestions).toContain('coffee');
      expect(result.suggestions).toContain('tea');
    });
  });

  describe('get_product', () => {
    it('should get product details successfully', async () => {
      const relatedProducts = [
        { ...mockProduct, id: 'product-2', name: '카페라떼' },
      ];

      mockProductService.getProduct.mockResolvedValue(mockProduct);
      mockProductService.getProductsByCategory.mockResolvedValue([
        mockProduct,
        ...relatedProducts,
      ]);

      const result = await ProductAgent.get_product('product-1');

      expect(result).toEqual({
        ...mockProduct,
        relatedProducts,
        nutritionInfo: undefined,
        allergenInfo: undefined,
        reviews: {
          averageRating: 4.5,
          totalReviews: 0,
          recentReviews: [],
        },
      });
    });

    it('should throw error for non-existent product', async () => {
      mockProductService.getProduct.mockResolvedValue(null);

      await expect(ProductAgent.get_product('non-existent'))
        .rejects.toThrow('제품을 찾을 수 없습니다.');
    });

    it('should handle database errors', async () => {
      mockProductService.getProduct.mockRejectedValue(new Error('Database error'));

      await expect(ProductAgent.get_product('product-1'))
        .rejects.toThrow('제품 정보를 가져오는 중 오류가 발생했습니다');
    });
  });

  describe('add_to_cart', () => {
    beforeEach(() => {
      mockSessionService.getSession.mockResolvedValue(mockSession);
      mockProductService.getProduct.mockResolvedValue(mockProduct);
      mockOrderCalculationService.calculateOrderTotals.mockResolvedValue({
        subtotal: 4500,
        taxTotal: 450,
        finalTotal: 4950,
      });
    });

    it('should add product to cart successfully', async () => {
      const result = await ProductAgent.add_to_cart(
        sessionId,
        'product-1',
        2,
        { size: 'regular' }
      );

      expect(result.success).toBe(true);
      expect(result.addedItem).toEqual({
        productId: 'product-1',
        productName: '아메리카노',
        quantity: 2,
        unitPrice: 4500,
        totalPrice: 9000,
        selectedOptions: { size: 'regular' },
      });

      expect(mockSessionService.updateSession).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          cart: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                productId: 'product-1',
                quantity: 2,
                unitPrice: 4500,
                totalPrice: 9000,
              }),
            ]),
          }),
        })
      );
    });

    it('should validate quantity is positive', async () => {
      await expect(ProductAgent.add_to_cart(sessionId, 'product-1', 0))
        .rejects.toThrow('수량은 1개 이상이어야 합니다.');
    });

    it('should check inventory availability', async () => {
      const outOfStockProduct = {
        ...mockProduct,
        inventory: { ...mockProduct.inventory, isAvailable: false, count: 0 },
      };
      mockProductService.getProduct.mockResolvedValue(outOfStockProduct);

      await expect(ProductAgent.add_to_cart(sessionId, 'product-1', 1))
        .rejects.toThrow('재고가 부족합니다');
    });

    it('should validate required options', async () => {
      await expect(ProductAgent.add_to_cart(sessionId, 'product-1', 1))
        .rejects.toThrow('필수 옵션을 선택해주세요: 사이즈');
    });

    it('should calculate price with options', async () => {
      const result = await ProductAgent.add_to_cart(
        sessionId,
        'product-1',
        1,
        { size: 'large' } // +500 KRW
      );

      expect(result.addedItem?.unitPrice).toBe(5000); // 4500 + 500
      expect(result.addedItem?.totalPrice).toBe(5000);
    });

    it('should update existing cart item quantity', async () => {
      const existingCart = {
        ...mockCart,
        items: [{
          productId: 'product-1',
          quantity: 1,
          selectedOptions: { size: 'regular' },
          unitPrice: 4500,
          totalPrice: 4500,
          addedAt: new Date(),
        }],
      };

      mockSessionService.getSession.mockResolvedValue({
        ...mockSession,
        cart: existingCart,
      });

      const result = await ProductAgent.add_to_cart(
        sessionId,
        'product-1',
        1,
        { size: 'regular' }
      );

      expect(result.success).toBe(true);
      // Should update existing item to quantity 2
      expect(mockSessionService.updateSession).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          cart: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                quantity: 2,
                totalPrice: 9000,
              }),
            ]),
          }),
        })
      );
    });

    it('should handle session not found', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      await expect(ProductAgent.add_to_cart(sessionId, 'product-1', 1))
        .rejects.toThrow('세션을 찾을 수 없습니다.');
    });

    it('should handle product not found', async () => {
      mockProductService.getProduct.mockResolvedValue(null);

      await expect(ProductAgent.add_to_cart(sessionId, 'product-1', 1))
        .rejects.toThrow('제품을 찾을 수 없습니다.');
    });
  });

  describe('update_cart_item', () => {
    const cartWithItems = {
      ...mockCart,
      items: [{
        productId: 'product-1',
        quantity: 2,
        selectedOptions: { size: 'regular' },
        unitPrice: 4500,
        totalPrice: 9000,
        addedAt: new Date(),
      }],
    };

    beforeEach(() => {
      mockSessionService.getSession.mockResolvedValue({
        ...mockSession,
        cart: cartWithItems,
      });
      mockProductService.getProduct.mockResolvedValue(mockProduct);
      mockOrderCalculationService.calculateOrderTotals.mockResolvedValue({
        subtotal: 4500,
        taxTotal: 450,
        finalTotal: 4950,
      });
    });

    it('should update cart item quantity', async () => {
      const result = await ProductAgent.update_cart_item(
        sessionId,
        'product-1',
        3,
        { size: 'regular' }
      );

      expect(result.success).toBe(true);
      expect(result.updatedItem).toEqual({
        productId: 'product-1',
        quantity: 3,
        totalPrice: 13500,
      });
    });

    it('should remove item when quantity is 0', async () => {
      const result = await ProductAgent.update_cart_item(
        sessionId,
        'product-1',
        0,
        { size: 'regular' }
      );

      expect(result.success).toBe(true);
      expect(result.removedItem).toEqual({
        productId: 'product-1',
        quantity: 2,
      });
    });

    it('should check inventory when updating quantity', async () => {
      const lowStockProduct = {
        ...mockProduct,
        inventory: { ...mockProduct.inventory, count: 2 },
      };
      mockProductService.getProduct.mockResolvedValue(lowStockProduct);

      await expect(ProductAgent.update_cart_item(sessionId, 'product-1', 5))
        .rejects.toThrow('재고가 부족합니다');
    });

    it('should handle item not found in cart', async () => {
      await expect(ProductAgent.update_cart_item(sessionId, 'non-existent', 1))
        .rejects.toThrow('장바구니에서 해당 상품을 찾을 수 없습니다.');
    });
  });

  describe('clear_cart', () => {
    it('should clear cart successfully', async () => {
      mockSessionService.getSession.mockResolvedValue(mockSession);

      const result = await ProductAgent.clear_cart(sessionId);

      expect(result.success).toBe(true);
      expect(result.cart.items).toHaveLength(0);
      expect(result.cart.total).toBe(0);
      expect(mockSessionService.updateSession).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          cart: expect.objectContaining({
            items: [],
            total: 0,
          }),
        })
      );
    });

    it('should handle session not found', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      await expect(ProductAgent.clear_cart(sessionId))
        .rejects.toThrow('세션을 찾을 수 없습니다.');
    });
  });

  describe('get_recommendations', () => {
    beforeEach(() => {
      mockSessionService.getSession.mockResolvedValue(mockSession);
    });

    it('should get category-based recommendations', async () => {
      const categoryProducts = [
        { ...mockProduct, id: 'product-2', name: '카페라떼' },
        { ...mockProduct, id: 'product-3', name: '카푸치노' },
      ];
      mockProductService.getProductsByCategory.mockResolvedValue(categoryProducts);

      const result = await ProductAgent.get_recommendations(sessionId, {
        category: 'coffee',
        limit: 3,
      });

      expect(result).toHaveLength(3);
      expect(result[0].reason).toBe('category_match');
      expect(result[0].explanation).toContain('coffee 카테고리의 인기 상품');
    });

    it('should get cart-based recommendations', async () => {
      const cartWithItems = {
        ...mockCart,
        items: [{
          productId: 'product-1',
          quantity: 1,
          selectedOptions: {},
          unitPrice: 4500,
          totalPrice: 4500,
          addedAt: new Date(),
        }],
      };

      mockSessionService.getSession.mockResolvedValue({
        ...mockSession,
        cart: cartWithItems,
      });

      mockProductService.getProduct.mockResolvedValue(mockProduct);
      mockProductService.getProductsByCategory.mockResolvedValue([
        { ...mockProduct, id: 'product-2', name: '카페라떼' },
      ]);

      const result = await ProductAgent.get_recommendations(sessionId, {});

      expect(result.some(r => r.reason === 'cart_complement')).toBe(true);
    });

    it('should get popular items when no specific context', async () => {
      mockProductService.searchProducts.mockResolvedValue([
        { ...mockProduct, id: 'product-2', name: '인기상품' },
      ]);

      const result = await ProductAgent.get_recommendations(sessionId, {});

      expect(result.some(r => r.reason === 'popular')).toBe(true);
    });

    it('should sort recommendations by confidence', async () => {
      mockProductService.getProductsByCategory.mockResolvedValue([
        { ...mockProduct, id: 'product-2' },
      ]);
      mockProductService.searchProducts.mockResolvedValue([
        { ...mockProduct, id: 'product-3' },
      ]);

      const result = await ProductAgent.get_recommendations(sessionId, {
        category: 'coffee',
      });

      // Category recommendations should have higher confidence than popular
      expect(result[0].confidence).toBeGreaterThan(result[result.length - 1].confidence);
    });

    it('should handle session not found', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      await expect(ProductAgent.get_recommendations(sessionId, {}))
        .rejects.toThrow('세션을 찾을 수 없습니다.');
    });
  });

  describe('update_inventory', () => {
    it('should update inventory successfully', async () => {
      mockProductService.getProduct.mockResolvedValue(mockProduct);
      mockProductService.updateInventory.mockResolvedValue(undefined);

      const result = await ProductAgent.update_inventory('product-1', -5);

      expect(result).toEqual({
        productId: 'product-1',
        previousCount: 100,
        newCount: 95,
        delta: -5,
        isAvailable: true,
        isLowStock: false,
        message: '아메리카노 재고가 95개로 업데이트되었습니다.',
      });

      expect(mockProductService.updateInventory).toHaveBeenCalledWith('product-1', -5);
    });

    it('should detect low stock', async () => {
      const lowStockProduct = {
        ...mockProduct,
        inventory: { ...mockProduct.inventory, count: 10 },
      };
      mockProductService.getProduct.mockResolvedValue(lowStockProduct);

      const result = await ProductAgent.update_inventory('product-1', -5);

      expect(result.isLowStock).toBe(true);
      expect(result.newCount).toBe(5);
    });

    it('should prevent negative inventory', async () => {
      const lowStockProduct = {
        ...mockProduct,
        inventory: { ...mockProduct.inventory, count: 3 },
      };
      mockProductService.getProduct.mockResolvedValue(lowStockProduct);

      await expect(ProductAgent.update_inventory('product-1', -5))
        .rejects.toThrow('재고가 음수가 될 수 없습니다.');
    });

    it('should handle product not found', async () => {
      mockProductService.getProduct.mockResolvedValue(null);

      await expect(ProductAgent.update_inventory('non-existent', 1))
        .rejects.toThrow('제품을 찾을 수 없습니다.');
    });
  });

  describe('check_availability', () => {
    it('should check availability for multiple products', async () => {
      const products = [
        mockProduct,
        {
          ...mockProduct,
          id: 'product-2',
          inventory: { ...mockProduct.inventory, count: 5, lowStockThreshold: 10 },
        },
      ];

      mockProductService.getProduct
        .mockResolvedValueOnce(products[0])
        .mockResolvedValueOnce(products[1]);

      const result = await ProductAgent.check_availability(['product-1', 'product-2']);

      expect(result).toEqual({
        'product-1': {
          isAvailable: true,
          stockCount: 100,
          isLowStock: false,
        },
        'product-2': {
          isAvailable: true,
          stockCount: 5,
          isLowStock: true,
        },
      });
    });

    it('should handle non-existent products', async () => {
      mockProductService.getProduct.mockResolvedValue(null);

      const result = await ProductAgent.check_availability(['non-existent']);

      expect(result).toEqual({
        'non-existent': {
          isAvailable: false,
          stockCount: 0,
          isLowStock: false,
        },
      });
    });
  });
});