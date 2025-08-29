import { WebSocketHandler } from './websocket-handler';
import { UIUpdate, ToastMessage, NavigationEvent, LoaderState } from '../types';

// UI event message types
export interface UIEventMessage {
  type: 'ui_update' | 'toast' | 'navigation' | 'loader' | 'state_change';
  sessionId: string;
  data: any;
  timestamp: number;
}

export interface UIUpdateMessage extends UIEventMessage {
  type: 'ui_update';
  data: UIUpdate;
}

export interface ToastEventMessage extends UIEventMessage {
  type: 'toast';
  data: ToastMessage;
}

export interface NavigationEventMessage extends UIEventMessage {
  type: 'navigation';
  data: NavigationEvent;
}

export interface LoaderEventMessage extends UIEventMessage {
  type: 'loader';
  data: LoaderState;
}

export interface StateChangeEventMessage extends UIEventMessage {
  type: 'state_change';
  data: {
    previousState: string;
    newState: string;
    context?: Record<string, any>;
  };
}

// UI panel types for better type safety
export type UIPanelType = 'search' | 'product' | 'cart' | 'checkout' | 'order_status' | 'voice_input' | 'main';

// UI view types for each panel
export interface UIViewTypes {
  search: 'results' | 'filters' | 'suggestions' | 'empty';
  product: 'details' | 'options' | 'reviews' | 'recommendations';
  cart: 'items' | 'summary' | 'empty' | 'coupons';
  checkout: 'customer_info' | 'delivery_options' | 'payment' | 'confirmation';
  order_status: 'tracking' | 'details' | 'history' | 'receipt';
  voice_input: 'listening' | 'processing' | 'transcribing' | 'idle' | 'error';
  main: 'welcome' | 'menu' | 'settings' | 'help';
}

// Specific UI update data structures
export interface SearchUIData {
  query?: string;
  products?: any[];
  totalCount?: number;
  hasMore?: boolean;
  filters?: any;
  suggestions?: string[];
  isLoading?: boolean;
}

export interface ProductUIData {
  product?: any;
  selectedOptions?: Record<string, string>;
  quantity?: number;
  relatedProducts?: any[];
  reviews?: any;
  isLoading?: boolean;
}

export interface CartUIData {
  items?: any[];
  subtotal?: number;
  discounts?: any[];
  total?: number;
  itemCount?: number;
  isLoading?: boolean;
  lastAction?: 'add' | 'remove' | 'update' | 'clear';
}

export interface CheckoutUIData {
  customerInfo?: any;
  orderType?: 'pickup' | 'delivery';
  deliveryAddress?: any;
  pickupLocation?: any;
  deliveryFee?: number;
  total?: number;
  isLoading?: boolean;
  step?: 'info' | 'options' | 'payment' | 'confirmation';
}

export interface OrderStatusUIData {
  order?: any;
  status?: string;
  estimatedCompletion?: Date;
  trackingInfo?: any;
  receipt?: any;
  isLoading?: boolean;
}

export interface VoiceInputUIData {
  isListening?: boolean;
  isProcessing?: boolean;
  transcription?: string;
  confidence?: number;
  isFinal?: boolean;
  error?: string;
  audioLevel?: number;
}

// UI Synchronization Service
export class UISynchronizationService {
  private webSocketHandler: WebSocketHandler;

  constructor(webSocketHandler: WebSocketHandler) {
    this.webSocketHandler = webSocketHandler;
  }

  // Emit UI update for specific panel and view
  public async emitUIUpdate<T extends UIPanelType>(
    sessionId: string,
    panel: T,
    view: keyof UIViewTypes[T],
    data: Record<string, any>
  ): Promise<void> {
    const update: UIUpdate = {
      panel,
      view: view as string,
      data,
      timestamp: Date.now(),
    };

    const message: UIUpdateMessage = {
      type: 'ui_update',
      sessionId,
      data: update,
      timestamp: Date.now(),
    };

    await this.sendUIEvent(sessionId, message);
  }

  // Emit toast notification
  public async emitToast(
    sessionId: string,
    toast: ToastMessage
  ): Promise<void> {
    const message: ToastEventMessage = {
      type: 'toast',
      sessionId,
      data: toast,
      timestamp: Date.now(),
    };

    await this.sendUIEvent(sessionId, message);
  }

  // Emit navigation event
  public async emitNavigation(
    sessionId: string,
    navigation: NavigationEvent
  ): Promise<void> {
    const message: NavigationEventMessage = {
      type: 'navigation',
      sessionId,
      data: navigation,
      timestamp: Date.now(),
    };

    await this.sendUIEvent(sessionId, message);
  }

