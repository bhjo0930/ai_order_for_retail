import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UISynchronizationService } from '../ui-synchronization';
import { WebSocketHandler } from '../websocket-handler';
import { UIUpdate, ToastMessage, NavigationEvent, LoaderState } from '../../types';

// Mock WebSocket handler
const mockWebSocketHandler = {
  sendMessage: vi.fn(),
} as any;

describe('UISynchronizationService', () => {
  let uiSyncService: UISynchronizationService;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    uiSyncService = new UISynchronizationService(mockWebSocketHandler);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('emitUIUpdate', () => {
    it('should emit UI update with correct format', async () => {
      const panel = 'search';
      const view = 'results';
      const data = { products: [], query: 'test' };

      await uiSyncService.emitUIUpdate(sessionId, panel, view, data);

      expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          type: 'ui_update',
          sessionId,
          data: expect.objectContaining({
            panel,
            view,
            data,
            timestamp: expect.any(Number),
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle different panel types', async () => {
      const testCases = [
        { panel: 'product', view: 'details', data: { product: { id: '1' } } },
        { panel: 'cart', view: 'items', data: { items: [] } },
        { panel: 'checkout', view: 'info', data: { step: 'customer_info' } },
        { panel: 'order_status', view: 'tracking', data: { status: 'preparing' } },
      ];

      for (const testCase of testCases) {
        await uiSyncService.emitUIUpdate(
          sessionId,
          testCase.panel as any,
          testCase.view as any,
          testCase.data
        );

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'ui_update',
            data: expect.objectContaining({
              panel: testCase.panel,
              view: testCase.view,
              data: testCase.data,
            }),
          })
        );
      }
    });
  });

  describe('emitToast', () => {
    it('should emit toast message with correct format', async () => {
      const toast: ToastMessage = {
        kind: 'success',
        message: 'Operation completed successfully',
        duration: 3000,
      };

      await uiSyncService.emitToast(sessionId, toast);

      expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          type: 'toast',
          sessionId,
          data: toast,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle different toast types', async () => {
      const toastTypes: ToastMessage['kind'][] = ['success', 'error', 'warning', 'info'];

      for (const kind of toastTypes) {
        const toast: ToastMessage = {
          kind,
          message: `Test ${kind} message`,
        };

        await uiSyncService.emitToast(sessionId, toast);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'toast',
            data: expect.objectContaining({ kind }),
          })
        );
      }
    });
  });

  describe('emitNavigation', () => {
    it('should emit navigation event with correct format', async () => {
      const navigation: NavigationEvent = {
        path: '/cart',
        params: { productId: '123' },
      };

      await uiSyncService.emitNavigation(sessionId, navigation);

      expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          type: 'navigation',
          sessionId,
          data: navigation,
          timestamp: expect.any(Number),
        })
      );
    });
  });

  describe('emitLoader', () => {
    it('should emit loader state with correct format', async () => {
      const loader: LoaderState = {
        isLoading: true,
        message: 'Processing your request...',
      };

      await uiSyncService.emitLoader(sessionId, loader);

      expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          type: 'loader',
          sessionId,
          data: loader,
          timestamp: expect.any(Number),
        })
      );
    });
  });

  describe('emitStateChange', () => {
    it('should emit state change event with correct format', async () => {
      const previousState = 'idle';
      const newState = 'intent_detected';
      const context = { currentIntent: { category: 'product', action: 'search' } };

      await uiSyncService.emitStateChange(sessionId, previousState, newState, context);

      expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          type: 'state_change',
          sessionId,
          data: {
            previousState,
            newState,
            context,
          },
          timestamp: expect.any(Number),
        })
      );
    });
  });

  describe('convenience methods', () => {
    describe('search panel updates', () => {
      it('should update search results', async () => {
        const data = {
          query: 'coffee',
          products: [{ id: '1', name: 'Americano' }],
          isLoading: false,
        };

        await uiSyncService.updateSearchResults(sessionId, data);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'ui_update',
            data: expect.objectContaining({
              panel: 'search',
              view: 'results',
              data,
            }),
          })
        );
      });

      it('should show search loading state', async () => {
        const query = 'coffee';

        await uiSyncService.showSearchLoading(sessionId, query);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'ui_update',
            data: expect.objectContaining({
              panel: 'search',
              view: 'results',
              data: {
                query,
                isLoading: true,
                products: [],
              },
            }),
          })
        );
      });

      it('should show search empty state', async () => {
        const query = 'nonexistent';

        await uiSyncService.showSearchEmpty(sessionId, query);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'ui_update',
            data: expect.objectContaining({
              panel: 'search',
              view: 'empty',
              data: {
                query,
                message: `No products found for "${query}"`,
              },
            }),
          })
        );
      });
    });

    describe('cart panel updates', () => {
      it('should update cart', async () => {
        const data = {
          items: [{ productId: '1', quantity: 2 }],
          total: 10.00,
          itemCount: 2,
        };

        await uiSyncService.updateCart(sessionId, data);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'ui_update',
            data: expect.objectContaining({
              panel: 'cart',
              view: 'items',
              data,
            }),
          })
        );
      });

      it('should show cart empty state', async () => {
        await uiSyncService.showCartEmpty(sessionId);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'ui_update',
            data: expect.objectContaining({
              panel: 'cart',
              view: 'empty',
              data: {
                message: 'Your cart is empty',
              },
            }),
          })
        );
      });
    });

    describe('voice input updates', () => {
      it('should update voice input state for listening', async () => {
        const data = {
          isListening: true,
          isProcessing: false,
          transcription: '',
        };

        await uiSyncService.updateVoiceInput(sessionId, data);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'ui_update',
            data: expect.objectContaining({
              panel: 'voice_input',
              view: 'listening',
              data,
            }),
          })
        );
      });

      it('should update voice input state for processing', async () => {
        const data = {
          isListening: false,
          isProcessing: true,
          transcription: 'Hello world',
        };

        await uiSyncService.updateVoiceInput(sessionId, data);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'ui_update',
            data: expect.objectContaining({
              panel: 'voice_input',
              view: 'processing',
              data,
            }),
          })
        );
      });

      it('should update voice input state for error', async () => {
        const data = {
          isListening: false,
          isProcessing: false,
          error: 'Microphone access denied',
        };

        await uiSyncService.updateVoiceInput(sessionId, data);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'ui_update',
            data: expect.objectContaining({
              panel: 'voice_input',
              view: 'error',
              data,
            }),
          })
        );
      });
    });

    describe('toast convenience methods', () => {
      it('should show success toast', async () => {
        const message = 'Success message';
        const duration = 3000;

        await uiSyncService.showSuccessToast(sessionId, message, duration);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'toast',
            data: {
              kind: 'success',
              message,
              duration,
            },
          })
        );
      });

      it('should show error toast', async () => {
        const message = 'Error message';

        await uiSyncService.showErrorToast(sessionId, message);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'toast',
            data: {
              kind: 'error',
              message,
              duration: undefined,
            },
          })
        );
      });
    });

    describe('navigation convenience methods', () => {
      it('should navigate to cart', async () => {
        await uiSyncService.navigateToCart(sessionId);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'navigation',
            data: {
              path: '/cart',
            },
          })
        );
      });

      it('should navigate to order status with order ID', async () => {
        const orderId = 'order-123';

        await uiSyncService.navigateToOrderStatus(sessionId, orderId);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'navigation',
            data: {
              path: '/order',
              params: { orderId },
            },
          })
        );
      });
    });

    describe('loader convenience methods', () => {
      it('should show global loading', async () => {
        const message = 'Loading...';

        await uiSyncService.showGlobalLoading(sessionId, message);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'loader',
            data: {
              isLoading: true,
              message,
            },
          })
        );
      });

      it('should hide global loading', async () => {
        await uiSyncService.hideGlobalLoading(sessionId);

        expect(mockWebSocketHandler.sendMessage).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            type: 'loader',
            data: {
              isLoading: false,
            },
          })
        );
      });
    });
  });

  describe('error handling', () => {
    it('should handle WebSocket send errors gracefully', async () => {
      mockWebSocketHandler.sendMessage.mockImplementation(() => {
        throw new Error('WebSocket connection failed');
      });

      // Should not throw, but log error
      await expect(uiSyncService.emitToast(sessionId, {
        kind: 'info',
        message: 'Test message',
      })).rejects.toThrow('WebSocket connection failed');
    });
  });
});