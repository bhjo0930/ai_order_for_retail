import { 
  Intent, 
  UserInput, 
  ConversationSession, 
  SessionStateType, 
  FunctionCall, 
  FunctionResponse,
  ErrorResponse 
} from '../types';
import { LLMOrchestratorService } from './llm-orchestrator';
import { conversationContextManager } from './conversation-context';
import { intentClassifier } from './intent-classifier';
import { slotFillingService } from './slot-filling';

export interface AgentRoutingResult {
  success: boolean;
  response?: any;
  error?: ErrorResponse;
  nextState?: SessionStateType;
  uiUpdates?: any[];
}

export class AgentRouter {
  private llmOrchestrator: LLMOrchestratorService;

  constructor() {
    this.llmOrchestrator = new LLMOrchestratorService();
  }

  /**
   * Route user input through the appropriate processing pipeline
   */
  async routeUserInput(sessionId: string, input: UserInput): Promise<AgentRoutingResult> {
    try {
      // Get or create session
      const session = await conversationContextManager.getOrCreateSession(sessionId);
      
      // Add user input to conversation history
      await conversationContextManager.addConversationTurn(sessionId, {
        role: 'user',
        content: [{ type: 'text', data: input.content }],
        timestamp: new Date()
      });

      // Update session state to processing
      await conversationContextManager.updateSessionState(sessionId, 'processing_voice');

      // Process based on current state
      let result: AgentRoutingResult;
      
      switch (session.currentState.current) {
        case 'idle':
        case 'listening':
        case 'processing_voice':
          result = await this.processNewInput(sessionId, input, session);
          break;
          
        case 'slot_filling':
          result = await this.processSlotFilling(sessionId, input, session);
          break;
          
        case 'cart_review':
          result = await this.processCartReview(sessionId, input, session);
          break;
          
        case 'checkout_info':
          result = await this.processCheckoutInfo(sessionId, input, session);
          break;
          
        default:
          result = await this.processGeneralInput(sessionId, input, session);
          break;
      }

      // Update session state if specified
      if (result.nextState) {
        await conversationContextManager.updateSessionState(sessionId, result.nextState);
      }

      return result;

    } catch (error) {
      console.error('Error in agent routing:', error);
      return this.createErrorResult(error as Error);
    }
  }

  /**
   * Process new user input (initial intent detection)
   */
  private async processNewInput(
    sessionId: string, 
    input: UserInput, 
    session: ConversationSession
  ): Promise<AgentRoutingResult> {
    
    // Classify intent
    const intent = intentClassifier.classifyIntent(input);
    
    // Update session context with detected intent
    await conversationContextManager.updateSessionState(sessionId, 'intent_detected', {
      currentIntent: intent,
      retryCount: 0
    });

    // Check if intent is complete
    const missingSlots = intentClassifier.getMissingSlots(intent);
    
    if (missingSlots.length > 0) {
      // Need slot filling
      const clarificationQuestion = intentClassifier.getClarificationQuestion(intent, missingSlots);
      
      await conversationContextManager.updateSessionState(sessionId, 'slot_filling', {
        currentIntent: intent,
        missingSlots,
        retryCount: 0
      });

      return {
        success: true,
        response: { message: clarificationQuestion, intent, missingSlots },
        nextState: 'slot_filling',
        uiUpdates: [{
          panel: 'search',
          view: 'chat',
          data: { message: clarificationQuestion, role: 'assistant', intent }
        }]
      };
    }

    // Intent is complete, route to appropriate agent
    return await this.routeToAgent(sessionId, intent, session);
  }

