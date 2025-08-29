import { SessionStateType, StateContext, Intent, ErrorResponse } from '../types';
import { uiSynchronizationService } from './ui-synchronization';

export interface StateTransition {
  from: SessionStateType;
  to: SessionStateType;
  trigger: string;
  condition?: (context: StateContext) => boolean;
  action?: (context: StateContext) => Promise<void>;
}

export interface StateDefinition {
  name: SessionStateType;
  description: string;
  allowedTransitions: SessionStateType[];
  onEnter?: (context: StateContext) => Promise<void>;
  onExit?: (context: StateContext) => Promise<void>;
  timeout?: number; // in milliseconds
}

export class StateMachine {
  private states: Map<SessionStateType, StateDefinition> = new Map();
  private transitions: StateTransition[] = [];

  constructor() {
    this.initializeStates();
    this.initializeTransitions();
  }

  /**
   * Check if a state transition is valid
   */
  isValidTransition(from: SessionStateType, to: SessionStateType): boolean {
    const state = this.states.get(from);
    return state ? state.allowedTransitions.includes(to) : false;
  }

  /**
   * Execute a state transition
   */
  async executeTransition(
    sessionId: string,
    from: SessionStateType, 
    to: SessionStateType, 
    context: StateContext,
    trigger?: string
  ): Promise<{ success: boolean; error?: ErrorResponse }> {
    
    try {
      // Validate transition
      if (!this.isValidTransition(from, to)) {
        throw new Error(`Invalid transition from ${from} to ${to}`);
      }

      // Find matching transition
      const transition = this.transitions.find(t => 
        t.from === from && 
        t.to === to && 
        (!t.trigger || t.trigger === trigger)
      );

      // Check transition condition if exists
      if (transition?.condition && !transition.condition(context)) {
        throw new Error(`Transition condition not met for ${from} -> ${to}`);
      }

      // Execute exit action for current state
      const fromState = this.states.get(from);
      if (fromState?.onExit) {
        await fromState.onExit(context);
      }

      // Execute transition action if exists
      if (transition?.action) {
        await transition.action(context);
      }

      // Execute enter action for new state
      const toState = this.states.get(to);
      if (toState?.onEnter) {
        await toState.onEnter(context);
      }

      // Emit state change event
      await uiSynchronizationService.emitStateChange(
        sessionId,
        from,
        to,
        {
          trigger,
          context: {
            currentIntent: context.currentIntent,
            missingSlots: context.missingSlots,
            retryCount: context.retryCount
          }
        }
      );

      return { success: true };

    } catch (error) {
      console.error('State transition error:', error);
      
      const errorResponse: ErrorResponse = {
        errorCode: 'STATE_TRANSITION_ERROR',
        errorMessage: (error as Error).message,
        errorCategory: 'system',
        severity: 'medium',
        recoveryActions: [
          {
            type: 'restart',
            description: 'Reset conversation state',
            parameters: { resetTo: 'idle' }
          }
        ],
        userMessage: '상태 전환 중 오류가 발생했습니다.',
        timestamp: new Date()
      };

      return { success: false, error: errorResponse };
    }
  }

  /**
   * Get allowed transitions for a state
   */
  getAllowedTransitions(state: SessionStateType): SessionStateType[] {
    const stateDefinition = this.states.get(state);
    return stateDefinition ? stateDefinition.allowedTransitions : [];
  }

  /**
   * Get state definition
   */
  getStateDefinition(state: SessionStateType): StateDefinition | undefined {
    return this.states.get(state);
  }

  /**
   * Get next state based on intent and current state
   */
  getNextStateForIntent(currentState: SessionStateType, intent: Intent): SessionStateType {
    // State transition logic based on intent
    switch (currentState) {
      case 'idle':
      case 'listening':
        return 'intent_detected';

      case 'intent_detected':
        // Check if intent needs slot filling
        if (this.intentNeedsSlotFilling(intent)) {
          return 'slot_filling';
        }
        return this.getStateForCompleteIntent(intent);

      case 'slot_filling':
        // After slot filling, determine next state based on intent
        return this.getStateForCompleteIntent(intent);

      case 'cart_review':
        if (intent.category === 'order' && intent.action === 'create') {
          return 'checkout_info';
        }
        return 'intent_detected';

      case 'checkout_info':
        return 'payment_session_created';

      default:
        return currentState;
    }
  }

  /**
   * Check if intent needs slot filling
   */
  private intentNeedsSlotFilling(intent: Intent): boolean {
    const requiredSlots: Record<string, string[]> = {
      'product.add': ['productName', 'quantity'],
      'coupon.apply': ['couponCode'],
      'order.create': ['orderType'],
      'order.delivery': ['address', 'phone'],
      'order.pickup': ['phone']
    };

    const intentKey = `${intent.category}.${intent.action}`;
    const required = requiredSlots[intentKey] || [];

    return required.some(slot => !intent.slots[slot]);
  }

  /**
   * Get state for complete intent
   */
  private getStateForCompleteIntent(intent: Intent): SessionStateType {
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
          return 'checkout_info';
        }
        return 'intent_detected';