  // Emit loader state
  public async emitLoader(
    sessionId: string,
    loader: LoaderState
  ): Promise<void> {
    const message: LoaderEventMessage = {
      type: 'loader',
      sessionId,
      data: loader,
      timestamp: Date.now(),
    };

    await this.sendUIEvent(sessionId, message);
  }

  // Emit state change notification
  public async emitStateChange(
    sessionId: string,
    previousState: string,
    newState: string,
    context?: Record<string, any>
  ): Promise<void> {
    const message: StateChangeEventMessage = {
      type: 'state_change',
      sessionId,
      data: {
        previousState,
        newState,
        context,
      },
      timestamp: Date.now(),
    };

    await this.sendUIEvent(sessionId, message);
  }

  // Convenience methods for common UI updates

  // Search panel updates
  public async updateSearchResults(
    sessionId: string,
    data: SearchUIData
  ): Promise<void> {
    await this.emitUIUpdate(sessionId, 'search', 'results', data);
  }

  public async showSearchLoading(sessionId: string, query: string): Promise<void> {
    await this.emitUIUpdate(sessionId, 'search', 'results', {
      query,
      isLoading: true,
      products: [],
    });
  }

  public async showSearchEmpty(sessionId: string, query: string): Promise<void> {
    await this.emitUIUpdate(sessionId, 'search', 'empty', {
      query,
      message: `No products found for "${query}"`,
    });
  }

  // Product panel updates
  public async updateProductDetails(
    sessionId: string,
    data: ProductUIData
  ): Promise<void> {
    await this.emitUIUpdate(sessionId, 'product', 'details', data);
  }

  public async showProductLoading(sessionId: string): Promise<void> {
    await this.emitUIUpdate(sessionId, 'product', 'details', {
      isLoading: true,
    });
  }

  // Cart panel updates
  public async updateCart(
    sessionId: string,
    data: CartUIData
  ): Promise<void> {
    await this.emitUIUpdate(sessionId, 'cart', 'items', data);
  }

  public async showCartEmpty(sessionId: string): Promise<void> {
    await this.emitUIUpdate(sessionId, 'cart', 'empty', {
      message: 'Your cart is empty',
    });
  }

  public async updateCartSummary(
    sessionId: string,
    data: Pick<CartUIData, 'subtotal' | 'discounts' | 'total' | 'itemCount'>
  ): Promise<void> {
    await this.emitUIUpdate(sessionId, 'cart', 'summary', data);
  }

  // Checkout panel updates
  public async updateCheckout(
    sessionId: string,
    data: CheckoutUIData
  ): Promise<void> {
    const view = data.step || 'info';
    await this.emitUIUpdate(sessionId, 'checkout', view as any, data);
  }

  public async showCheckoutLoading(
    sessionId: string,
    message: string = 'Processing...'
  ): Promise<void> {
    await this.emitLoader(sessionId, {
      isLoading: true,
      message,
    });
  }

  // Order status updates
  public async updateOrderStatus(
    sessionId: string,
    data: OrderStatusUIData
  ): Promise<void> {
    await this.emitUIUpdate(sessionId, 'order_status', 'tracking', data);
  }

  public async showOrderDetails(
    sessionId: string,
    data: OrderStatusUIData
  ): Promise<void> {
    await this.emitUIUpdate(sessionId, 'order_status', 'details', data);
  }

  // Voice input updates
  public async updateVoiceInput(
    sessionId: string,
    data: VoiceInputUIData
  ): Promise<void> {
    let view: keyof UIViewTypes['voice_input'] = 'idle';
    
    if (data.error) {
      view = 'error';
    } else if (data.isProcessing) {
      view = 'processing';
    } else if (data.transcription && !data.isFinal) {
      view = 'transcribing';
    } else if (data.isListening) {
      view = 'listening';
    }

    await this.emitUIUpdate(sessionId, 'voice_input', view, data);
  }

  // Common toast notifications
  public async showSuccessToast(
    sessionId: string,
    message: string,
    duration?: number
  ): Promise<void> {
    await this.emitToast(sessionId, {
      kind: 'success',
      message,
      duration,
    });
  }

  public async showErrorToast(
    sessionId: string,
    message: string,
    duration?: number
  ): Promise<void> {
    await this.emitToast(sessionId, {
      kind: 'error',
      message,
      duration,
    });
  }

  public async showWarningToast(
    sessionId: string,
    message: string,
    duration?: number
  ): Promise<void> {
    await this.emitToast(sessionId, {
      kind: 'warning',
      message,
      duration,
    });
  }

