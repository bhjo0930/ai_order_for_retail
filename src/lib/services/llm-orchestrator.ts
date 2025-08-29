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
import { errorHandler } from './error-handler';
import { conversationContextManager } from './conversation-context';

// LLM-specific error types
export interface LLMError extends Error {
  code: string;
  category: 'rate_limit' | 'context_length' | 'function_call' | 'api_error' | 'timeout' | 'quota_exceeded';
  retryable: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryAfter?: number; // seconds to wait before retry
}

// Rate limiting configuration
interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  tokensPerMinute: number;
  tokensPerHour: number;
}

// Context management configuration
interface ContextConfig {
  maxTokens: number;
  summarizationThreshold: number;
  keepRecentTurns: number;
}

export class LLMOrchestratorService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private sessions: Map<string, ChatSession> = new Map();
  private rateLimitTracker: Map<string, { requests: number[], tokens: number[], lastReset: Date }> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private contextSizes: Map<string, number> = new Map();
  
  private readonly rateLimitConfig: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    tokensPerMinute: 32000,
    tokensPerHour: 1000000,
  };
  
  private readonly contextConfig: ContextConfig = {
    maxTokens: 30000, // Conservative limit for Gemini 2.0 Flash
    summarizationThreshold: 25000,
    keepRecentTurns: 10,
  };
  
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [1000, 3000, 10000]; // Progressive delays in ms

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
   * Process user input and generate appropriate response with enhanced error handling
   */
  async processUserInput(sessionId: string, input: UserInput): Promise<void> {
    const retryCount = this.retryAttempts.get(sessionId) || 0;
    
    try {
      // Check rate limits before processing
      await this.checkRateLimits(sessionId);
      
      // Check and manage context length
      await this.manageContextLength(sessionId);
      
      const session = await this.getOrCreateChatSession(sessionId);
      
      // Add user input to conversation
      const userMessage = `[${input.type.toUpperCase()}] ${input.content}`;
      
      // Track token usage (estimated)
      const estimatedTokens = this.estimateTokens(userMessage);
      this.trackTokenUsage(sessionId, estimatedTokens);
      
      // Send message with timeout
      const result = await this.sendMessageWithTimeout(session, userMessage, 30000);
      const response = result.response;
      
      // Reset retry count on success
      this.retryAttempts.delete(sessionId);
      
      // Handle function calls if present
      if (response.functionCalls()) {
        for (const functionCall of response.functionCalls()) {
          await this.handleFunctionCallWithRetry(sessionId, {
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
      await this.handleLLMErrorWithRecovery(sessionId, error as Error, retryCount, input);
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
   * Handle function calls from the LLM with enhanced error handling
   */
  async handleFunctionCall(sessionId: string, functionCall: FunctionCall): Promise<FunctionResponse> {
    try {
      console.log(`Executing function: ${functionCall.name}`, functionCall.parameters);
      
      // Validate function parameters
      this.validateFunctionParameters(functionCall);
      
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
          throw this.createLLMError(
            `Unknown function: ${functionCall.name}`,
            'function_call',
            false,
            'medium'
          );
      }
      
      return {
        id: functionCall.id,
        result
      };
      
    } catch (error) {
      console.error(`Error executing function ${functionCall.name}:`, error);
      
      // Handle business logic errors through error handler
      if (error instanceof Error) {
        const recovery = await errorHandler.handleBusinessError(sessionId, error, functionCall.name);
        
        return {
          id: functionCall.id,
          result: null,
          error: error.message,
          recovery: recovery.success ? recovery : undefined
        };
      }
      
      return {
        id: functionCall.id,
        result: null,
        error: 'Unknown function execution error'
      };
    }
  }

  /**
   * Handle function calls with retry logic
   */
  async handleFunctionCallWithRetry(sessionId: string, functionCall: FunctionCall): Promise<FunctionResponse> {
    const maxRetries = 2; // Fewer retries for function calls
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.handleFunctionCall(sessionId, functionCall);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          console.log(`Function call retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed
    throw lastError || new Error('Function call failed after retries');
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

  // Enhanced Error Handling Methods

  /**
   * Create LLM-specific error
   */
  private createLLMError(
    message: string,
    category: LLMError['category'],
    retryable: boolean,
    severity: LLMError['severity'],
    retryAfter?: number
  ): LLMError {
    const error = new Error(message) as LLMError;
    error.code = `LLM_${category.toUpperCase()}`;
    error.category = category;
    error.retryable = retryable;
    error.severity = severity;
    error.retryAfter = retryAfter;
    return error;
  }

  /**
   * Handle LLM errors with recovery strategies
   */
  private async handleLLMErrorWithRecovery(
    sessionId: string,
    error: Error,
    retryCount: number,
    originalInput?: UserInput
  ): Promise<void> {
    const llmError = this.categorizeLLMError(error);
    
    console.error(`LLM error for session ${sessionId} (attempt ${retryCount + 1}):`, error);
    
    // Handle specific error types
    switch (llmError.category) {
      case 'rate_limit':
        await this.handleRateLimitError(sessionId, llmError, retryCount, originalInput);
        break;
      case 'context_length':
        await this.handleContextLengthError(sessionId, llmError, originalInput);
        break;
      case 'function_call':
        await this.handleFunctionCallError(sessionId, llmError, retryCount, originalInput);
        break;
      case 'quota_exceeded':
        await this.handleQuotaExceededError(sessionId, llmError);
        break;
      case 'timeout':
        await this.handleTimeoutError(sessionId, llmError, retryCount, originalInput);
        break;
      default:
        await this.handleGenericLLMError(sessionId, llmError, retryCount, originalInput);
    }
  }

  /**
   * Categorize LLM errors
   */
  private categorizeLLMError(error: Error): LLMError {
    const message = error.message.toLowerCase();
    
    if (message.includes('rate limit') || message.includes('too many requests')) {
      const retryAfter = this.extractRetryAfter(error.message);
      return this.createLLMError(error.message, 'rate_limit', true, 'high', retryAfter);
    } else if (message.includes('context length') || message.includes('token limit') || message.includes('too long')) {
      return this.createLLMError(error.message, 'context_length', true, 'medium');
    } else if (message.includes('function') || message.includes('parameter') || message.includes('invalid call')) {
      return this.createLLMError(error.message, 'function_call', true, 'medium');
    } else if (message.includes('quota') || message.includes('billing') || message.includes('exceeded')) {
      return this.createLLMError(error.message, 'quota_exceeded', false, 'critical');
    } else if (message.includes('timeout') || message.includes('deadline')) {
      return this.createLLMError(error.message, 'timeout', true, 'medium');
    } else {
      return this.createLLMError(error.message, 'api_error', true, 'medium');
    }
  }

  /**
   * Handle rate limit errors
   */
  private async handleRateLimitError(
    sessionId: string,
    error: LLMError,
    retryCount: number,
    originalInput?: UserInput
  ): Promise<void> {
    const retryAfter = error.retryAfter || 60; // Default to 60 seconds
    
    if (retryCount < this.MAX_RETRY_ATTEMPTS) {
      // Schedule retry
      this.retryAttempts.set(sessionId, retryCount + 1);
      
      await uiSynchronizationService.emitToast(sessionId, {
        kind: 'warning',
        message: `요청이 많아 ${retryAfter}초 후 다시 시도합니다.`,
        duration: 5000
      });
      
      setTimeout(async () => {
        if (originalInput) {
          await this.processUserInput(sessionId, originalInput);
        }
      }, retryAfter * 1000);
    } else {
      // Max retries exceeded, use error handler
      const recovery = await errorHandler.handleLLMError(sessionId, error, retryCount);
      
      await uiSynchronizationService.emitToast(sessionId, {
        kind: 'error',
        message: recovery.userMessage,
        duration: 8000
      });
    }
  }

  /**
   * Handle context length errors
   */
  private async handleContextLengthError(
    sessionId: string,
    error: LLMError,
    originalInput?: UserInput
  ): Promise<void> {
    try {
      // Summarize conversation history
      await this.summarizeConversationHistory(sessionId);
      
      await uiSynchronizationService.emitToast(sessionId, {
        kind: 'info',
        message: '대화 내용이 길어 일부 기록을 정리했습니다. 계속 진행해 주세요.',
        duration: 5000
      });
      
      // Retry with summarized context
      if (originalInput) {
        await this.processUserInput(sessionId, originalInput);
      }
    } catch (summarizeError) {
      console.error('Failed to summarize conversation:', summarizeError);
      
      // Fallback: clear conversation history
      await this.clearConversationHistory(sessionId);
      
      await uiSynchronizationService.emitToast(sessionId, {
        kind: 'warning',
        message: '대화 기록을 초기화했습니다. 다시 시작해 주세요.',
        duration: 5000
      });
    }
  }

  /**
   * Handle function call errors
   */
  private async handleFunctionCallError(
    sessionId: string,
    error: LLMError,
    retryCount: number,
    originalInput?: UserInput
  ): Promise<void> {
    if (retryCount < this.MAX_RETRY_ATTEMPTS) {
      // Try with simplified parameters
      this.retryAttempts.set(sessionId, retryCount + 1);
      
      await uiSynchronizationService.emitToast(sessionId, {
        kind: 'info',
        message: '다른 방식으로 처리해 보겠습니다.',
        duration: 3000
      });
      
      // Retry with delay
      setTimeout(async () => {
        if (originalInput) {
          await this.processUserInput(sessionId, originalInput);
        }
      }, 2000);
    } else {
      const recovery = await errorHandler.handleLLMError(sessionId, error, retryCount);
      
      await uiSynchronizationService.emitToast(sessionId, {
        kind: 'error',
        message: recovery.userMessage,
        duration: 5000
      });
    }
  }

  /**
   * Handle quota exceeded errors
   */
  private async handleQuotaExceededError(sessionId: string, error: LLMError): Promise<void> {
    await uiSynchronizationService.emitToast(sessionId, {
      kind: 'error',
      message: '서비스 사용량이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
      duration: 10000
    });
    
    // Implement graceful degradation
    await this.enableGracefulDegradation(sessionId);
  }

  /**
   * Handle timeout errors
   */
  private async handleTimeoutError(
    sessionId: string,
    error: LLMError,
    retryCount: number,
    originalInput?: UserInput
  ): Promise<void> {
    if (retryCount < this.MAX_RETRY_ATTEMPTS) {
      this.retryAttempts.set(sessionId, retryCount + 1);
      
      await uiSynchronizationService.emitToast(sessionId, {
        kind: 'warning',
        message: '응답 시간이 초과되어 다시 시도합니다.',
        duration: 3000
      });
      
      // Retry with exponential backoff
      const delay = this.RETRY_DELAYS[Math.min(retryCount, this.RETRY_DELAYS.length - 1)];
      setTimeout(async () => {
        if (originalInput) {
          await this.processUserInput(sessionId, originalInput);
        }
      }, delay);
    } else {
      await uiSynchronizationService.emitToast(sessionId, {
        kind: 'error',
        message: '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
        duration: 8000
      });
    }
  }

  /**
   * Handle generic LLM errors
   */
  private async handleGenericLLMError(
    sessionId: string,
    error: LLMError,
    retryCount: number,
    originalInput?: UserInput
  ): Promise<void> {
    const recovery = await errorHandler.handleLLMError(sessionId, error, retryCount);
    
    if (recovery.success && recovery.actions.some(action => action.type === 'retry') && retryCount < this.MAX_RETRY_ATTEMPTS) {
      this.retryAttempts.set(sessionId, retryCount + 1);
      
      const delay = this.RETRY_DELAYS[Math.min(retryCount, this.RETRY_DELAYS.length - 1)];
      setTimeout(async () => {
        if (originalInput) {
          await this.processUserInput(sessionId, originalInput);
        }
      }, delay);
    }
    
    await uiSynchronizationService.emitToast(sessionId, {
      kind: 'error',
      message: recovery.userMessage,
      duration: 5000
    });
  }

  /**
   * Check rate limits before making requests
   */
  private async checkRateLimits(sessionId: string): Promise<void> {
    const now = new Date();
    const tracker = this.rateLimitTracker.get(sessionId) || {
      requests: [],
      tokens: [],
      lastReset: now
    };
    
    // Clean old entries (older than 1 hour)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    tracker.requests = tracker.requests.filter(time => time > oneHourAgo.getTime());
    tracker.tokens = tracker.tokens.filter(time => time > oneHourAgo.getTime());
    
    // Check hourly limits
    if (tracker.requests.length >= this.rateLimitConfig.requestsPerHour) {
      throw this.createLLMError(
        'Hourly request limit exceeded',
        'rate_limit',
        true,
        'high',
        3600 // 1 hour
      );
    }
    
    // Check per-minute limits
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const recentRequests = tracker.requests.filter(time => time > oneMinuteAgo.getTime());
    
    if (recentRequests.length >= this.rateLimitConfig.requestsPerMinute) {
      throw this.createLLMError(
        'Per-minute request limit exceeded',
        'rate_limit',
        true,
        'medium',
        60 // 1 minute
      );
    }
    
    // Update tracker
    tracker.requests.push(now.getTime());
    this.rateLimitTracker.set(sessionId, tracker);
  }

  /**
   * Track token usage
   */
  private trackTokenUsage(sessionId: string, tokens: number): void {
    const tracker = this.rateLimitTracker.get(sessionId);
    if (tracker) {
      // Add token usage timestamp (simplified tracking)
      for (let i = 0; i < Math.ceil(tokens / 1000); i++) {
        tracker.tokens.push(Date.now());
      }
    }
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for mixed Korean/English
    return Math.ceil(text.length / 4);
  }

  /**
   * Manage context length
   */
  private async manageContextLength(sessionId: string): Promise<void> {
    const currentSize = this.contextSizes.get(sessionId) || 0;
    
    if (currentSize > this.contextConfig.summarizationThreshold) {
      await this.summarizeConversationHistory(sessionId);
    } else if (currentSize > this.contextConfig.maxTokens) {
      await this.clearConversationHistory(sessionId);
    }
  }

  /**
   * Summarize conversation history
   */
  private async summarizeConversationHistory(sessionId: string): Promise<void> {
    try {
      // Get conversation context
      const context = await conversationContextManager.getConversationContext(sessionId);
      
      if (context && context.conversationHistory.length > this.contextConfig.keepRecentTurns) {
        // Keep recent turns and summarize older ones
        const recentTurns = context.conversationHistory.slice(-this.contextConfig.keepRecentTurns);
        const olderTurns = context.conversationHistory.slice(0, -this.contextConfig.keepRecentTurns);
        
        // Create summary of older turns
        const summary = this.createConversationSummary(olderTurns);
        
        // Update context with summary and recent turns
        const summarizedHistory = [
          {
            id: `summary-${Date.now()}`,
            role: 'system' as const,
            content: [{ type: 'text' as const, data: summary }],
            timestamp: new Date(),
          },
          ...recentTurns
        ];
        
        await conversationContextManager.updateConversationHistory(sessionId, summarizedHistory);
        
        // Update context size estimate
        const newSize = this.estimateTokens(summary) + 
                       recentTurns.reduce((sum, turn) => sum + this.estimateTokens(JSON.stringify(turn)), 0);
        this.contextSizes.set(sessionId, newSize);
        
        console.log(`Summarized conversation for session ${sessionId}: ${olderTurns.length} turns -> summary`);
      }
    } catch (error) {
      console.error('Failed to summarize conversation:', error);
      throw error;
    }
  }

  /**
   * Clear conversation history
   */
  private async clearConversationHistory(sessionId: string): Promise<void> {
    await conversationContextManager.updateConversationHistory(sessionId, []);
    this.contextSizes.set(sessionId, 0);
    console.log(`Cleared conversation history for session ${sessionId}`);
  }

  /**
   * Create conversation summary
   */
  private createConversationSummary(turns: ConversationTurn[]): string {
    const summary = turns.map(turn => {
      const content = turn.content.map(c => c.data).join(' ');
      return `${turn.role}: ${content}`;
    }).join('\n');
    
    return `Previous conversation summary:\n${summary}`;
  }

  /**
   * Send message with timeout
   */
  private async sendMessageWithTimeout(session: ChatSession, message: string, timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(this.createLLMError('Request timeout', 'timeout', true, 'medium'));
      }, timeout);
      
      session.sendMessage(message)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Validate function parameters
   */
  private validateFunctionParameters(functionCall: FunctionCall): void {
    if (!functionCall.name) {
      throw this.createLLMError('Function name is required', 'function_call', false, 'medium');
    }
    
    if (!functionCall.parameters || typeof functionCall.parameters !== 'object') {
      throw this.createLLMError('Function parameters must be an object', 'function_call', true, 'medium');
    }
    
    // Additional validation could be added here based on function schemas
  }

  /**
   * Extract retry-after value from error message
   */
  private extractRetryAfter(message: string): number {
    const match = message.match(/retry after (\d+)/i);
    return match ? parseInt(match[1]) : 60; // Default to 60 seconds
  }

  /**
   * Enable graceful degradation
   */
  private async enableGracefulDegradation(sessionId: string): Promise<void> {
    // Switch to simpler responses or menu-based interaction
    await uiSynchronizationService.emitUIUpdate(sessionId, {
      panel: 'main',
      view: 'simple_menu',
      data: {
        message: '간단한 메뉴로 전환합니다.',
        options: [
          { id: 'menu', label: '메뉴 보기' },
          { id: 'cart', label: '장바구니' },
          { id: 'order', label: '주문하기' }
        ]
      },
      timestamp: Date.now()
    });
  }

  /**
   * Get or create chat session with error handling
   */
  private async getOrCreateChatSession(sessionId: string): Promise<ChatSession> {
    try {
      if (!this.sessions.has(sessionId)) {
        const session = this.model.startChat({
          history: [],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        });
        this.sessions.set(sessionId, session);
      }
      
      return this.sessions.get(sessionId)!;
    } catch (error) {
      throw this.createLLMError(
        `Failed to create chat session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'api_error',
        true,
        'high'
      );
    }
  }
}