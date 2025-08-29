'use client';

import React, { useState, useEffect } from 'react';
import { useUISync } from '../../lib/hooks/useUISync';

interface CheckoutFlowProps {
  sessionId: string;
  websocketUrl?: string;
  onOrderComplete?: (orderId: string) => void;
  onBack?: () => void;
}

type CheckoutStep = 'order_type' | 'customer_info' | 'delivery_info' | 'payment' | 'confirmation';

export function CheckoutFlow({ 
  sessionId, 
  websocketUrl, 
  onOrderComplete, 
  onBack 
}: CheckoutFlowProps) {
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('order_type');
  const [orderData, setOrderData] = useState({
    orderType: '' as 'pickup' | 'delivery' | '',
    customerInfo: {
      name: '',
      phone: '',
      email: '',
    },
    deliveryInfo: {
      address: '',
      city: '',
      postalCode: '',
      instructions: '',
    },
    pickupInfo: {
      locationId: '',
      preferredTime: '',
    },
  });

  const { sendMessage, getPanelData } = useUISync(sessionId, websocketUrl);
  const checkoutData = getPanelData('checkout', 'info');

  // Update order data from UI sync
  useEffect(() => {
    if (checkoutData) {
      setOrderData(prev => ({ ...prev, ...checkoutData }));
    }
  }, [checkoutData]);

  const handleNext = () => {
    const steps: CheckoutStep[] = ['order_type', 'customer_info', 'delivery_info', 'payment', 'confirmation'];
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex < steps.length - 1) {
      // Skip delivery_info if pickup is selected
      if (currentStep === 'customer_info' && orderData.orderType === 'pickup') {
        setCurrentStep('payment');
      } else {
        setCurrentStep(steps[currentIndex + 1]);
      }
    }
  };

  const handleBack = () => {
    const steps: CheckoutStep[] = ['order_type', 'customer_info', 'delivery_info', 'payment', 'confirmation'];
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex > 0) {
      // Skip delivery_info if pickup is selected
      if (currentStep === 'payment' && orderData.orderType === 'pickup') {
        setCurrentStep('customer_info');
      } else {
        setCurrentStep(steps[currentIndex - 1]);
      }
    } else {
      onBack?.();
    }
  };

  const handleCompleteOrder = async () => {
    try {
      // Send order creation message
      sendMessage('create_order', {
        orderType: orderData.orderType,
        customerInfo: orderData.customerInfo,
        deliveryInfo: orderData.orderType === 'delivery' ? orderData.deliveryInfo : undefined,
        pickupInfo: orderData.orderType === 'pickup' ? orderData.pickupInfo : undefined,
      });

      // Simulate order completion
      setTimeout(() => {
        onOrderComplete?.('ORDER-' + Date.now());
      }, 2000);
    } catch (error) {
      console.error('Failed to complete order:', error);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'order_type':
        return (
          <OrderTypeStep
            selectedType={orderData.orderType}
            onSelect={(type) => setOrderData(prev => ({ ...prev, orderType: type }))}
          />
        );
      case 'customer_info':
        return (
          <CustomerInfoStep
            customerInfo={orderData.customerInfo}
            onChange={(info) => setOrderData(prev => ({ ...prev, customerInfo: info }))}
          />
        );
      case 'delivery_info':
        return (
          <DeliveryInfoStep
            deliveryInfo={orderData.deliveryInfo}
            onChange={(info) => setOrderData(prev => ({ ...prev, deliveryInfo: info }))}
          />
        );
      case 'payment':
        return (
          <PaymentStep
            orderData={orderData}
            onComplete={handleCompleteOrder}
          />
        );
      case 'confirmation':
        return (
          <ConfirmationStep
            orderData={orderData}
            onComplete={() => onOrderComplete?.('ORDER-' + Date.now())}
          />
        );
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 'order_type':
        return 'Order Type';
      case 'customer_info':
        return 'Customer Information';
      case 'delivery_info':
        return 'Delivery Information';
      case 'payment':
        return 'Payment';
      case 'confirmation':
        return 'Order Confirmation';
      default:
        return 'Checkout';
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'order_type':
        return orderData.orderType !== '';
      case 'customer_info':
        return orderData.customerInfo.name && orderData.customerInfo.phone;
      case 'delivery_info':
        return orderData.deliveryInfo.address && orderData.deliveryInfo.city;
      case 'payment':
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-lg font-semibold text-gray-900">{getStepTitle()}</h1>
          <div className="w-12" /> {/* Spacer */}
        </div>

        {/* Progress indicator */}
        <div className="mt-3">
          <CheckoutProgress currentStep={currentStep} orderType={orderData.orderType} />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {renderStep()}
      </main>

      {/* Footer with navigation */}
      {currentStep !== 'confirmation' && (
        <footer className="bg-white border-t border-gray-200 px-4 py-4">
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {currentStep === 'payment' ? 'Complete Order' : 'Continue'}
          </button>
        </footer>
      )}
    </div>
  );
}