  public async showInfoToast(
    sessionId: string,
    message: string,
    duration?: number
  ): Promise<void> {
    await this.emitToast(sessionId, {
      kind: 'info',
      message,
      duration,
    });
  }

  // Navigation helpers
  public async navigateToCart(sessionId: string): Promise<void> {
    await this.emitNavigation(sessionId, {
      path: '/cart',
    });
  }

  public async navigateToCheckout(sessionId: string): Promise<void> {
    await this.emitNavigation(sessionId, {
      path: '/checkout',
    });
  }

  public async navigateToOrderStatus(
    sessionId: string,
    orderId: string
  ): Promise<void> {
    await this.emitNavigation(sessionId, {
      path: '/order',
      params: { orderId },
    });
  }

  // Loading state helpers
  public async showGlobalLoading(
    sessionId: string,
    message: string = 'Loading...'
  ): Promise<void> {
    await this.emitLoader(sessionId, {
      isLoading: true,
      message,
    });
  }

  public async hideGlobalLoading(sessionId: string): Promise<void> {
    await this.emitLoader(sessionId, {
      isLoading: false,
    });
  }

  // Private method to send UI events through WebSocket
  private async sendUIEvent(
    sessionId: string,
    message: UIEventMessage
  ): Promise<void> {
    try {
      // Use the existing WebSocket handler's sendMessage method
      // We need to cast it to the expected WebSocketMessage format
      const wsMessage = {
        type: message.type as any,
        sessionId: message.sessionId,
        data: message.data,
        timestamp: message.timestamp,
      };

      // Send through WebSocket handler
      (this.webSocketHandler as any).sendMessage(sessionId, wsMessage);
    } catch (error) {
      console.error(`Failed to send UI event to session ${sessionId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance - will be initialized when webSocketHandler is available
let uiSynchronizationServiceInstance: UISynchronizationService | null = null;

export const uiSynchronizationService = {
  getInstance(): UISynchronizationService {
    if (!uiSynchronizationServiceInstance) {
      // Lazy load to avoid circular dependency
      const { webSocketHandler } = require('./websocket-handler');
      uiSynchronizationServiceInstance = new UISynchronizationService(webSocketHandler);
    }
    return uiSynchronizationServiceInstance;
  },

  // Proxy methods for convenience
  async emitUIUpdate(sessionId: string, panel: any, view: any, data: any) {
    return this.getInstance().emitUIUpdate(sessionId, panel, view, data);
  },

  async emitToast(sessionId: string, toast: any) {
    return this.getInstance().emitToast(sessionId, toast);
  },

  async emitNavigation(sessionId: string, navigation: any) {
    return this.getInstance().emitNavigation(sessionId, navigation);
  },

  async emitLoader(sessionId: string, loader: any) {
    return this.getInstance().emitLoader(sessionId, loader);
  },

  async emitStateChange(sessionId: string, previousState: string, newState: string, context?: any) {
    return this.getInstance().emitStateChange(sessionId, previousState, newState, context);
  },

  async updateSearchResults(sessionId: string, data: any) {
    return this.getInstance().updateSearchResults(sessionId, data);
  },

  async showSearchLoading(sessionId: string, query: string) {
    return this.getInstance().showSearchLoading(sessionId, query);
  },

  async showSearchEmpty(sessionId: string, query: string) {
    return this.getInstance().showSearchEmpty(sessionId, query);
  },

  async updateCart(sessionId: string, data: any) {
    return this.getInstance().updateCart(sessionId, data);
  },

  async showCartEmpty(sessionId: string) {
    return this.getInstance().showCartEmpty(sessionId);
  },

  async updateVoiceInput(sessionId: string, data: any) {
    return this.getInstance().updateVoiceInput(sessionId, data);
  },

  async showSuccessToast(sessionId: string, message: string, duration?: number) {
    return this.getInstance().showSuccessToast(sessionId, message, duration);
  },

  async showErrorToast(sessionId: string, message: string, duration?: number) {
    return this.getInstance().showErrorToast(sessionId, message, duration);
  },

  async navigateToCart(sessionId: string) {
    return this.getInstance().navigateToCart(sessionId);
  },

  async navigateToOrderStatus(sessionId: string, orderId: string) {
    return this.getInstance().navigateToOrderStatus(sessionId, orderId);
  },

  async showGlobalLoading(sessionId: string, message?: string) {
    return this.getInstance().showGlobalLoading(sessionId, message);
  },

  async hideGlobalLoading(sessionId: string) {
    return this.getInstance().hideGlobalLoading(sessionId);
  }
};