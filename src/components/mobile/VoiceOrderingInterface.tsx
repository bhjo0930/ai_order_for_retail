'use client';

import React, { useState, useEffect } from 'react';
import { useUISync, useVoiceInputState, useCartState, useSearchState } from '../../lib/hooks/useUISync';
import { VoiceLoadingIndicator } from '../ui/LoadingIndicator';
import { VoiceToast } from '../ui/Toast';
import { VoiceRecorder } from '../VoiceRecorder';

interface VoiceOrderingInterfaceProps {
  sessionId: string;
  websocketUrl?: string;
  onOrderComplete?: (orderId: string) => void;
}

export function VoiceOrderingInterface({ 
  sessionId, 
  websocketUrl,
  onOrderComplete 
}: VoiceOrderingInterfaceProps) {
  const [currentView, setCurrentView] = useState<'welcome' | 'voice' | 'search' | 'cart' | 'checkout' | 'order'>('welcome');
  const [showVoiceToast, setShowVoiceToast] = useState(false);

  // UI synchronization hooks
  const { isConnected, currentAppState, toasts, removeToast } = useUISync(sessionId, websocketUrl);
  const voiceState = useVoiceInputState(sessionId, websocketUrl);
  const cartState = useCartState(sessionId, websocketUrl);
  const searchState = useSearchState(sessionId, websocketUrl);

  // Update current view based on app state
  useEffect(() => {
    switch (currentAppState) {
      case 'idle':
        setCurrentView('welcome');
        break;
      case 'listening':
      case 'processing_voice':
        setCurrentView('voice');
        break;
      case 'intent_detected':
      case 'slot_filling':
        if (searchState.products.length > 0) {
          setCurrentView('search');
        } else {
          setCurrentView('voice');
        }
        break;
      case 'cart_review':
        setCurrentView('cart');
        break;
      case 'checkout_info':
      case 'payment_session_created':
      case 'payment_pending':
        setCurrentView('checkout');
        break;
      case 'order_confirmed':
        setCurrentView('order');
        break;
      default:
        setCurrentView('welcome');
    }
  }, [currentAppState, searchState.products.length]);

  // Show voice transcription toast
  useEffect(() => {
    if (voiceState.transcription && voiceState.isFinal) {
      setShowVoiceToast(true);
      setTimeout(() => setShowVoiceToast(false), 3000);
    }
  }, [voiceState.transcription, voiceState.isFinal]);

  const renderCurrentView = () => {
    switch (currentView) {
      case 'welcome':
        return <WelcomeView sessionId={sessionId} />;
      case 'voice':
        return <VoiceInputView sessionId={sessionId} voiceState={voiceState} />;
      case 'search':
        return <SearchResultsView sessionId={sessionId} searchState={searchState} />;
      case 'cart':
        return <CartView sessionId={sessionId} cartState={cartState} />;
      case 'checkout':
        return <CheckoutView sessionId={sessionId} />;
      case 'order':
        return <OrderStatusView sessionId={sessionId} onOrderComplete={onOrderComplete} />;
      default:
        return <WelcomeView sessionId={sessionId} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Voice Ordering</h1>
          
          {/* Connection status */}
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-500">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        
        {/* Cart indicator */}
        {cartState.itemCount > 0 && (
          <div className="mt-2 flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
            <span className="text-sm text-blue-800">
              {cartState.itemCount} items in cart
            </span>
            <span className="text-sm font-medium text-blue-900">
              ${cartState.total.toFixed(2)}
            </span>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {renderCurrentView()}
      </main>

      {/* Voice transcription toast */}
      {showVoiceToast && voiceState.transcription && (
        <VoiceToast
          transcription={voiceState.transcription}
          confidence={voiceState.confidence}
          isFinal={voiceState.isFinal}
          onClose={() => setShowVoiceToast(false)}
        />
      )}

      {/* Toast notifications */}
      {toasts.map((toast, index) => (
        <div key={index} className="fixed top-4 right-4 z-50">
          <div className={`rounded-lg p-4 shadow-lg max-w-sm ${
            toast.kind === 'success' ? 'bg-green-50 border border-green-200' :
            toast.kind === 'error' ? 'bg-red-50 border border-red-200' :
            toast.kind === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
            'bg-blue-50 border border-blue-200'
          }`}>
            <p className={`text-sm ${
              toast.kind === 'success' ? 'text-green-800' :
              toast.kind === 'error' ? 'text-red-800' :
              toast.kind === 'warning' ? 'text-yellow-800' :
              'text-blue-800'
            }`}>
              {toast.message}
            </p>
            <button
              onClick={() => removeToast(index)}
              className="mt-2 text-xs underline opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Welcome view component
function WelcomeView({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="mb-8">
        <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-4 mx-auto">
          <svg className="w-12 h-12 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Voice Ordering</h2>
        <p className="text-gray-600 mb-6">
          Order your favorite items using your voice or text
        </p>
      </div>

      <div className="w-full max-w-sm">
        <VoiceRecorder sessionId={sessionId} />
      </div>

      <div className="mt-8 text-sm text-gray-500">
        <p>Try saying:</p>
        <ul className="mt-2 space-y-1">
          <li>"아메리카노 두 잔 주문하고 싶어요"</li>
          <li>"피자 한 판 배달 주문할게요"</li>
          <li>"메뉴 보여주세요"</li>
        </ul>
      </div>
    </div>
  );
}

// Voice input view component
function VoiceInputView({ 
  sessionId, 
  voiceState 
}: { 
  sessionId: string; 
  voiceState: any;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <VoiceLoadingIndicator
        isListening={voiceState.isListening}
        isProcessing={voiceState.isProcessing}
        audioLevel={voiceState.audioLevel}
        message={
          voiceState.isListening ? 'Listening...' :
          voiceState.isProcessing ? 'Processing...' :
          voiceState.error ? voiceState.error :
          'Ready to listen'
        }
      />

      {voiceState.transcription && (
        <div className="mt-6 max-w-md">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-600 mb-2">You said:</p>
            <p className="text-lg text-gray-900">"{voiceState.transcription}"</p>
            {voiceState.confidence > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Confidence: {Math.round(voiceState.confidence * 100)}%
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 w-full max-w-sm">
        <VoiceRecorder sessionId={sessionId} />
      </div>
    </div>
  );
}

// Search results view component
function SearchResultsView({ 
  sessionId, 
  searchState 
}: { 
  sessionId: string; 
  searchState: any;
}) {
  if (searchState.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Searching products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Search Results</h2>
          {searchState.query && (
            <p className="text-sm text-gray-600">Results for "{searchState.query}"</p>
          )}
        </div>

        {searchState.products.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-gray-500">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {searchState.products.map((product: any, index: number) => (
              <ProductCard key={product.id || index} product={product} sessionId={sessionId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Product card component
function ProductCard({ product, sessionId }: { product: any; sessionId: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start space-x-4">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-16 h-16 rounded-lg object-cover"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium text-gray-900 truncate">{product.name}</h3>
          <p className="text-sm text-gray-600 mt-1">{product.description}</p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-lg font-semibold text-gray-900">
              ${product.price?.toFixed(2) || '0.00'}
            </span>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Cart view component
function CartView({ sessionId, cartState }: { sessionId: string; cartState: any }) {
  if (cartState.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.1 5M7 13l-1.1 5m0 0h9.2M17 13v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Your cart is empty</h2>
        <p className="text-gray-600 mb-6">Add some items to get started</p>
        <VoiceRecorder sessionId={sessionId} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Cart</h2>
        
        <div className="space-y-4">
          {cartState.items.map((item: any, index: number) => (
            <CartItem key={index} item={item} sessionId={sessionId} />
          ))}
        </div>
      </div>

      {/* Cart summary */}
      <div className="border-t border-gray-200 bg-white px-4 py-4">
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span className="text-gray-900">${cartState.subtotal?.toFixed(2) || '0.00'}</span>
          </div>
          {cartState.discounts?.map((discount: any, index: number) => (
            <div key={index} className="flex justify-between text-sm">
              <span className="text-green-600">-{discount.couponCode}</span>
              <span className="text-green-600">-${discount.appliedAmount?.toFixed(2) || '0.00'}</span>
            </div>
          ))}
          <div className="flex justify-between text-lg font-semibold border-t border-gray-200 pt-2">
            <span>Total</span>
            <span>${cartState.total?.toFixed(2) || '0.00'}</span>
          </div>
        </div>

        <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}

// Cart item component
function CartItem({ item, sessionId }: { item: any; sessionId: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{item.productName || 'Product'}</h3>
          <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
          {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Options: {Object.values(item.selectedOptions).join(', ')}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-semibold text-gray-900">${item.totalPrice?.toFixed(2) || '0.00'}</p>
          <p className="text-sm text-gray-600">${item.unitPrice?.toFixed(2) || '0.00'} each</p>
        </div>
      </div>
    </div>
  );
}

// Checkout view component
function CheckoutView({ sessionId }: { sessionId: string }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Checkout</h2>
      
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="font-medium text-gray-900 mb-4">Order Type</h3>
          <div className="grid grid-cols-2 gap-3">
            <button className="border-2 border-blue-600 bg-blue-50 text-blue-700 rounded-lg p-3 text-center">
              <div className="font-medium">Pickup</div>
              <div className="text-sm">Ready in 15 min</div>
            </button>
            <button className="border-2 border-gray-200 text-gray-700 rounded-lg p-3 text-center hover:border-gray-300">
              <div className="font-medium">Delivery</div>
              <div className="text-sm">30-45 min</div>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="font-medium text-gray-900 mb-4">Customer Information</h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Full Name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="tel"
              placeholder="Phone Number"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="font-medium text-gray-900 mb-4">Payment</h3>
          <p className="text-sm text-gray-600 mb-4">Mock payment system - no real payment required</p>
          <button className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors">
            Complete Order (Mock Payment)
          </button>
        </div>
      </div>
    </div>
  );
}

// Order status view component
function OrderStatusView({ 
  sessionId, 
  onOrderComplete 
}: { 
  sessionId: string; 
  onOrderComplete?: (orderId: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
        
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Order Confirmed!</h2>
        <p className="text-gray-600 mb-6">Your order has been placed successfully</p>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Order ID:</span>
              <span className="font-medium">#12345</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className="text-green-600 font-medium">Confirmed</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Estimated time:</span>
              <span className="font-medium">15-20 minutes</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => onOrderComplete?.('12345')}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Start New Order
        </button>
      </div>
    </div>
  );
}