// Progress indicator component
function CheckoutProgress({ 
  currentStep, 
  orderType 
}: { 
  currentStep: CheckoutStep; 
  orderType: string;
}) {
  const steps = [
    { key: 'order_type', label: 'Type' },
    { key: 'customer_info', label: 'Info' },
    ...(orderType === 'delivery' ? [{ key: 'delivery_info', label: 'Delivery' }] : []),
    { key: 'payment', label: 'Payment' },
    { key: 'confirmation', label: 'Done' },
  ];

  const currentIndex = steps.findIndex(step => step.key === currentStep);

  return (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => (
        <React.Fragment key={step.key}>
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
              index <= currentIndex
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}>
              {index + 1}
            </div>
            <span className="text-xs text-gray-600 mt-1">{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 ${
              index < currentIndex ? 'bg-blue-600' : 'bg-gray-200'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// Order type selection step
function OrderTypeStep({ 
  selectedType, 
  onSelect 
}: { 
  selectedType: string; 
  onSelect: (type: 'pickup' | 'delivery') => void;
}) {
  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">How would you like to receive your order?</h2>
        <p className="text-gray-600">Choose between pickup or delivery</p>
      </div>

      <div className="space-y-4">
        <button
          onClick={() => onSelect('pickup')}
          className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
            selectedType === 'pickup'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center">
                <svg className="w-6 h-6 text-blue-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <div>
                  <h3 className="font-medium text-gray-900">Pickup</h3>
                  <p className="text-sm text-gray-600">Ready in 15-20 minutes</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="font-medium text-gray-900">Free</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => onSelect('delivery')}
          className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
            selectedType === 'delivery'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center">
                <svg className="w-6 h-6 text-blue-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <div>
                  <h3 className="font-medium text-gray-900">Delivery</h3>
                  <p className="text-sm text-gray-600">30-45 minutes</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="font-medium text-gray-900">$3.99</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

// Customer information step
function CustomerInfoStep({ 
  customerInfo, 
  onChange 
}: { 
  customerInfo: any; 
  onChange: (info: any) => void;
}) {
  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Customer Information</h2>
        <p className="text-gray-600">We'll use this to contact you about your order</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={customerInfo.name}
            onChange={(e) => onChange({ ...customerInfo, name: e.target.value })}
            placeholder="Enter your full name"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={customerInfo.phone}
            onChange={(e) => onChange({ ...customerInfo, phone: e.target.value })}
            placeholder="Enter your phone number"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email (Optional)
          </label>
          <input
            type="email"
            value={customerInfo.email}
            onChange={(e) => onChange({ ...customerInfo, email: e.target.value })}
            placeholder="Enter your email address"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}

// Delivery information step
function DeliveryInfoStep({ 
  deliveryInfo, 
  onChange 
}: { 
  deliveryInfo: any; 
  onChange: (info: any) => void;
}) {
  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Delivery Address</h2>
        <p className="text-gray-600">Where should we deliver your order?</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Street Address <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={deliveryInfo.address}
            onChange={(e) => onChange({ ...deliveryInfo, address: e.target.value })}
            placeholder="Enter your street address"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              City <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={deliveryInfo.city}
              onChange={(e) => onChange({ ...deliveryInfo, city: e.target.value })}
              placeholder="City"
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Postal Code
            </label>
            <input
              type="text"
              value={deliveryInfo.postalCode}
              onChange={(e) => onChange({ ...deliveryInfo, postalCode: e.target.value })}
              placeholder="Postal Code"
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Delivery Instructions (Optional)
          </label>
          <textarea
            value={deliveryInfo.instructions}
            onChange={(e) => onChange({ ...deliveryInfo, instructions: e.target.value })}
            placeholder="Any special instructions for delivery..."
            rows={3}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Delivery fee estimate */}
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">Estimated Delivery Fee</span>
            <span className="text-sm font-semibold text-blue-900">$3.99</span>
          </div>
          <p className="text-xs text-blue-700 mt-1">Free delivery on orders over $25</p>
        </div>
      </div>
    </div>
  );
}

// Payment step
function PaymentStep({ 
  orderData, 
  onComplete 
}: { 
  orderData: any; 
  onComplete: () => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePayment = async () => {
    setIsProcessing(true);
    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      onComplete();
    } catch (error) {
      console.error('Payment failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Payment</h2>
        <p className="text-gray-600">Complete your order with our mock payment system</p>
      </div>

      {/* Order summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h3 className="font-medium text-gray-900 mb-3">Order Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span>$24.99</span>
          </div>
          {orderData.orderType === 'delivery' && (
            <div className="flex justify-between">
              <span className="text-gray-600">Delivery Fee</span>
              <span>$3.99</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Tax</span>
            <span>$2.30</span>
          </div>
          <div className="flex justify-between font-semibold text-base border-t border-gray-200 pt-2">
            <span>Total</span>
            <span>${orderData.orderType === 'delivery' ? '31.28' : '27.29'}</span>
          </div>
        </div>
      </div>

      {/* Mock payment info */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-yellow-800">Mock Payment System</h4>
            <p className="text-sm text-yellow-700 mt-1">
              This is a demonstration system. No real payment will be processed.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={handlePayment}
        disabled={isProcessing}
        className="w-full bg-green-600 text-white py-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
      >
        {isProcessing ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing Payment...
          </>
        ) : (
          `Complete Order - $${orderData.orderType === 'delivery' ? '31.28' : '27.29'}`
        )}
      </button>
    </div>
  );
}

// Confirmation step
function ConfirmationStep({ 
  orderData, 
  onComplete 
}: { 
  orderData: any; 
  onComplete: () => void;
}) {
  return (
    <div className="px-4 py-6 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Confirmed!</h2>
      <p className="text-gray-600 mb-6">Thank you for your order. We'll get started on it right away.</p>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 text-left">
        <h3 className="font-medium text-gray-900 mb-3">Order Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Order ID</span>
            <span className="font-medium">#ORDER-{Date.now()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Order Type</span>
            <span className="font-medium capitalize">{orderData.orderType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Customer</span>
            <span className="font-medium">{orderData.customerInfo.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Phone</span>
            <span className="font-medium">{orderData.customerInfo.phone}</span>
          </div>
          {orderData.orderType === 'delivery' && (
            <div className="flex justify-between">
              <span className="text-gray-600">Delivery Address</span>
              <span className="font-medium text-right">
                {orderData.deliveryInfo.address}<br />
                {orderData.deliveryInfo.city}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Estimated Time</span>
            <span className="font-medium">
              {orderData.orderType === 'pickup' ? '15-20 minutes' : '30-45 minutes'}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={onComplete}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        Start New Order
      </button>
    </div>
  );
}