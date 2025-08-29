import { 
  Product, 
  Cart, 
  CartItem, 
  ProductFilters, 
  ProductSearchResult, 
  ProductDetails, 
  CartUpdate, 
  InventoryUpdate, 
  ProductRecommendation,
  RecommendationContext,
  ProductOptions
} from '../types';
import { 
  ProductService, 
  SessionService, 
  OrderCalculationService 
} from '../database';

/**
 * Product Agent - Handles product search, catalog browsing, cart management,
 * and product recommendations for the voice ordering system.
 * 
 * Requirements covered: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
export class ProductAgent {
  
  /**
   * Search product catalog with filters and ranking
   * Requirement 3.1: Product search with structured data
   */
  static async search_catalog(
    query: string, 
    filters?: ProductFilters
  ): Promise<ProductSearchResult> {
    try {
      // Clean and normalize search query
      const normalizedQuery = query.trim().toLowerCase();
      
      // Search products using database service
      const products = await ProductService.searchProducts(
        normalizedQuery,
        filters?.category,
        filters?.limit || 20
      );

      // Apply additional filters
      let filteredProducts = products;
      
      if (filters?.priceRange) {
        const [minPrice, maxPrice] = filters.priceRange;
        filteredProducts = filteredProducts.filter(
          p => p.price >= minPrice && p.price <= maxPrice
        );
      }

      if (filters?.availability !== undefined) {
        filteredProducts = filteredProducts.filter(
          p => p.inventory.isAvailable === filters.availability
        );
      }

      if (filters?.tags && filters.tags.length > 0) {
        filteredProducts = filteredProducts.filter(
          p => filters.tags!.some(tag => p.tags.includes(tag))
        );
      }

      // Sort results by relevance
      const sortedProducts = this.sortProductsByRelevance(filteredProducts, normalizedQuery);

      return {
        query: query,
        products: sortedProducts,
        totalCount: sortedProducts.length,
        hasMore: false, // For pagination in future
        filters: filters,
        suggestions: this.generateSearchSuggestions(query, sortedProducts)
      };

    } catch (error) {
      console.error('Product search error:', error);
      throw new Error(`제품 검색 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Get detailed product information
   * Requirement 3.3: Comprehensive product information
   */
  static async get_product(productId: string): Promise<ProductDetails> {
    try {
      const product = await ProductService.getProduct(productId);
      
      if (!product) {
        throw new Error('제품을 찾을 수 없습니다.');
      }

      // Get related products for recommendations
      const relatedProducts = await ProductService.getProductsByCategory(product.category);
      const related = relatedProducts
        .filter(p => p.id !== productId)
        .slice(0, 4);

      return {
        ...product,
        relatedProducts: related,
        nutritionInfo: undefined, // Would be populated from product data
        allergenInfo: undefined,  // Would be populated from product data
        reviews: {
          averageRating: 4.5, // Mock data - would come from reviews system
          totalReviews: 0,
          recentReviews: []
        }
      };

    } catch (error) {
      console.error('Get product error:', error);
      throw new Error(`제품 정보를 가져오는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Add product to cart with options and quantity
   * Requirement 3.5: Cart updates with ui.update events
   */
  static async add_to_cart(
    sessionId: string,
    productId: string,
    quantity: number,
    options?: ProductOptions
  ): Promise<CartUpdate> {
    try {
      // Validate inputs
      if (quantity <= 0) {
        throw new Error('수량은 1개 이상이어야 합니다.');
      }

      // Get product details
      const product = await ProductService.getProduct(productId);
      if (!product) {
        throw new Error('제품을 찾을 수 없습니다.');
      }

      // Check inventory availability
      if (!product.inventory.isAvailable || product.inventory.count < quantity) {
        throw new Error(`재고가 부족합니다. 현재 재고: ${product.inventory.count}개`);
      }

      // Validate required options
      const missingRequiredOptions = product.options
        .filter(opt => opt.required)
        .filter(opt => !options || !options[opt.id]);

      if (missingRequiredOptions.length > 0) {
        throw new Error(`필수 옵션을 선택해주세요: ${missingRequiredOptions.map(opt => opt.name).join(', ')}`);
      }

      // Calculate price with options
      let unitPrice = product.price;
      const selectedOptions: Record<string, string> = {};

      if (options) {
        for (const [optionId, choiceId] of Object.entries(options)) {
          const option = product.options.find(opt => opt.id === optionId);
          if (option) {
            const choice = option.choices.find(c => c.id === choiceId);
            if (choice && choice.isAvailable) {
              unitPrice += choice.priceModifier;
              selectedOptions[optionId] = choiceId;
            }
          }
        }
      }

      const totalPrice = unitPrice * quantity;

      // Get current session and cart
      const session = await SessionService.getSession(sessionId);
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      const cart = session.cart;
      
      // Check if item already exists in cart
      const existingItemIndex = cart.items.findIndex(
        item => item.productId === productId && 
                JSON.stringify(item.selectedOptions) === JSON.stringify(selectedOptions)
      );

      if (existingItemIndex >= 0) {
        // Update existing item
        cart.items[existingItemIndex].quantity += quantity;
        cart.items[existingItemIndex].totalPrice = 
          cart.items[existingItemIndex].unitPrice * cart.items[existingItemIndex].quantity;
      } else {
        // Add new item
        const newItem: CartItem = {
          productId,
          quantity,
          selectedOptions,
          unitPrice,
          totalPrice,
          addedAt: new Date()
        };
        cart.items.push(newItem);
      }

      // Recalculate cart totals
      const updatedCart = await this.recalculateCartTotals(cart);

      // Update session with new cart
      await SessionService.updateSession(sessionId, { cart: updatedCart });

      return {
        success: true,
        cart: updatedCart,
        addedItem: {
          productId,
          productName: product.name,
          quantity,
          unitPrice,
          totalPrice,
          selectedOptions
        },
        message: `${product.name} ${quantity}개가 장바구니에 추가되었습니다.`
      };

    } catch (error) {
      console.error('Add to cart error:', error);
      throw new Error(`장바구니 추가 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Update cart item quantity or remove item
   * Requirement 3.2: Cart management operations
   */
  static async update_cart_item(
    sessionId: string,
    productId: string,
    quantity: number,
    selectedOptions?: Record<string, string>
  ): Promise<CartUpdate> {
    try {
      const session = await SessionService.getSession(sessionId);
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      const cart = session.cart;
      const itemIndex = cart.items.findIndex(
        item => item.productId === productId && 
                (!selectedOptions || JSON.stringify(item.selectedOptions) === JSON.stringify(selectedOptions))
      );

      if (itemIndex === -1) {
        throw new Error('장바구니에서 해당 상품을 찾을 수 없습니다.');
      }

      if (quantity <= 0) {
        // Remove item
        const removedItem = cart.items.splice(itemIndex, 1)[0];
        const updatedCart = await this.recalculateCartTotals(cart);
        await SessionService.updateSession(sessionId, { cart: updatedCart });

        return {
          success: true,
          cart: updatedCart,
          removedItem: {
            productId: removedItem.productId,
            quantity: removedItem.quantity
          },
          message: '상품이 장바구니에서 제거되었습니다.'
        };
      } else {
        // Update quantity
        const product = await ProductService.getProduct(productId);
        if (!product) {
          throw new Error('제품을 찾을 수 없습니다.');
        }

        if (product.inventory.count < quantity) {
          throw new Error(`재고가 부족합니다. 현재 재고: ${product.inventory.count}개`);
        }

        cart.items[itemIndex].quantity = quantity;
        cart.items[itemIndex].totalPrice = cart.items[itemIndex].unitPrice * quantity;

        const updatedCart = await this.recalculateCartTotals(cart);
        await SessionService.updateSession(sessionId, { cart: updatedCart });

        return {
          success: true,
          cart: updatedCart,
          updatedItem: {
            productId,
            quantity,
            totalPrice: cart.items[itemIndex].totalPrice
          },
          message: '장바구니가 업데이트되었습니다.'
        };
      }

    } catch (error) {
      console.error('Update cart item error:', error);
      throw new Error(`장바구니 업데이트 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Remove all items from cart
   * Requirement 3.2: Cart management operations
   */
  static async clear_cart(sessionId: string): Promise<CartUpdate> {
    try {
      const session = await SessionService.getSession(sessionId);
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      const emptyCart: Cart = {
        sessionId,
        items: [],
        subtotal: 0,
        discounts: [],
        taxes: [],
        total: 0,
        currency: 'KRW',
        updatedAt: new Date()
      };

      await SessionService.updateSession(sessionId, { cart: emptyCart });

      return {
        success: true,
        cart: emptyCart,
        message: '장바구니가 비워졌습니다.'
      };

    } catch (error) {
      console.error('Clear cart error:', error);
      throw new Error(`장바구니 비우기 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Get product recommendations based on user context
   * Requirement 3.6: Product recommendation logic
   */
  static async get_recommendations(
    sessionId: string,
    context: RecommendationContext
  ): Promise<ProductRecommendation[]> {
    try {
      const session = await SessionService.getSession(sessionId);
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      const recommendations: ProductRecommendation[] = [];

      // Category-based recommendations
      if (context.category) {
        const categoryProducts = await ProductService.getProductsByCategory(context.category);
        const categoryRecs = categoryProducts.slice(0, 3).map(product => ({
          product,
          reason: 'category_match',
          confidence: 0.8,
          explanation: `${context.category} 카테고리의 인기 상품입니다.`
        }));
        recommendations.push(...categoryRecs);
      }

      // Cart-based recommendations (complementary items)
      if (session.cart.items.length > 0) {
        const cartProductIds = session.cart.items.map(item => item.productId);
        const cartProducts = await Promise.all(
          cartProductIds.map(id => ProductService.getProduct(id))
        );
        
        const categories = [...new Set(cartProducts.filter(p => p).map(p => p!.category))];
        
        for (const category of categories) {
          const complementaryProducts = await ProductService.getProductsByCategory(category);
          const filtered = complementaryProducts
            .filter(p => !cartProductIds.includes(p.id))
            .slice(0, 2);
            
          const complementaryRecs = filtered.map(product => ({
            product,
            reason: 'cart_complement',
            confidence: 0.7,
            explanation: '장바구니 상품과 잘 어울리는 상품입니다.'
          }));
          recommendations.push(...complementaryRecs);
        }
      }

      // Popular items recommendations
      if (recommendations.length < 5) {
        const popularProducts = await ProductService.searchProducts('', undefined, 10);
        const popularRecs = popularProducts
          .filter(p => !recommendations.some(r => r.product.id === p.id))
          .slice(0, 5 - recommendations.length)
          .map(product => ({
            product,
            reason: 'popular',
            confidence: 0.6,
            explanation: '인기 상품입니다.'
          }));
        recommendations.push(...popularRecs);
      }

      // Sort by confidence and return top recommendations
      return recommendations
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, context.limit || 5);

    } catch (error) {
      console.error('Get recommendations error:', error);
      throw new Error(`추천 상품을 가져오는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Update product inventory
   * Requirement 3.4: Inventory management and availability checking
   */
  static async update_inventory(
    productId: string, 
    delta: number
  ): Promise<InventoryUpdate> {
    try {
      const product = await ProductService.getProduct(productId);
      if (!product) {
        throw new Error('제품을 찾을 수 없습니다.');
      }

      const newCount = product.inventory.count + delta;
      if (newCount < 0) {
        throw new Error('재고가 음수가 될 수 없습니다.');
      }

      await ProductService.updateInventory(productId, delta);

      return {
        productId,
        previousCount: product.inventory.count,
        newCount,
        delta,
        isAvailable: newCount > 0,
        isLowStock: newCount <= 5 && newCount > 0,
        message: `${product.name} 재고가 ${newCount}개로 업데이트되었습니다.`
      };

    } catch (error) {
      console.error('Update inventory error:', error);
      throw new Error(`재고 업데이트 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * Check product availability and stock levels
   * Requirement 3.4: Availability checking
   */
  static async check_availability(productIds: string[]): Promise<{
    [productId: string]: {
      isAvailable: boolean;
      stockCount: number;
      isLowStock: boolean;
    }
  }> {
    try {
      const availabilityMap: { [productId: string]: any } = {};

      for (const productId of productIds) {
        const product = await ProductService.getProduct(productId);
        if (product) {
          availabilityMap[productId] = {
            isAvailable: product.inventory.isAvailable,
            stockCount: product.inventory.count,
            isLowStock: product.inventory.count <= product.inventory.lowStockThreshold
          };
        } else {
          availabilityMap[productId] = {
            isAvailable: false,
            stockCount: 0,
            isLowStock: false
          };
        }
      }

      return availabilityMap;

    } catch (error) {
      console.error('Check availability error:', error);
      throw new Error(`재고 확인 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  // Private helper methods

  private static sortProductsByRelevance(products: Product[], query: string): Product[] {
    return products.sort((a, b) => {
      // Exact name match gets highest priority
      const aExactMatch = a.name.toLowerCase() === query;
      const bExactMatch = b.name.toLowerCase() === query;
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      // Name starts with query gets second priority
      const aStartsWith = a.name.toLowerCase().startsWith(query);
      const bStartsWith = b.name.toLowerCase().startsWith(query);
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;

      // Name contains query gets third priority
      const aContains = a.name.toLowerCase().includes(query);
      const bContains = b.name.toLowerCase().includes(query);
      if (aContains && !bContains) return -1;
      if (!aContains && bContains) return 1;

      // Finally sort by availability and then by name
      if (a.inventory.isAvailable && !b.inventory.isAvailable) return -1;
      if (!a.inventory.isAvailable && b.inventory.isAvailable) return 1;

      return a.name.localeCompare(b.name);
    });
  }

  private static generateSearchSuggestions(query: string, products: Product[]): string[] {
    const suggestions: string[] = [];
    
    // Get unique categories from results
    const categories = [...new Set(products.map(p => p.category))];
    suggestions.push(...categories.slice(0, 3));

    // Get common tags
    const allTags = products.flatMap(p => p.tags);
    const tagCounts = allTags.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const popularTags = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 2)
      .map(([tag]) => tag);

    suggestions.push(...popularTags);

    return suggestions.slice(0, 5);
  }

  private static async recalculateCartTotals(cart: Cart): Promise<Cart> {
    // Calculate subtotal
    const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

    // Use order calculation service for accurate totals including taxes
    const totals = await OrderCalculationService.calculateOrderTotals(
      cart.items,
      cart.discounts,
      0 // No delivery fee for cart calculation
    );

    return {
      ...cart,
      subtotal: totals.subtotal,
      total: totals.finalTotal,
      updatedAt: new Date()
    };
  }
}

// Export function declarations for LLM integration
export const productAgentFunctions = {
  search_catalog: {
    name: 'search_catalog',
    description: '제품 카탈로그에서 상품을 검색합니다. 검색어와 필터를 사용하여 관련 상품을 찾습니다.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '검색할 상품명 또는 키워드'
        },
        filters: {
          type: 'object',
          properties: {
            category: { type: 'string', description: '상품 카테고리' },
            priceRange: { 
              type: 'array', 
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
              description: '가격 범위 [최소가격, 최대가격]' 
            },
            availability: { type: 'boolean', description: '재고 있는 상품만 표시' },
            tags: { 
              type: 'array', 
              items: { type: 'string' },
              description: '상품 태그 필터' 
            },
            limit: { type: 'number', description: '검색 결과 개수 제한', default: 20 }
          }
        }
      },
      required: ['query']
    }
  },

  get_product: {
    name: 'get_product',
    description: '특정 상품의 상세 정보를 가져옵니다.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: '상품 ID'
        }
      },
      required: ['productId']
    }
  },

  add_to_cart: {
    name: 'add_to_cart',
    description: '상품을 장바구니에 추가합니다.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '세션 ID'
        },
        productId: {
          type: 'string',
          description: '상품 ID'
        },
        quantity: {
          type: 'number',
          description: '수량',
          minimum: 1
        },
        options: {
          type: 'object',
          description: '선택한 상품 옵션 (옵션ID: 선택ID)',
          additionalProperties: { type: 'string' }
        }
      },
      required: ['sessionId', 'productId', 'quantity']
    }
  },

  update_cart_item: {
    name: 'update_cart_item',
    description: '장바구니 상품의 수량을 변경하거나 제거합니다.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '세션 ID'
        },
        productId: {
          type: 'string',
          description: '상품 ID'
        },
        quantity: {
          type: 'number',
          description: '새로운 수량 (0이면 제거)',
          minimum: 0
        },
        selectedOptions: {
          type: 'object',
          description: '선택된 옵션 (특정 옵션 조합의 상품을 구분하기 위해)',
          additionalProperties: { type: 'string' }
        }
      },
      required: ['sessionId', 'productId', 'quantity']
    }
  },

  clear_cart: {
    name: 'clear_cart',
    description: '장바구니를 비웁니다.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '세션 ID'
        }
      },
      required: ['sessionId']
    }
  },

  get_recommendations: {
    name: 'get_recommendations',
    description: '사용자 컨텍스트를 기반으로 상품을 추천합니다.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '세션 ID'
        },
        context: {
          type: 'object',
          properties: {
            category: { type: 'string', description: '관심 카테고리' },
            limit: { type: 'number', description: '추천 상품 개수', default: 5 }
          }
        }
      },
      required: ['sessionId', 'context']
    }
  },

  update_inventory: {
    name: 'update_inventory',
    description: '상품 재고를 업데이트합니다.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: '상품 ID'
        },
        delta: {
          type: 'number',
          description: '재고 변경량 (양수: 증가, 음수: 감소)'
        }
      },
      required: ['productId', 'delta']
    }
  },

  check_availability: {
    name: 'check_availability',
    description: '여러 상품의 재고 상태를 확인합니다.',
    parameters: {
      type: 'object',
      properties: {
        productIds: {
          type: 'array',
          items: { type: 'string' },
          description: '확인할 상품 ID 목록'
        }
      },
      required: ['productIds']
    }
  }
};