  /**
   * Process slot filling input
   */
  private async processSlotFilling(
    sessionId: string, 
    input: UserInput, 
    session: ConversationSession
  ): Promise<AgentRoutingResult> {
    
    const currentIntent = session.currentState.context.currentIntent;
    if (!currentIntent) {
      throw new Error('No current intent found in slot filling state');
    }

    // Process slot filling
    const slotResult = await slotFillingService.processSlotFilling(
      currentIntent, 
      input, 
      session.currentState.current
    );

    // Update session context
    await conversationContextManager.updateSessionState(sessionId, slotResult.nextState, {
      currentIntent: slotResult.updatedIntent,
      missingSlots: slotResult.missingSlots,
      retryCount: (session.currentState.context.retryCount || 0) + 1
    });

    if (!slotResult.isComplete) {
      // Still need more information
      return {
        success: true,
        response: { 
          message: slotResult.clarificationQuestion, 
          intent: slotResult.updatedIntent, 
          missingSlots: slotResult.missingSlots 
        },
        nextState: 'slot_filling',
        uiUpdates: [{
          panel: 'search',
          view: 'chat',
          data: { 
            message: slotResult.clarificationQuestion, 
            role: 'assistant', 
            intent: slotResult.updatedIntent 
          }
        }]
      };
    }

    // Slot filling complete, route to agent
    return await this.routeToAgent(sessionId, slotResult.updatedIntent, session);
  }

  /**
   * Process cart review input
   */
  private async processCartReview(
    sessionId: string, 
    input: UserInput, 
    session: ConversationSession
  ): Promise<AgentRoutingResult> {
    
    const text = input.content.toLowerCase();
    
    // Check for confirmation or modification requests
    if (text.includes('확인') || text.includes('맞') || text.includes('yes') || text.includes('ok')) {
      // Proceed to checkout
      await conversationContextManager.updateSessionState(sessionId, 'checkout_info');
      
      return {
        success: true,
        response: { message: '주문 방식을 선택해 주세요. 픽업 또는 배달 중 어떤 것을 원하시나요?' },
        nextState: 'checkout_info',
        uiUpdates: [{
          panel: 'checkout',
          view: 'order_type_selection',
          data: { cart: session.cart }
        }]
      };
    } else if (text.includes('수정') || text.includes('변경') || text.includes('modify')) {
      // Allow cart modification
      return await this.processNewInput(sessionId, input, session);
    } else {
      // Unclear response, ask for clarification
      return {
        success: true,
        response: { message: '장바구니 내용이 맞으시면 "확인"이라고 말씀해 주시고, 수정이 필요하시면 "수정"이라고 말씀해 주세요.' },
        nextState: 'cart_review',
        uiUpdates: [{
          panel: 'cart',
          view: 'review',
          data: { cart: session.cart, needsConfirmation: true }
        }]
      };
    }
  }

  /**
   * Process checkout information input
   */
  private async processCheckoutInfo(
    sessionId: string, 
    input: UserInput, 
    session: ConversationSession
  ): Promise<AgentRoutingResult> {
    
    // Create order intent from input
    const orderIntent: Intent = {
      category: 'order',
      action: 'create',
      confidence: 0.9,
      slots: { query: input.content }
    };

    // Extract order-related information
    const slots = await slotFillingService.processSlotFilling(orderIntent, input, 'checkout_info');
    
    if (!slots.isComplete) {
      return {
        success: true,
        response: { message: slots.clarificationQuestion },
        nextState: 'checkout_info',
        uiUpdates: [{
          panel: 'checkout',
          view: 'info_collection',
          data: { intent: slots.updatedIntent, missingSlots: slots.missingSlots }
        }]
      };
    }

    // Route to order agent for order creation
    return await this.routeToAgent(sessionId, slots.updatedIntent, session);
  }

  /**
   * Process general input for other states
   */
  private async processGeneralInput(
    sessionId: string, 
    input: UserInput, 
    session: ConversationSession
  ): Promise<AgentRoutingResult> {
    
    // Use LLM orchestrator for general processing
    await this.llmOrchestrator.processUserInput(sessionId, input);
    
    return {
      success: true,
      response: { message: '요청을 처리하고 있습니다...' },
      uiUpdates: [{
        panel: 'search',
        view: 'chat',
        data: { message: '요청을 처리하고 있습니다...', role: 'assistant' }
      }]
    };
  }

