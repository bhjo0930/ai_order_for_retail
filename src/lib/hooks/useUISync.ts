import { useState, useEffect, useCallback, useRef } from 'react';
import { UIUpdate, ToastMessage, NavigationEvent, LoaderState } from '../types';
import { UIStateManager, createUIStateManager } from '../client/ui-event-handler';

// Hook for UI synchronization
export function useUISync(sessionId: string, websocketUrl?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const [uiState, setUIState] = useState<Record<string, any>>({});
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [loader, setLoader] = useState<LoaderState>({ isLoading: false });
  const [currentAppState, setCurrentAppState] = useState<string>('idle');

  const stateManagerRef = useRef<UIStateManager | null>(null);

  // Initialize state manager
  useEffect(() => {
    if (!sessionId) return;

    const { stateManager } = createUIStateManager(sessionId);
    stateManagerRef.current = stateManager;

    // Set up event handlers
    stateManager.setHandlers({
      onUIUpdate: (update: UIUpdate) => {
        const stateKey = `${update.panel}_${update.view}`;
        setUIState(prev => ({
          ...prev,
          [stateKey]: update.data,
        }));
      },

      onToast: (toast: ToastMessage) => {
        setToasts(prev => [...prev, { ...toast, id: Date.now() } as any]);
        
        // Auto-remove toast after duration
        if (toast.duration) {
          setTimeout(() => {
            setToasts(prev => prev.filter((t: any) => t.id !== (toast as any).id));
          }, toast.duration);
        }
      },

      onNavigation: (navigation: NavigationEvent) => {
        // Handle navigation - this would typically integrate with Next.js router
        console.log('Navigation event:', navigation);
        if (typeof window !== 'undefined' && window.history) {
          window.history.pushState({}, '', navigation.path);
        }
      },

      onLoader: (loaderState: LoaderState) => {
        setLoader(loaderState);
      },

      onStateChange: (data) => {
        setCurrentAppState(data.newState);
      },
    });

    // Connect to WebSocket if URL provided
    if (websocketUrl) {
      stateManager.connect(websocketUrl)
        .then(() => {
          setIsConnected(true);
          setConnectionState('connected');
        })
        .catch((error) => {
          console.error('Failed to connect to WebSocket:', error);
          setIsConnected(false);
          setConnectionState('error');
        });
    }

    // Monitor connection state
    const checkConnection = setInterval(() => {
      if (stateManager) {
        setConnectionState(stateManager.getConnectionState());
        setIsConnected(stateManager.isConnected());
      }
    }, 1000);

    return () => {
      clearInterval(checkConnection);
      stateManager.disconnect();
    };
  }, [sessionId, websocketUrl]);

  // Get panel data
  const getPanelData = useCallback((panel: string, view: string) => {
    const stateKey = `${panel}_${view}`;
    return uiState[stateKey] || {};
  }, [uiState]);

  // Send message to server
  const sendMessage = useCallback((type: string, data: any) => {
    if (stateManagerRef.current) {
      stateManagerRef.current.sendMessage(type, data);
    }
  }, []);

  // Remove toast
  const removeToast = useCallback((index: number) => {
    setToasts(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Clear all toasts
  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    // Connection state
    isConnected,
    connectionState,
    
    // UI state
    uiState,
    getPanelData,
    currentAppState,
    
    // Toast management
    toasts,
    removeToast,
    clearToasts,
    
    // Loader state
    loader,
    
    // Communication
    sendMessage,
    
    // State manager reference for advanced usage
    stateManager: stateManagerRef.current,
  };
}

// Hook for specific panel data
export function usePanelData(sessionId: string, panel: string, view: string, websocketUrl?: string) {
  const { getPanelData, isConnected } = useUISync(sessionId, websocketUrl);
  const [data, setData] = useState<any>({});

  useEffect(() => {
    const panelData = getPanelData(panel, view);
    setData(panelData);
  }, [getPanelData, panel, view]);

  return {
    data,
    isConnected,
    isLoading: data.isLoading || false,
  };
}

// Hook for toast notifications
export function useToasts(sessionId: string, websocketUrl?: string) {
  const { toasts, removeToast, clearToasts } = useUISync(sessionId, websocketUrl);

  return {
    toasts,
    removeToast,
    clearToasts,
  };
}

// Hook for loader state
export function useLoader(sessionId: string, websocketUrl?: string) {
  const { loader } = useUISync(sessionId, websocketUrl);

  return {
    isLoading: loader.isLoading,
    message: loader.message,
  };
}

// Hook for voice input state
export function useVoiceInputState(sessionId: string, websocketUrl?: string) {
  const { getPanelData } = useUISync(sessionId, websocketUrl);
  const [voiceState, setVoiceState] = useState({
    isListening: false,
    isProcessing: false,
    transcription: '',
    confidence: 0,
    isFinal: false,
    error: null as string | null,
    audioLevel: 0,
  });

  useEffect(() => {
    // Check different voice input views
    const listeningData = getPanelData('voice_input', 'listening');
    const processingData = getPanelData('voice_input', 'processing');
    const transcribingData = getPanelData('voice_input', 'transcribing');
    const errorData = getPanelData('voice_input', 'error');
    const idleData = getPanelData('voice_input', 'idle');

    // Merge data from different views
    const mergedData = {
      ...idleData,
      ...listeningData,
      ...processingData,
      ...transcribingData,
      ...errorData,
    };

    setVoiceState(prev => ({
      ...prev,
      ...mergedData,
    }));
  }, [getPanelData]);

  return voiceState;
}

// Hook for cart state
export function useCartState(sessionId: string, websocketUrl?: string) {
  const { getPanelData } = useUISync(sessionId, websocketUrl);
  const [cartState, setCartState] = useState({
    items: [],
    subtotal: 0,
    discounts: [],
    total: 0,
    itemCount: 0,
    isLoading: false,
    lastAction: null as string | null,
  });

  useEffect(() => {
    const itemsData = getPanelData('cart', 'items');
    const summaryData = getPanelData('cart', 'summary');
    const emptyData = getPanelData('cart', 'empty');

    const mergedData = {
      ...emptyData,
      ...itemsData,
      ...summaryData,
    };

    setCartState(prev => ({
      ...prev,
      ...mergedData,
    }));
  }, [getPanelData]);

  return cartState;
}

// Hook for order status
export function useOrderStatus(sessionId: string, websocketUrl?: string) {
  const { getPanelData } = useUISync(sessionId, websocketUrl);
  const [orderState, setOrderState] = useState({
    order: null as any,
    status: '',
    estimatedCompletion: null as Date | null,
    trackingInfo: null as any,
    receipt: null as any,
    isLoading: false,
  });

  useEffect(() => {
    const trackingData = getPanelData('order_status', 'tracking');
    const detailsData = getPanelData('order_status', 'details');
    const historyData = getPanelData('order_status', 'history');
    const receiptData = getPanelData('order_status', 'receipt');

    const mergedData = {
      ...trackingData,
      ...detailsData,
      ...historyData,
      ...receiptData,
    };

    setOrderState(prev => ({
      ...prev,
      ...mergedData,
    }));
  }, [getPanelData]);

  return orderState;
}

// Hook for search state
export function useSearchState(sessionId: string, websocketUrl?: string) {
  const { getPanelData } = useUISync(sessionId, websocketUrl);
  const [searchState, setSearchState] = useState({
    query: '',
    products: [],
    totalCount: 0,
    hasMore: false,
    filters: {},
    suggestions: [],
    isLoading: false,
  });

  useEffect(() => {
    const resultsData = getPanelData('search', 'results');
    const filtersData = getPanelData('search', 'filters');
    const suggestionsData = getPanelData('search', 'suggestions');
    const emptyData = getPanelData('search', 'empty');

    const mergedData = {
      ...emptyData,
      ...resultsData,
      ...filtersData,
      ...suggestionsData,
    };

    setSearchState(prev => ({
      ...prev,
      ...mergedData,
    }));
  }, [getPanelData]);

  return searchState;
}