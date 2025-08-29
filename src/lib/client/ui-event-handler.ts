import { UIUpdate, ToastMessage, NavigationEvent, LoaderState } from '../types';

// Client-side UI event types
export interface UIEventHandler {
  onUIUpdate: (update: UIUpdate) => void;
  onToast: (toast: ToastMessage) => void;
  onNavigation: (navigation: NavigationEvent) => void;
  onLoader: (loader: LoaderState) => void;
  onStateChange: (data: { previousState: string; newState: string; context?: Record<string, any> }) => void;
}

// WebSocket message types for client
export interface ClientWebSocketMessage {
  type: string;
  sessionId: string;
  data: any;
  timestamp: number;
}

// UI State Manager for client-side state synchronization
export class UIStateManager {
  private handlers: Partial<UIEventHandler> = {};
  private currentState: Record<string, any> = {};
  private websocket: WebSocket | null = null;
  private sessionId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  // Connect to WebSocket server
  public connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${url}?sessionId=${this.sessionId}`;
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
          console.log(`UI WebSocket connected for session: ${this.sessionId}`);
          this.reconnectAttempts = 0;
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.websocket.onclose = (event) => {
          console.log(`UI WebSocket closed for session: ${this.sessionId}`, event.code, event.reason);
          this.handleReconnect();
        };

        this.websocket.onerror = (error) => {
          console.error(`UI WebSocket error for session: ${this.sessionId}`, error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  // Disconnect from WebSocket
  public disconnect(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }

  // Register event handlers
  public setHandlers(handlers: Partial<UIEventHandler>): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  // Register individual handlers
  public onUIUpdate(handler: (update: UIUpdate) => void): void {
    this.handlers.onUIUpdate = handler;
  }

  public onToast(handler: (toast: ToastMessage) => void): void {
    this.handlers.onToast = handler;
  }

  public onNavigation(handler: (navigation: NavigationEvent) => void): void {
    this.handlers.onNavigation = handler;
  }

  public onLoader(handler: (loader: LoaderState) => void): void {
    this.handlers.onLoader = handler;
  }

  public onStateChange(handler: (data: { previousState: string; newState: string; context?: Record<string, any> }) => void): void {
    this.handlers.onStateChange = handler;
  }

  // Get current UI state
  public getState(key?: string): any {
    if (key) {
      return this.currentState[key];
    }
    return { ...this.currentState };
  }

  // Update local state
  public updateState(key: string, value: any): void {
    this.currentState[key] = value;
  }

  // Clear state
  public clearState(): void {
    this.currentState = {};
  }

  // Send message to server (for client-initiated events)
  public sendMessage(type: string, data: any): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message: WebSocket not connected');
      return;
    }

    const message: ClientWebSocketMessage = {
      type,
      sessionId: this.sessionId,
      data,
      timestamp: Date.now(),
    };

    try {
      this.websocket.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
    }
  }

  // Handle incoming WebSocket messages
  private handleMessage(data: string): void {
    try {
      const message: ClientWebSocketMessage = JSON.parse(data);

      switch (message.type) {
        case 'ui_update':
          this.handleUIUpdate(message.data);
          break;

        case 'toast':
          this.handleToast(message.data);
          break;

        case 'navigation':
          this.handleNavigation(message.data);
          break;

        case 'loader':
          this.handleLoader(message.data);
          break;

        case 'state_change':
          this.handleStateChange(message.data);
          break;

        case 'transcription_result':
          // Handle transcription results for voice input UI
          this.handleTranscriptionResult(message.data);
          break;

        case 'error':
          this.handleError(message.data);
          break;

        case 'ping':
          // Handle ping/pong for connection health
          this.handlePing(message.data);
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  // Handle UI update messages
  private handleUIUpdate(update: UIUpdate): void {
    // Update local state
    const stateKey = `${update.panel}_${update.view}`;
    this.updateState(stateKey, update.data);

    // Call handler if registered
    if (this.handlers.onUIUpdate) {
      this.handlers.onUIUpdate(update);
    }
  }

  // Handle toast messages
  private handleToast(toast: ToastMessage): void {
    if (this.handlers.onToast) {
      this.handlers.onToast(toast);
    }
  }

  // Handle navigation events
  private handleNavigation(navigation: NavigationEvent): void {
    if (this.handlers.onNavigation) {
      this.handlers.onNavigation(navigation);
    }
  }

  // Handle loader state changes
  private handleLoader(loader: LoaderState): void {
    this.updateState('loader', loader);

    if (this.handlers.onLoader) {
      this.handlers.onLoader(loader);
    }
  }

  // Handle state change notifications
  private handleStateChange(data: { previousState: string; newState: string; context?: Record<string, any> }): void {
    this.updateState('currentState', data.newState);
    this.updateState('stateContext', data.context);

    if (this.handlers.onStateChange) {
      this.handlers.onStateChange(data);
    }
  }

  // Handle transcription results for voice input UI
  private handleTranscriptionResult(result: any): void {
    const voiceInputData = {
      transcription: result.text,
      confidence: result.confidence,
      isFinal: result.isFinal,
      isProcessing: !result.isFinal,
      isListening: false,
    };

    const update: UIUpdate = {
      panel: 'voice_input',
      view: result.isFinal ? 'idle' : 'transcribing',
      data: voiceInputData,
      timestamp: Date.now(),
    };

    this.handleUIUpdate(update);
  }

  // Handle error messages
  private handleError(error: { error: string; code?: string }): void {
    console.error('WebSocket error:', error);

    // Show error toast
    const toast: ToastMessage = {
      kind: 'error',
      message: error.error,
      duration: 5000,
    };

    this.handleToast(toast);

    // Update voice input state if it's a voice-related error
    if (error.code?.includes('VOICE') || error.code?.includes('AUDIO')) {
      const update: UIUpdate = {
        panel: 'voice_input',
        view: 'error',
        data: {
          error: error.error,
          isListening: false,
          isProcessing: false,
        },
        timestamp: Date.now(),
      };

      this.handleUIUpdate(update);
    }
  }

  // Handle ping messages
  private handlePing(data: any): void {
    // Respond to server ping if needed
    if (data.status === 'connected') {
      console.log('WebSocket connection confirmed');
    }
  }

  // Handle reconnection logic
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.websocket?.readyState === WebSocket.CLOSED) {
        // Attempt to reconnect using the same URL
        const wsUrl = this.websocket?.url;
        if (wsUrl) {
          this.connect(wsUrl.replace(/\?.*$/, '').replace(/^ws/, 'http'));
        }
      }
    }, delay);
  }

  // Check connection status
  public isConnected(): boolean {
    return this.websocket?.readyState === WebSocket.OPEN;
  }

  // Get connection state
  public getConnectionState(): string {
    if (!this.websocket) return 'disconnected';
    
    switch (this.websocket.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'unknown';
    }
  }
}

// Utility functions for common UI operations
export class UIHelpers {
  private stateManager: UIStateManager;

  constructor(stateManager: UIStateManager) {
    this.stateManager = stateManager;
  }

  // Show loading indicator
  public showLoading(message: string = 'Loading...'): void {
    this.stateManager.updateState('loading', { isLoading: true, message });
  }

  // Hide loading indicator
  public hideLoading(): void {
    this.stateManager.updateState('loading', { isLoading: false });
  }

  // Show success message
  public showSuccess(message: string): void {
    const toast: ToastMessage = {
      kind: 'success',
      message,
      duration: 3000,
    };
    // This would typically be handled by the toast handler
    console.log('Success:', message);
  }

  // Show error message
  public showError(message: string): void {
    const toast: ToastMessage = {
      kind: 'error',
      message,
      duration: 5000,
    };
    // This would typically be handled by the toast handler
    console.error('Error:', message);
  }

  // Update panel data
  public updatePanel(panel: string, view: string, data: any): void {
    const stateKey = `${panel}_${view}`;
    this.stateManager.updateState(stateKey, data);
  }

  // Get panel data
  public getPanelData(panel: string, view: string): any {
    const stateKey = `${panel}_${view}`;
    return this.stateManager.getState(stateKey);
  }

  // Check if loading
  public isLoading(): boolean {
    const loadingState = this.stateManager.getState('loading');
    return loadingState?.isLoading || false;
  }

  // Get current application state
  public getCurrentState(): string {
    return this.stateManager.getState('currentState') || 'idle';
  }
}

// Export factory function for creating UI state manager
export function createUIStateManager(sessionId: string): {
  stateManager: UIStateManager;
  helpers: UIHelpers;
} {
  const stateManager = new UIStateManager(sessionId);
  const helpers = new UIHelpers(stateManager);

  return {
    stateManager,
    helpers,
  };
}