      default:
        return 'intent_detected';
    }
  }

  /**
   * Initialize state definitions
   */
  private initializeStates(): void {
    const stateDefinitions: StateDefinition[] = [
      {
        name: 'idle',
        description: 'Waiting for user input',
        allowedTransitions: ['listening', 'intent_detected', 'error'],
        timeout: 30000 // 30 seconds
      },
      {
        name: 'listening',
        description: 'Actively listening for voice input',
        allowedTransitions: ['processing_voice', 'idle', 'error'],
        timeout: 10000 // 10 seconds
      },
      {
        name: 'processing_voice',
        description: 'Processing voice input',
        allowedTransitions: ['intent_detected', 'idle', 'error'],
        timeout: 5000 // 5 seconds
      },
      {
        name: 'intent_detected',
        description: 'Intent has been classified',
        allowedTransitions: ['slot_filling', 'cart_review', 'checkout_info', 'idle', 'error'],
        onEnter: async (context) => {
          console.log('Intent detected:', context.currentIntent);
        }
      },
      {
        name: 'slot_filling',
        description: 'Collecting missing information',
        allowedTransitions: ['intent_detected', 'cart_review', 'idle', 'error'],
        onEnter: async (context) => {
          console.log('Slot filling started. Missing slots:', context.missingSlots);
        }
      },
      {
        name: 'cart_review',
        description: 'User reviewing cart contents',
        allowedTransitions: ['checkout_info', 'intent_detected', 'idle', 'error'],
        onEnter: async (context) => {
          console.log('Cart review state entered');
        }
      },
      {
        name: 'checkout_info',
        description: 'Collecting checkout information',
        allowedTransitions: ['payment_session_created', 'cart_review', 'idle', 'error'],
        onEnter: async (context) => {
          console.log('Checkout info collection started');
        }
      },
      {
        name: 'payment_session_created',
        description: 'Payment session has been created',
        allowedTransitions: ['payment_pending', 'checkout_info', 'error'],
        onEnter: async (context) => {
          console.log('Payment session created');
        }
      },
      {
        name: 'payment_pending',
        description: 'Payment is being processed',
        allowedTransitions: ['payment_completed', 'payment_failed', 'error'],
        timeout: 30000 // 30 seconds for payment processing
      },
      {
        name: 'payment_completed',
        description: 'Payment has been completed successfully',
        allowedTransitions: ['order_confirmed', 'error'],
        onEnter: async (context) => {
          console.log('Payment completed successfully');
        }
      },
      {
        name: 'payment_failed',
        description: 'Payment has failed',
        allowedTransitions: ['checkout_info', 'idle', 'error'],
        onEnter: async (context) => {
          console.log('Payment failed');
        }
      },
      {
        name: 'order_confirmed',
        description: 'Order has been confirmed',
        allowedTransitions: ['idle'],
        onEnter: async (context) => {
          console.log('Order confirmed');
        }
      },
      {
        name: 'error',
        description: 'Error state',
        allowedTransitions: ['idle', 'intent_detected'],
        onEnter: async (context) => {
          console.log('Error state entered:', context.errorMessage);
        }
      }
    ];

    stateDefinitions.forEach(state => {
      this.states.set(state.name, state);
    });
  }

  /**
   * Initialize state transitions
   */
  private initializeTransitions(): void {
    this.transitions = [
      // From idle
      {
        from: 'idle',
        to: 'listening',
        trigger: 'start_voice_input'
      },
      {
        from: 'idle',
        to: 'intent_detected',
        trigger: 'text_input'
      },

      // From listening
      {
        from: 'listening',
        to: 'processing_voice',
        trigger: 'voice_input_received'
      },
      {
        from: 'listening',
        to: 'idle',
        trigger: 'timeout'
      },

      // From processing_voice
      {
        from: 'processing_voice',
        to: 'intent_detected',
        trigger: 'voice_processed'
      },

      // From intent_detected
      {
        from: 'intent_detected',
        to: 'slot_filling',
        trigger: 'missing_slots',
        condition: (context) => (context.missingSlots?.length || 0) > 0
      },
      {
        from: 'intent_detected',
        to: 'cart_review',
        trigger: 'product_added'
      },
      {
        from: 'intent_detected',
        to: 'checkout_info',
        trigger: 'order_intent'
      },

      // From slot_filling
      {
        from: 'slot_filling',
        to: 'intent_detected',
        trigger: 'slots_filled'
      },
      {
        from: 'slot_filling',
        to: 'cart_review',
        trigger: 'product_slots_filled'
      },

      // From cart_review
      {
        from: 'cart_review',
        to: 'checkout_info',
        trigger: 'cart_confirmed'
      },
      {
        from: 'cart_review',
        to: 'intent_detected',
        trigger: 'cart_modified'
      },

      // From checkout_info
      {
        from: 'checkout_info',
        to: 'payment_session_created',
        trigger: 'checkout_info_complete'
      },

      // From payment_session_created
      {
        from: 'payment_session_created',
        to: 'payment_pending',
        trigger: 'payment_initiated'
      },

      // From payment_pending
      {
        from: 'payment_pending',
        to: 'payment_completed',
        trigger: 'payment_success'
      },
      {
        from: 'payment_pending',
        to: 'payment_failed',
        trigger: 'payment_failure'
      },

      // From payment_completed
      {
        from: 'payment_completed',
        to: 'order_confirmed',
        trigger: 'order_created'
      },

      // From payment_failed
      {
        from: 'payment_failed',
        to: 'checkout_info',
        trigger: 'retry_payment'
      },

      // From order_confirmed
      {
        from: 'order_confirmed',
        to: 'idle',
        trigger: 'conversation_complete'
      },

      // Error transitions (from any state)
      ...Array.from(this.states.keys()).map(state => ({
        from: state,
        to: 'error' as SessionStateType,
        trigger: 'error_occurred'
      })),

      // Recovery from error
      {
        from: 'error',
        to: 'idle',
        trigger: 'error_recovered'
      }
    ];
  }
}

// Singleton instance
export const stateMachine = new StateMachine();