'use client';

import React, { useState, useEffect } from 'react';
import { VoiceOrderingInterface } from './VoiceOrderingInterface';
import { CartManagement } from './CartManagement';
import { CheckoutFlow } from './CheckoutFlow';
import { OrderTracking } from './OrderTracking';
import { useUISync } from '../../lib/hooks/useUISync';

interface MobileAppProps {
  sessionId: string;
  websocketUrl?: string;
}

type AppView = 'voice_ordering' | 'cart' | 'checkout' | 'order_tracking';

export function MobileApp({ sessionId, websocketUrl }: MobileAppProps) {
  const [currentView, setCurrentView] = useState<AppView>('voice_ordering');
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  
  const { isConnected, currentAppState } = useUISync(sessionId, websocketUrl);

  // Auto-navigate based on app state
  useEffect(() => {
    switch (currentAppState) {
      case 'cart_review':
        setCurrentView('cart');
        break;
      case 'checkout_info':
      case 'payment_session_created':
      case 'payment_pending':
        setCurrentView('checkout');
        break;
      case 'order_confirmed':
        setCurrentView('order_tracking');
        break;
      default:
        // Don't auto-navigate away from manual selections
        break;
    }
  }, [currentAppState]);

  const handleOrderComplete = (orderId: string) => {
    setCurrentOrderId(orderId);
    setCurrentView('order_tracking');
  };

  const handleNewOrder = () => {
    setCurrentOrderId(null);
    setCurrentView('voice_ordering');
  };

  const handleViewCart = () => {
    setCurrentView('cart');
  };

  const handleCheckout = () => {
    setCurrentView('checkout');
  };

  const handleBackToVoiceOrdering = () => {
    setCurrentView('voice_ordering');
  };

  const handleBackToCart = () => {
    setCurrentView('cart');
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'voice_ordering':
        return (
          <VoiceOrderingInterface
            sessionId={sessionId}
            websocketUrl={websocketUrl}
            onOrderComplete={handleOrderComplete}
          />
        );
      
      case 'cart':
        return (
          <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={handleBackToVoiceOrdering}
                  className="flex items-center text-gray-600 hover:text-gray-900"
                >
                  <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <h1 className="text-lg font-semibold text-gray-900">Shopping Cart</h1>
                <div className="w-12" />
              </div>
            </header>
            
            <main className="flex-1 overflow-y-auto">
              <CartManagement
                sessionId={sessionId}
                websocketUrl={websocketUrl}
                onCheckout={handleCheckout}
                onContinueShopping={handleBackToVoiceOrdering}
              />
            </main>
          </div>
        );
      
      case 'checkout':
        return (
          <CheckoutFlow
            sessionId={sessionId}
            websocketUrl={websocketUrl}
            onOrderComplete={handleOrderComplete}
            onBack={handleBackToCart}
          />
        );
      
      case 'order_tracking':
        return (
          <OrderTracking
            sessionId={sessionId}
            orderId={currentOrderId || undefined}
            websocketUrl={websocketUrl}
            onNewOrder={handleNewOrder}
          />
        );
      
      default:
        return (
          <VoiceOrderingInterface
            sessionId={sessionId}
            websocketUrl={websocketUrl}
            onOrderComplete={handleOrderComplete}
          />
        );
    }
  };

  return (
    <div className="relative">
      {/* Connection status overlay */}
      {!isConnected && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 text-sm z-50">
          <div className="flex items-center justify-center">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Connection lost - Reconnecting...
          </div>
        </div>
      )}

      {/* Main app content */}
      <div className={`${!isConnected ? 'mt-10' : ''}`}>
        {renderCurrentView()}
      </div>

      {/* Bottom navigation (optional - can be enabled for manual navigation) */}
      {false && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2">
          <div className="flex justify-around">
            <button
              onClick={() => setCurrentView('voice_ordering')}
              className={`flex flex-col items-center py-2 px-3 rounded-lg ${
                currentView === 'voice_ordering' 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              <span className="text-xs">Voice</span>
            </button>

            <button
              onClick={() => setCurrentView('cart')}
              className={`flex flex-col items-center py-2 px-3 rounded-lg ${
                currentView === 'cart' 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.1 5M7 13l-1.1 5m0 0h9.2M17 13v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6" />
              </svg>
              <span className="text-xs">Cart</span>
            </button>

            <button
              onClick={() => setCurrentView('order_tracking')}
              className={`flex flex-col items-center py-2 px-3 rounded-lg ${
                currentView === 'order_tracking' 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="text-xs">Orders</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

// Demo component for testing the mobile app
export function MobileAppDemo() {
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const websocketUrl = process.env.NODE_ENV === 'development' 
    ? 'ws://localhost:3000/api/voice/stream'
    : `wss://${window.location.host}/api/voice/stream`;

  return (
    <div className="max-w-sm mx-auto bg-white shadow-xl rounded-lg overflow-hidden">
      <MobileApp 
        sessionId={sessionId}
        websocketUrl={websocketUrl}
      />
    </div>
  );
}

// Responsive wrapper for different screen sizes
export function ResponsiveMobileApp({ sessionId, websocketUrl }: MobileAppProps) {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile view */}
      <div className="md:hidden">
        <MobileApp sessionId={sessionId} websocketUrl={websocketUrl} />
      </div>

      {/* Desktop view - shows mobile app in a phone-like container */}
      <div className="hidden md:flex items-center justify-center min-h-screen p-8">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border-8 border-gray-800">
          {/* Phone notch simulation */}
          <div className="bg-gray-800 h-6 flex items-center justify-center">
            <div className="w-16 h-1 bg-gray-600 rounded-full"></div>
          </div>
          
          {/* App content */}
          <div className="relative">
            <MobileApp sessionId={sessionId} websocketUrl={websocketUrl} />
          </div>
          
          {/* Phone home indicator */}
          <div className="bg-gray-800 h-6 flex items-center justify-center">
            <div className="w-32 h-1 bg-gray-600 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
}