  /**
   * Route to appropriate business logic agent
   */
  private async routeToAgent(
    sessionId: string, 
    intent: Intent, 
    session: ConversationSession
  ): Promise<AgentRoutingResult> {
    
    try {
      // Get conversation context for LLM
      const context = await conversationContextManager.getConversationContext(sessionId);
      
      // Route to LLM orchestrator which will handle function calling
      const response = await this.llmOrchestrator.routeToAgent(sessionId, intent, { 
        context, 
        cart: session.cart,
        preferences: session.preferences 
      });

      // Determine next state based on intent and response
      const nextState = this.determineNextState(intent, response);
      
      // Generate UI updates based on intent category
      const uiUpdates = this.generateUIUpdates(intent, response, session);

      return {
        success: true,
        response,
        nextState,
        uiUpdates
      };

    } catch (error) {
      console.error('Error routing to agent:', error);
      return this.createErrorResult(error as Error);
    }
  }

  /**
   * Determine next state based on intent and response
   */
  private determineNextState(intent: Intent, response: any): SessionStateType {
    switch (intent.category) {
      case 'product':
        if (intent.action === 'add') {
          return 'cart_review';
        }
        return 'intent_detected';
        
      case 'coupon':
        return 'cart_review';
        
      case 'order':
        if (intent.action === 'create') {
          return 'payment_session_created';
        }
        return 'intent_detected';
        
      default:
        return 'idle';
    }
  }

  /**
   * Generate UI updates based on intent and response
   */
  private generateUIUpdates(intent: Intent, response: any, session: ConversationSession): any[] {
    const updates: any[] = [];

    switch (intent.category) {
      case 'product':
        if (intent.action === 'search') {
          updates.push({
            panel: 'search',
            view: 'results',
            data: { products: response.products || [], query: intent.slots.query }
          });
        } else if (intent.action === 'add') {
          updates.push({
            panel: 'cart',
            view: 'updated',
            data: { cart: session.cart, addedItem: response.addedItem }
          });
        }
        break;

      case 'coupon':
        updates.push({
          panel: 'cart',
          view: 'coupon_applied',
          data: { cart: session.cart, coupon: response.coupon }
        });
        break;

      case 'order':
        if (intent.action === 'create') {
          updates.push({
            panel: 'order_status',
            view: 'created',
            data: { order: response.order }
          });
        } else if (intent.action === 'quote') {
          updates.push({
            panel: 'checkout',
            view: 'delivery_quote',
            data: { quote: response.quote }
          });
        }
        break;
    }

    // Always add a chat message
    updates.push({
      panel: 'search',
      view: 'chat',
      data: { 
        message: this.generateResponseMessage(intent, response), 
        role: 'assistant',
        intent 
      }
    });

    return updates;
  }

  /**
   * Generate response message based on intent and response
   */
  private generateResponseMessage(intent: Intent, response: any): string {
    switch (intent.category) {
      case 'product':
        if (intent.action === 'search') {
          const count = response.products?.length || 0;
          return count > 0 
            ? `${count}개의 상품을 찾았습니다.`
            : '검색 결과가 없습니다. 다른 키워드로 검색해 보세요.';
        } else if (intent.action === 'add') {
          return response.success 
            ? '상품이 장바구니에 추가되었습니다.'
            : '상품 추가에 실패했습니다.';
        }
        break;

      case 'coupon':
        return response.success 
          ? '쿠폰이 적용되었습니다.'
          : '쿠폰 적용에 실패했습니다.';

      case 'order':
        if (intent.action === 'create') {
          return response.orderId 
            ? '주문이 생성되었습니다.'
            : '주문 생성에 실패했습니다.';
        }
        break;
    }

    return '요청을 처리했습니다.';
  }

  /**
   * Create error result
   */
  private createErrorResult(error: Error): AgentRoutingResult {
    const errorResponse: ErrorResponse = {
      errorCode: 'AGENT_ROUTING_ERROR',
      errorMessage: error.message,
      errorCategory: 'system',
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

    return {
      success: false,
      error: errorResponse,
      uiUpdates: [{
        panel: 'search',
        view: 'error',
        data: { error: errorResponse }
      }]
    };
  }
}

// Singleton instance
export const agentRouter = new AgentRouter();