import { 
  ConversationSession, 
  SessionState, 
  SessionStateType, 
  StateContext, 
  ConversationTurn, 
  TurnContent, 
  UserPreferences, 
  Cart, 
  Order, 
  Intent, 
  UserInput 
} from '../types';

export class ConversationContextManager {
  private sessions: Map<string, ConversationSession> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  /**
   * Get or create a conversation session
   */
  async getOrCreateSession(sessionId: string, userId?: string): Promise<ConversationSession> {
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      // Update last activity
      session.lastActivity = new Date();
      return session;
    }

    const newSession: ConversationSession = {
      sessionId,
      userId,
      currentState: this.createInitialState(),
      conversationHistory: [],
      cart: this.createEmptyCart(sessionId),
      preferences: this.getDefaultPreferences(),
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + this.SESSION_TIMEOUT)
    };

    this.sessions.set(sessionId, newSession);
    return newSession;
  }

  /**
   * Update session state
   */
  async updateSessionState(sessionId: string, newState: SessionStateType, context?: Partial<StateContext>): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    
    // Validate state transition
    if (!this.isValidStateTransition(session.currentState.current, newState)) {
      throw new Error(`Invalid state transition from ${session.currentState.current} to ${newState}`);
    }

    // Update state
    session.currentState = {
      current: newState,
      context: { ...session.currentState.context, ...context },
      allowedTransitions: this.getAllowedTransitions(newState)
    };

    session.lastActivity = new Date();
  }

  /**
   * Add conversation turn to session
   */
  async addConversationTurn(sessionId: string, turn: Omit<ConversationTurn, 'id'>): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    
    const fullTurn: ConversationTurn = {
      id: `${sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...turn
    };

    session.conversationHistory.push(fullTurn);
    session.lastActivity = new Date();

    // Keep only last 50 turns to manage memory
    if (session.conversationHistory.length > 50) {
      session.conversationHistory = session.conversationHistory.slice(-50);
    }
  }

  /**
   * Update cart in session
   */
  async updateCart(sessionId: string, cart: Partial<Cart>): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    session.cart = { ...session.cart, ...cart, updatedAt: new Date() };
    session.lastActivity = new Date();
  }

  /**
   * Set current order in session
   */
  async setCurrentOrder(sessionId: string, order: Order): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    session.currentOrder = order;
    session.lastActivity = new Date();
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<ConversationSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Update session preferences
   */
  async updatePreferences(sessionId: string, preferences: Partial<UserPreferences>): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    session.preferences = { ...session.preferences, ...preferences };
    session.lastActivity = new Date();
  }

  /**
   * Get conversation context for LLM
   */
  async getConversationContext(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return 'New conversation session started.';
    }

    const context = [
      `Session State: ${session.currentState.current}`,
      `Cart Items: ${session.cart.items.length}`,
      `Cart Total: ${session.cart.total} ${session.cart.currency}`,
      `Language: ${session.preferences.language}`,
    ];

    if (session.currentState.context.currentIntent) {
      context.push(`Current Intent: ${session.currentState.context.currentIntent.category}.${session.currentState.context.currentIntent.action}`);
    }

    if (session.currentState.context.missingSlots?.length) {
      context.push(`Missing Slots: ${session.currentState.context.missingSlots.join(', ')}`);
    }

    if (session.currentOrder) {
      context.push(`Current Order: ${session.currentOrder.id} (${session.currentOrder.status.current})`);
    }

    // Add recent conversation history
    const recentTurns = session.conversationHistory.slice(-5);
    if (recentTurns.length > 0) {
      context.push('Recent conversation:');
      recentTurns.forEach(turn => {
        const textContent = turn.content.find(c => c.type === 'text');
        if (textContent) {
          context.push(`${turn.role}: ${textContent.data}`);
        }
      });
    }

    return context.join('\n');
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId);
      console.log(`Cleaned up expired session: ${sessionId}`);
    });
  }

  /**
   * Extract slots from user input based on current intent
   */
  extractSlots(input: UserInput, intent: Intent): Record<string, any> {
    const slots: Record<string, any> = {};
    const text = input.content.toLowerCase();

    // Extract common slots based on intent category
    switch (intent.category) {
      case 'product':
        // Extract quantity
        const quantityMatch = text.match(/(\d+)\s*(개|잔|개입|ea|pieces?)/);
        if (quantityMatch) {
          slots.quantity = parseInt(quantityMatch[1]);
        }

        // Extract product names (simple keyword matching)
        const productKeywords = ['아메리카노', '라떼', '카푸치노', '피자', '버거', '샐러드'];
        for (const keyword of productKeywords) {
          if (text.includes(keyword)) {
            slots.productName = keyword;
            break;
          }
        }
        break;

      case 'order':
        // Extract order type
        if (text.includes('픽업') || text.includes('pickup')) {
          slots.orderType = 'pickup';
        } else if (text.includes('배달') || text.includes('delivery')) {
          slots.orderType = 'delivery';
        }

        // Extract phone number
        const phoneMatch = text.match(/(\d{3}[-\s]?\d{4}[-\s]?\d{4})/);
        if (phoneMatch) {
          slots.phone = phoneMatch[1].replace(/[-\s]/g, '');
        }
        break;

      case 'coupon':
        // Extract coupon code
        const couponMatch = text.match(/([A-Z0-9]{4,})/);
        if (couponMatch) {
          slots.couponCode = couponMatch[1];
        }
        break;
    }

    return slots;
  }

  /**
   * Determine missing slots for current intent
   */
  getMissingSlots(intent: Intent, extractedSlots: Record<string, any>): string[] {
    const requiredSlots: Record<string, string[]> = {
      'product.search': [],
      'product.add': ['productName', 'quantity'],
      'order.create': ['orderType'],
      'order.pickup': ['phone'],
      'order.delivery': ['phone', 'address'],
      'coupon.apply': ['couponCode']
    };

    const intentKey = `${intent.category}.${intent.action}`;
    const required = requiredSlots[intentKey] || [];
    
    return required.filter(slot => !extractedSlots[slot] && !intent.slots[slot]);
  }

  /**
   * Create initial session state
   */
  private createInitialState(): SessionState {
    return {
      current: 'idle',
      context: {
        retryCount: 0
      },
      allowedTransitions: this.getAllowedTransitions('idle')
    };
  }

  /**
   * Create empty cart for new session
   */
  private createEmptyCart(sessionId: string): Cart {
    return {
      sessionId,
      items: [],
      subtotal: 0,
      discounts: [],
      taxes: [],
      total: 0,
      currency: 'KRW',
      updatedAt: new Date()
    };
  }

  /**
   * Get default user preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      language: 'ko-KR',
      currency: 'KRW'
    };
  }

  /**
   * Check if state transition is valid
   */
  private isValidStateTransition(from: SessionStateType, to: SessionStateType): boolean {
    const allowedTransitions = this.getAllowedTransitions(from);
    return allowedTransitions.includes(to);
  }

  /**
   * Get allowed transitions for a given state
   */
  private getAllowedTransitions(state: SessionStateType): SessionStateType[] {
    const transitions: Record<SessionStateType, SessionStateType[]> = {
      idle: ['listening', 'intent_detected', 'error'],
      listening: ['processing_voice', 'idle', 'error'],
      processing_voice: ['intent_detected', 'idle', 'error'],
      intent_detected: ['slot_filling', 'cart_review', 'checkout_info', 'idle', 'error'],
      slot_filling: ['intent_detected', 'cart_review', 'idle', 'error'],
      cart_review: ['checkout_info', 'intent_detected', 'idle', 'error'],
      checkout_info: ['payment_session_created', 'cart_review', 'idle', 'error'],
      payment_session_created: ['payment_pending', 'checkout_info', 'error'],
      payment_pending: ['payment_completed', 'payment_failed', 'error'],
      payment_completed: ['order_confirmed', 'error'],
      payment_failed: ['checkout_info', 'idle', 'error'],
      order_confirmed: ['idle'],
      error: ['idle', 'intent_detected']
    };

    return transitions[state] || ['idle', 'error'];
  }
}

// Singleton instance
export const conversationContextManager = new ConversationContextManager();

// Start cleanup interval
setInterval(() => {
  conversationContextManager.cleanupExpiredSessions();
}, 5 * 60 * 1000); // Clean up every 5 minutes