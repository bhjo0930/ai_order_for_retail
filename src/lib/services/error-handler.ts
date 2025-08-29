import { ErrorResponse, RecoveryAction, SessionStateType } from '../types';
import { conversationContextManager } from './conversation-context';

export interface ErrorContext {
  sessionId: string;
  currentState: SessionStateType;
  errorSource: 'voice' | 'llm' | 'business' | 'payment' | 'system';
  originalError: Error;
  retryCount: number;
  userInput?: string;
}

export interface RecoveryResult {
  success: boolean;
  newState?: SessionStateType;
  userMessage: string;
  actions: RecoveryAction[];
}

export class ErrorHandler {
  private readonly MAX_RETRY_COUNT = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 5000]; // Progressive delays in ms

  /**
   * Handle errors and provide recovery options
   */
  async handleError(context: ErrorContext): Promise<RecoveryResult> {
    console.error(`Error in session ${context.sessionId}:`, context.originalError);

    // Create error response based on error type and context
    const errorResponse = this.createErrorResponse(context);
    
    // Determine recovery strategy
    const recoveryStrategy = this.determineRecoveryStrategy(context);
    
    // Execute recovery actions
    const recoveryResult = await this.executeRecovery(context, recoveryStrategy);

    // Log error for monitoring
    await this.logError(context, errorResponse);

    return recoveryResult;
  }

  /**
   * Handle voice recognition errors
   */
  async handleVoiceError(sessionId: string, error: Error, retryCount: number = 0): Promise<RecoveryResult> {
    const context: ErrorContext = {
      sessionId,
      currentState: 'error',
      errorSource: 'voice',
      originalError: error,
      retryCount
    };

    // Specific voice error handling
    if (error.message.includes('network') || error.message.includes('connection')) {
      return this.handleNetworkError(context);
    } else if (error.message.includes('permission') || error.message.includes('microphone')) {
      return this.handlePermissionError(context);
    } else if (error.message.includes('audio') || error.message.includes('format')) {
      return this.handleAudioError(context);
    }

    return this.handleError(context);
  }

  /**
   * Handle LLM processing errors
   */
  async handleLLMError(sessionId: string, error: Error, retryCount: number = 0): Promise<RecoveryResult> {
    const context: ErrorContext = {
      sessionId,
      currentState: 'error',
      errorSource: 'llm',
      originalError: error,
      retryCount
    };

    // Specific LLM error handling
    if (error.message.includes('rate limit') || error.message.includes('quota')) {
      return this.handleRateLimitError(context);
    } else if (error.message.includes('context length') || error.message.includes('token limit')) {
      return this.handleContextLengthError(context);
    } else if (error.message.includes('function call') || error.message.includes('parameter')) {
      return this.handleFunctionCallError(context);
    }

    return this.handleError(context);
  }

  /**
   * Handle business logic errors
   */
  async handleBusinessError(sessionId: string, error: Error, operation: string): Promise<RecoveryResult> {
    const context: ErrorContext = {
      sessionId,
      currentState: 'error',
      errorSource: 'business',
      originalError: error,
      retryCount: 0
    };

    // Specific business logic error handling
    if (operation === 'product_search' && error.message.includes('not found')) {
      return this.handleProductNotFoundError(context);
    } else if (operation === 'coupon_validation' && error.message.includes('invalid')) {
      return this.handleInvalidCouponError(context);
    } else if (operation === 'order_creation' && error.message.includes('inventory')) {
      return this.handleInventoryError(context);
    }

    return this.handleError(context);
  }

  /**
   * Handle payment processing errors
   */
  async handlePaymentError(sessionId: string, error: Error, paymentSessionId?: string): Promise<RecoveryResult> {
    const context: ErrorContext = {
      sessionId,
      currentState: 'payment_failed',
      errorSource: 'payment',
      originalError: error,
      retryCount: 0
    };

    return {
      success: true,
      newState: 'payment_failed',
      userMessage: '결제 처리 중 오류가 발생했습니다. 다른 결제 방법을 시도하거나 다시 시도해 주세요.',
      actions: [
        {
          type: 'retry',
          description: '결제 다시 시도',
          parameters: { paymentSessionId }
        },
        {
          type: 'fallback',
          description: '다른 결제 방법 선택',
          parameters: { showPaymentOptions: true }
        }
      ]
    };
  }

  /**
   * Create error response based on context
   */
  private createErrorResponse(context: ErrorContext): ErrorResponse {
    const baseResponse: ErrorResponse = {
      errorCode: this.generateErrorCode(context),
      errorMessage: context.originalError.message,
      errorCategory: context.errorSource,
      severity: this.determineSeverity(context),
      recoveryActions: [],
      userMessage: '',
      timestamp: new Date()
    };

    // Customize based on error source
    switch (context.errorSource) {
      case 'voice':
        baseResponse.userMessage = '음성 인식 중 오류가 발생했습니다. 다시 말씀해 주시거나 텍스트로 입력해 주세요.';
        break;
      case 'llm':
        baseResponse.userMessage = '요청을 처리하는 중 오류가 발생했습니다. 다시 시도해 주세요.';
        break;
      case 'business':
        baseResponse.userMessage = '서비스 처리 중 오류가 발생했습니다. 다른 방법을 시도해 주세요.';
        break;
      case 'payment':
        baseResponse.userMessage = '결제 처리 중 오류가 발생했습니다. 다시 시도해 주세요.';
        break;
      default:
        baseResponse.userMessage = '시스템 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    }

    return baseResponse;
  }

  /**
   * Determine recovery strategy based on error context
   */
  private determineRecoveryStrategy(context: ErrorContext): 'retry' | 'fallback' | 'restart' | 'escalate' {
    // If retry count is high, don't retry
    if (context.retryCount >= this.MAX_RETRY_COUNT) {
      return 'fallback';
    }

    // Determine strategy based on error type
    switch (context.errorSource) {
      case 'voice':
        return context.retryCount < 2 ? 'retry' : 'fallback';
      case 'llm':
        return context.originalError.message.includes('rate limit') ? 'fallback' : 'retry';
      case 'business':
        return 'fallback';
      case 'payment':
        return 'retry';
      default:
        return 'restart';
    }
  }

  /**
   * Execute recovery based on strategy
   */
  private async executeRecovery(context: ErrorContext, strategy: string): Promise<RecoveryResult> {
    switch (strategy) {
      case 'retry':
        return this.executeRetryRecovery(context);
      case 'fallback':
        return this.executeFallbackRecovery(context);
      case 'restart':
        return this.executeRestartRecovery(context);
      case 'escalate':
        return this.executeEscalateRecovery(context);
      default:
        return this.executeRestartRecovery(context);
    }
  }

  /**
   * Execute retry recovery
   */
  private async executeRetryRecovery(context: ErrorContext): Promise<RecoveryResult> {
    const delay = this.RETRY_DELAYS[Math.min(context.retryCount, this.RETRY_DELAYS.length - 1)];
    
    return {
      success: true,
      newState: context.currentState,
      userMessage: `잠시 후 다시 시도합니다... (${context.retryCount + 1}/${this.MAX_RETRY_COUNT})`,
      actions: [
        {
          type: 'retry',
          description: `${delay}ms 후 재시도`,
          parameters: { delay, retryCount: context.retryCount + 1 }
        }
      ]
    };
  }

  /**
   * Execute fallback recovery
   */
  private async executeFallbackRecovery(context: ErrorContext): Promise<RecoveryResult> {
    let fallbackMessage = '';
    let newState: SessionStateType = 'idle';
    const actions: RecoveryAction[] = [];

    switch (context.errorSource) {
      case 'voice':
        fallbackMessage = '음성 인식이 어려워 텍스트 입력으로 전환합니다. 메시지를 입력해 주세요.';
        newState = 'idle';
        actions.push({
          type: 'fallback',
          description: '텍스트 입력 모드로 전환',
          parameters: { inputMode: 'text' }
        });
        break;

      case 'llm':
        fallbackMessage = '자동 처리가 어려워 간단한 메뉴로 안내합니다.';
        newState = 'idle';
        actions.push({
          type: 'fallback',
          description: '메뉴 기반 인터페이스로 전환',
          parameters: { showSimpleMenu: true }
        });
        break;

      case 'business':
        fallbackMessage = '요청하신 작업을 완료할 수 없습니다. 다른 옵션을 선택해 주세요.';
        newState = 'intent_detected';
        actions.push({
          type: 'fallback',
          description: '대안 옵션 제공',
          parameters: { showAlternatives: true }
        });
        break;

      default:
        fallbackMessage = '다른 방법으로 도움을 드리겠습니다.';
        newState = 'idle';
    }

    return {
      success: true,
      newState,
      userMessage: fallbackMessage,
      actions
    };
  }

  /**
   * Execute restart recovery
   */
  private async executeRestartRecovery(context: ErrorContext): Promise<RecoveryResult> {
    // Reset session state
    await conversationContextManager.updateSessionState(context.sessionId, 'idle', {
      retryCount: 0,
      errorMessage: undefined,
      currentIntent: undefined,
      missingSlots: undefined
    });

    return {
      success: true,
      newState: 'idle',
      userMessage: '대화를 처음부터 다시 시작합니다. 무엇을 도와드릴까요?',
      actions: [
        {
          type: 'restart',
          description: '대화 재시작',
          parameters: { resetSession: true }
        }
      ]
    };
  }

  /**
   * Execute escalate recovery
   */
  private async executeEscalateRecovery(context: ErrorContext): Promise<RecoveryResult> {
    return {
      success: false,
      newState: 'error',
      userMessage: '시스템에 문제가 발생했습니다. 고객 지원팀에 문의해 주세요.',
      actions: [
        {
          type: 'user_input',
          description: '고객 지원 연결',
          parameters: { escalateToSupport: true }
        }
      ]
    };
  }

  // Specific error handlers

  private async handleNetworkError(context: ErrorContext): Promise<RecoveryResult> {
    return {
      success: true,
      newState: 'idle',
      userMessage: '네트워크 연결에 문제가 있습니다. 연결을 확인하고 다시 시도해 주세요.',
      actions: [
        {
          type: 'retry',
          description: '네트워크 연결 재시도',
          parameters: { checkConnection: true }
        },
        {
          type: 'fallback',
          description: '오프라인 모드로 전환',
          parameters: { offlineMode: true }
        }
      ]
    };
  }

  private async handlePermissionError(context: ErrorContext): Promise<RecoveryResult> {
    return {
      success: true,
      newState: 'idle',
      userMessage: '마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해 주세요.',
      actions: [
        {
          type: 'user_input',
          description: '마이크 권한 요청',
          parameters: { requestPermission: true }
        },
        {
          type: 'fallback',
          description: '텍스트 입력으로 전환',
          parameters: { inputMode: 'text' }
        }
      ]
    };
  }

  private async handleAudioError(context: ErrorContext): Promise<RecoveryResult> {
    return {
      success: true,
      newState: 'idle',
      userMessage: '오디오 처리 중 오류가 발생했습니다. 마이크를 확인하고 다시 시도해 주세요.',
      actions: [
        {
          type: 'retry',
          description: '오디오 재설정',
          parameters: { resetAudio: true }
        },
        {
          type: 'fallback',
          description: '텍스트 입력으로 전환',
          parameters: { inputMode: 'text' }
        }
      ]
    };
  }

  private async handleRateLimitError(context: ErrorContext): Promise<RecoveryResult> {
    return {
      success: true,
      newState: 'idle',
      userMessage: '요청이 많아 잠시 대기가 필요합니다. 잠시 후 다시 시도해 주세요.',
      actions: [
        {
          type: 'retry',
          description: '잠시 후 재시도',
          parameters: { delay: 10000 }
        }
      ]
    };
  }

  private async handleContextLengthError(context: ErrorContext): Promise<RecoveryResult> {
    // Clear conversation history to reduce context length
    await conversationContextManager.updateSessionState(context.sessionId, 'idle', {
      retryCount: 0
    });

    return {
      success: true,
      newState: 'idle',
      userMessage: '대화 내용이 너무 길어 일부 기록을 정리했습니다. 계속 진행해 주세요.',
      actions: [
        {
          type: 'retry',
          description: '대화 기록 정리 후 재시도',
          parameters: { clearHistory: true }
        }
      ]
    };
  }

  private async handleFunctionCallError(context: ErrorContext): Promise<RecoveryResult> {
    return {
      success: true,
      newState: 'intent_detected',
      userMessage: '요청을 처리하는 중 오류가 발생했습니다. 다시 말씀해 주세요.',
      actions: [
        {
          type: 'retry',
          description: '다른 방식으로 재시도',
          parameters: { simplifyRequest: true }
        }
      ]
    };
  }

  private async handleProductNotFoundError(context: ErrorContext): Promise<RecoveryResult> {
    return {
      success: true,
      newState: 'intent_detected',
      userMessage: '찾으시는 상품이 없습니다. 다른 상품명으로 검색해 보시거나 전체 메뉴를 확인해 주세요.',
      actions: [
        {
          type: 'fallback',
          description: '전체 메뉴 보기',
          parameters: { showFullMenu: true }
        },
        {
          type: 'user_input',
          description: '다른 검색어로 재검색',
          parameters: { suggestAlternatives: true }
        }
      ]
    };
  }

  private async handleInvalidCouponError(context: ErrorContext): Promise<RecoveryResult> {
    return {
      success: true,
      newState: 'cart_review',
      userMessage: '유효하지 않은 쿠폰입니다. 쿠폰 코드를 확인하시거나 사용 가능한 쿠폰을 확인해 주세요.',
      actions: [
        {
          type: 'fallback',
          description: '사용 가능한 쿠폰 보기',
          parameters: { showAvailableCoupons: true }
        },
        {
          type: 'user_input',
          description: '다른 쿠폰 코드 입력',
          parameters: { retryCoupon: true }
        }
      ]
    };
  }

  private async handleInventoryError(context: ErrorContext): Promise<RecoveryResult> {
    return {
      success: true,
      newState: 'cart_review',
      userMessage: '선택하신 상품의 재고가 부족합니다. 수량을 조정하시거나 다른 상품을 선택해 주세요.',
      actions: [
        {
          type: 'fallback',
          description: '수량 조정',
          parameters: { adjustQuantity: true }
        },
        {
          type: 'fallback',
          description: '대체 상품 추천',
          parameters: { suggestAlternatives: true }
        }
      ]
    };
  }

  /**
   * Generate error code based on context
   */
  private generateErrorCode(context: ErrorContext): string {
    const prefix = context.errorSource.toUpperCase();
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}_${timestamp}`;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(context: ErrorContext): 'low' | 'medium' | 'high' | 'critical' {
    if (context.retryCount >= this.MAX_RETRY_COUNT) {
      return 'high';
    }

    switch (context.errorSource) {
      case 'voice':
        return 'low';
      case 'llm':
        return 'medium';
      case 'business':
        return 'medium';
      case 'payment':
        return 'high';
      default:
        return 'critical';
    }
  }

  /**
   * Log error for monitoring and analysis
   */
  private async logError(context: ErrorContext, errorResponse: ErrorResponse): Promise<void> {
    const logEntry = {
      sessionId: context.sessionId,
      errorCode: errorResponse.errorCode,
      errorSource: context.errorSource,
      errorMessage: context.originalError.message,
      severity: errorResponse.severity,
      retryCount: context.retryCount,
      timestamp: new Date(),
      stack: context.originalError.stack
    };

    // In a production system, this would send to a logging service
    console.error('Error logged:', logEntry);
  }
}

// Singleton instance
export const errorHandler = new ErrorHandler();