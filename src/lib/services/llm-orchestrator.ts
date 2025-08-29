import { GoogleGenerativeAI, GenerativeModel, ChatSession, FunctionDeclaration } from '@google/generative-ai';
import { 
  UserInput, 
  Intent, 
  FunctionCall, 
  FunctionResponse, 
  ConversationSession, 
  SessionState, 
  SessionStateType,
  StateContext,
  ConversationTurn,
  TurnContent,
  ErrorResponse
} from '../types';
import { uiSynchronizationService } from './ui-synchronization';

export class LLMOrchestratorService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private sessions: Map<string, ChatSession> = new Map();

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
      tools: [{
        functionDeclarations: this.getFunctionDeclarations()
      }],
      systemInstruction: this.getSystemInstruction()
    });
  }

  /**
   * Process user input and generate appropriate response
   */
  async processUserInput(sessionId: string, input: UserInput): Promise<void> {
    try {
      const session = await this.getOrCreateChatSession(sessionId);
      
      // Add user input to conversation
      const userMessage = `[${input.type.toUpperCase()}] ${input.content}`;
      
      // Send message and get response
      const result = await session.sendMessage(userMessage);
      const response = result.response;
      
      // Handle function calls if present
      if (response.functionCalls()) {
        for (const functionCall of response.functionCalls()) {
          await this.handleFunctionCall(sessionId, {
            name: functionCall.name,
            parameters: functionCall.args,
            id: `${sessionId}-${Date.now()}`
          });
        }
      }
      
      // Process text response if present
      if (response.text()) {
        await this.processTextResponse(sessionId, response.text());
      }
      
    } catch (error) {
      console.error('Error processing user input:', error);
      await this.handleError(sessionId, error as Error);
    }
  }

  /**
   * Route request to appropriate agent based on intent
   */
  async routeToAgent(sessionId: string, intent: Intent, context: any): Promise<any> {
    const functionName = this.mapIntentToFunction(intent);
    
    if (!functionName) {
      throw new Error(`No function mapping found for intent: ${intent.category}.${intent.action}`);
    }

    return await this.handleFunctionCall(sessionId, {
      name: functionName,
      parameters: { ...intent.slots, ...context },
      id: `${sessionId}-${Date.now()}`
    });
  }

  /**
   * Handle function calls from the LLM
   */
  async handleFunctionCall(sessionId: string, functionCall: FunctionCall): Promise<FunctionResponse> {
    try {
      console.log(`Executing function: ${functionCall.name}`, functionCall.parameters);
      
      let result: any;
      
      switch (functionCall.name) {
        // Product Agent Functions
        case 'search_catalog':
          result = await this.searchCatalog(functionCall.parameters);
          break;
        case 'get_product':
          result = await this.getProduct(functionCall.parameters);
          break;
        case 'add_to_cart':
          result = await this.addToCart(sessionId, functionCall.parameters);
          break;
        case 'get_recommendations':
          result = await this.getRecommendations(sessionId, functionCall.parameters);
          break;
          
        // Coupon Agent Functions
        case 'validate_coupon':
          result = await this.validateCoupon(functionCall.parameters);
          break;
        case 'apply_coupon':
          result = await this.applyCoupon(sessionId, functionCall.parameters);
          break;
        case 'list_available_coupons':
          result = await this.listAvailableCoupons(functionCall.parameters);
          break;
          
        // Order Agent Functions
        case 'create_order':
          result = await this.createOrder(sessionId, functionCall.parameters);
          break;
        case 'quote_delivery_fee':
          result = await this.quoteDeliveryFee(functionCall.parameters);
          break;
        case 'get_pickup_locations':
          result = await this.getPickupLocations(functionCall.parameters);
          break;
        case 'schedule_pickup':
          result = await this.schedulePickup(functionCall.parameters);
          break;
          
        // UI Update Functions
        case 'emit_ui_update':
          result = await this.emitUIUpdate(sessionId, functionCall.parameters);
          break;
        case 'emit_toast':
          result = await this.emitToast(sessionId, functionCall.parameters);
          break;
          
        default:
          throw new Error(`Unknown function: ${functionCall.name}`);
      }
      
      return {
        id: functionCall.id,
        result
      };
      
    } catch (error) {
      console.error(`Error executing function ${functionCall.name}:`, error);
      return {
        id: functionCall.id,
        result: null,
        error: (error as Error).message
      };
    }
  }

  /**
   * Update conversation context for a session
   */
  async updateConversationContext(sessionId: string, context: any): Promise<void> {
    // This would typically update the session state in a database
    // For now, we'll store it in memory or emit an event
    console.log(`Updating context for session ${sessionId}:`, context);
  }

  /**
   * Classify intent from user input
   */
  classifyIntent(input: string): Intent {
    // Simple rule-based intent classification
    // In a production system, this would use more sophisticated NLP
    
    const lowerInput = input.toLowerCase();
    
    // Product-related intents
    if (lowerInput.includes('주문') || lowerInput.includes('order') || 
        lowerInput.includes('찾') || lowerInput.includes('search')) {
      return {
        category: 'product',
        action: 'search',
        confidence: 0.8,
        slots: { query: input }
      };
    }
    
    // Coupon-related intents
    if (lowerInput.includes('쿠폰') || lowerInput.includes('coupon') || 
        lowerInput.includes('할인') || lowerInput.includes('discount')) {
      return {
        category: 'coupon',
        action: 'apply',
        confidence: 0.8,
        slots: { query: input }
      };
    }
    
    // Order-related intents
    if (lowerInput.includes('결제') || lowerInput.includes('payment') || 
        lowerInput.includes('픽업') || lowerInput.includes('pickup') ||
        lowerInput.includes('배달') || lowerInput.includes('delivery')) {
      return {
        category: 'order',
        action: 'process',
        confidence: 0.8,
        slots: { query: input }
      };
    }
    
    // Default to general intent
    return {
      category: 'general',
      action: 'chat',
      confidence: 0.5,
      slots: { query: input }
    };
  }

  /**
   * Get or create a chat session for the given session ID
   */
  private async getOrCreateChatSession(sessionId: string): Promise<ChatSession> {
    if (!this.sessions.has(sessionId)) {
      const chatSession = this.model.startChat({
        history: [],
      });
      this.sessions.set(sessionId, chatSession);
    }
    
    return this.sessions.get(sessionId)!;
  }

  /**
   * Get function declarations for Gemini function calling
   */
  private getFunctionDeclarations(): FunctionDeclaration[] {
    return [
      // Product Agent Functions
      {
        name: 'search_catalog',
        description: 'Search for products in the catalog',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query for products' },
            category: { type: 'string', description: 'Product category filter' },
            maxResults: { type: 'number', description: 'Maximum number of results to return' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_product',
        description: 'Get detailed information about a specific product',
        parameters: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'Product ID to retrieve' }
          },
          required: ['productId']
        }
      },
      {
        name: 'add_to_cart',
        description: 'Add a product to the shopping cart',
        parameters: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'Product ID to add' },
            quantity: { type: 'number', description: 'Quantity to add' },
            options: { type: 'object', description: 'Selected product options' }
          },
          required: ['productId', 'quantity']
        }
      },
      {
        name: 'get_recommendations',
        description: 'Get product recommendations based on context',
        parameters: {
          type: 'object',
          properties: {
            context: { type: 'string', description: 'Context for recommendations' },
            maxResults: { type: 'number', description: 'Maximum number of recommendations' }
          },
          required: ['context']
        }
      },
      
      // Coupon Agent Functions
      {
        name: 'validate_coupon',
        description: 'Validate a coupon code',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Coupon code to validate' },
            cartTotal: { type: 'number', description: 'Current cart total' }
          },
          required: ['code']
        }
      },
      {
        name: 'apply_coupon',
        description: 'Apply a validated coupon to the cart',
        parameters: {
          type: 'object',
          properties: {
            couponId: { type: 'string', description: 'Coupon ID to apply' }
          },
          required: ['couponId']
        }
      },
      {
        name: 'list_available_coupons',
        description: 'List available coupons for the user',
        parameters: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User ID (optional)' }
          }
        }
      },
      
      // Order Agent Functions
      {
        name: 'create_order',
        description: 'Create a new order',
        parameters: {
          type: 'object',
          properties: {
            orderType: { type: 'string', enum: ['pickup', 'delivery'], description: 'Type of order' },
            customerInfo: { type: 'object', description: 'Customer information' },
            deliveryAddress: { type: 'object', description: 'Delivery address (for delivery orders)' },
            pickupLocation: { type: 'object', description: 'Pickup location (for pickup orders)' }
          },
          required: ['orderType', 'customerInfo']
        }
      },
      {
        name: 'quote_delivery_fee',
        description: 'Calculate delivery fee for an address',
        parameters: {
          type: 'object',
          properties: {
            address: { type: 'object', description: 'Delivery address' },
            cartTotal: { type: 'number', description: 'Cart total for fee calculation' }
          },
          required: ['address']
        }
      },
      {
        name: 'get_pickup_locations',
        description: 'Get available pickup locations',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'object', description: 'User location for nearby stores' }
          }
        }
      },
      {
        name: 'schedule_pickup',
        description: 'Schedule a pickup time and location',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Order ID' },
            locationId: { type: 'string', description: 'Pickup location ID' },
            preferredTime: { type: 'string', description: 'Preferred pickup time' }
          },
          required: ['orderId', 'locationId', 'preferredTime']
        }
      },
      
      // UI Update Functions
      {
        name: 'emit_ui_update',
        description: 'Update the user interface',
        parameters: {
          type: 'object',
          properties: {
            panel: { type: 'string', enum: ['search', 'product', 'cart', 'checkout', 'order_status'], description: 'UI panel to update' },
            view: { type: 'string', description: 'Specific view within the panel' },
            data: { type: 'object', description: 'Data to display in the UI' }
          },
          required: ['panel', 'view', 'data']
        }
      },
      {
        name: 'emit_toast',
        description: 'Show a toast message to the user',
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['success', 'error', 'warning', 'info'], description: 'Type of toast message' },
            message: { type: 'string', description: 'Message to display' },
            duration: { type: 'number', description: 'Duration in milliseconds' }
          },
          required: ['kind', 'message']
        }
      }
    ];
  }

  /**
   * Get system instruction for the LLM
   */
  private getSystemInstruction(): string {
    return `You are a helpful voice ordering assistant for a Korean restaurant/cafe. You help customers:

1. Search and browse products in the catalog
2. Add items to their cart with proper options
3. Apply discount coupons when available
4. Process orders for pickup or delivery
5. Handle payments (mock system)

Key behaviors:
- Respond primarily in Korean, but understand English
- Be conversational and helpful
- Always confirm important details before proceeding
- Use function calls to perform actions
- Emit UI updates to keep the interface synchronized
- Handle errors gracefully and offer alternatives

When processing orders:
- For pickup: collect store preference and timing
- For delivery: collect address and calculate fees
- Always confirm cart contents before payment
- Use mock payment system (no real payment data)

Remember to emit ui_update events after significant actions to keep the UI synchronized.`;
  }

  /**
   * Map intent to function name
   */
  private mapIntentToFunction(intent: Intent): string | null {
    const mapping: Record<string, Record<string, string>> = {
      product: {
        search: 'search_catalog',
        get: 'get_product',
        add: 'add_to_cart',
        recommend: 'get_recommendations'
      },
      coupon: {
        validate: 'validate_coupon',
        apply: 'apply_coupon',
        list: 'list_available_coupons'
      },
      order: {
        create: 'create_order',
        quote: 'quote_delivery_fee',
        pickup: 'get_pickup_locations',
        schedule: 'schedule_pickup'
      }
    };

    return mapping[intent.category]?.[intent.action] || null;
  }

  /**
   * Process text response from LLM
   */
  private async processTextResponse(sessionId: string, text: string): Promise<void> {
    // Emit the text response as a UI update
    await uiSynchronizationService.emitUIUpdate(
      sessionId,
      'main',
      'chat',
      { message: text, role: 'assistant', timestamp: Date.now() }
    );
  }

  /**
   * Handle errors in LLM processing
   */
  private async handleError(sessionId: string, error: Error): Promise<void> {
    const errorResponse: ErrorResponse = {
      errorCode: 'LLM_PROCESSING_ERROR',
      errorMessage: error.message,
      errorCategory: 'llm',
      severity: 'medium',
      recoveryActions: [
        {
          type: 'retry',
          description: 'Try rephrasing your request',
          parameters: {}
        }
      ],
      userMessage: '죄송합니다. 요청을 처리하는 중 오류가 발생했습니다. 다시 시도해 주세요.',
      timestamp: new Date()
    };

    await uiSynchronizationService.emitToast(sessionId, {
      kind: 'error',
      message: errorResponse.userMessage,
      duration: 5000
    });
  }

  // Placeholder implementations for function calls
  // These will be replaced with actual agent implementations in later tasks

  private async searchCatalog(params: any): Promise<any> {
    console.log('Searching catalog:', params);
    return { products: [], total: 0, message: 'Product search functionality will be implemented in task 5.1' };
  }

  private async getProduct(params: any): Promise<any> {
    console.log('Getting product:', params);
    return { product: null, message: 'Product retrieval functionality will be implemented in task 5.1' };
  }

  private async addToCart(sessionId: string, params: any): Promise<any> {
    console.log('Adding to cart:', params);
    return { success: false, message: 'Cart functionality will be implemented in task 5.1' };
  }

  private async getRecommendations(sessionId: string, params: any): Promise<any> {
    console.log('Getting recommendations:', params);
    return { recommendations: [], message: 'Recommendation functionality will be implemented in task 5.1' };
  }

  private async validateCoupon(params: any): Promise<any> {
    console.log('Validating coupon:', params);
    return { isValid: false, message: 'Coupon validation functionality will be implemented in task 5.2' };
  }

  private async applyCoupon(sessionId: string, params: any): Promise<any> {
    console.log('Applying coupon:', params);
    return { success: false, message: 'Coupon application functionality will be implemented in task 5.2' };
  }

  private async listAvailableCoupons(params: any): Promise<any> {
    console.log('Listing coupons:', params);
    return { coupons: [], message: 'Coupon listing functionality will be implemented in task 5.2' };
  }

  private async createOrder(sessionId: string, params: any): Promise<any> {
    console.log('Creating order:', params);
    return { orderId: null, message: 'Order creation functionality will be implemented in task 5.3' };
  }

  private async quoteDeliveryFee(params: any): Promise<any> {
    console.log('Quoting delivery fee:', params);
    return { fee: 0, message: 'Delivery fee calculation functionality will be implemented in task 5.3' };
  }

  private async getPickupLocations(params: any): Promise<any> {
    console.log('Getting pickup locations:', params);
    return { locations: [], message: 'Pickup location functionality will be implemented in task 5.3' };
  }

  private async schedulePickup(params: any): Promise<any> {
    console.log('Scheduling pickup:', params);
    return { success: false, message: 'Pickup scheduling functionality will be implemented in task 5.3' };
  }

  private async emitUIUpdate(sessionId: string, params: any): Promise<any> {
    try {
      await uiSynchronizationService.emitUIUpdate(
        sessionId,
        params.panel,
        params.view,
        params.data
      );
      return { success: true };
    } catch (error) {
      console.error('Failed to emit UI update:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  private async emitToast(sessionId: string, params: any): Promise<any> {
    try {
      await uiSynchronizationService.emitToast(sessionId, {
        kind: params.kind,
        message: params.message,
        duration: params.duration
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to emit toast:', error);
      return { success: false, error: (error as Error).message };
    }
  }
}