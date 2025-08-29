'use client';

import React, { useState, useEffect } from 'react';
import { useOrderStatus } from '../../lib/hooks/useUISync';

interface OrderTrackingProps {
  sessionId: string;
  orderId?: string;
  websocketUrl?: string;
  onNewOrder?: () => void;
}

export function OrderTracking({ 
  sessionId, 
  orderId, 
  websocketUrl, 
  onNewOrder 
}: OrderTrackingProps) {
  const orderState = useOrderStatus(sessionId, websocketUrl);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Mock order data if not available from state
  const mockOrder = {
    id: orderId || 'ORDER-12345',
    status: 'preparing',
    orderType: 'pickup',
    customerInfo: {
      name: 'John Doe',
      phone: '+1 (555) 123-4567',
    },
    items: [
      { name: 'Americano', quantity: 2, price: 4.50 },
      { name: 'Croissant', quantity: 1, price: 3.50 },
    ],
    total: 12.50,
    estimatedCompletion: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
    createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
  };

  const order = orderState.order || mockOrder;

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'created':
        return {
          label: 'Order Received',
          description: 'Your order has been received and is being processed',
          color: 'blue',
          icon: 'receipt',
        };
      case 'confirmed':
        return {
          label: 'Order Confirmed',
          description: 'Your order has been confirmed and payment processed',
          color: 'green',
          icon: 'check',
        };
      case 'preparing':
        return {
          label: 'Preparing',
          description: 'Your order is being prepared',
          color: 'yellow',
          icon: 'cooking',
        };
      case 'ready':
        return {
          label: 'Ready for Pickup',
          description: 'Your order is ready! Please come pick it up',
          color: 'green',
          icon: 'ready',
        };
      case 'in_transit':
        return {
          label: 'Out for Delivery',
          description: 'Your order is on its way to you',
          color: 'blue',
          icon: 'truck',
        };
      case 'delivered':
        return {
          label: 'Delivered',
          description: 'Your order has been delivered',
          color: 'green',
          icon: 'delivered',
        };
      case 'completed':
        return {
          label: 'Completed',
          description: 'Order completed successfully',
          color: 'green',
          icon: 'completed',
        };
      default:
        return {
          label: 'Processing',
          description: 'Your order is being processed',
          color: 'gray',
          icon: 'clock',
        };
    }
  };

  const statusInfo = getStatusInfo(order.status);

  const getTimeRemaining = () => {
    if (!order.estimatedCompletion) return null;
    
    const now = currentTime.getTime();
    const estimated = new Date(order.estimatedCompletion).getTime();
    const diff = estimated - now;
    
    if (diff <= 0) return 'Ready now!';
    
    const minutes = Math.ceil(diff / (1000 * 60));
    return `${minutes} min remaining`;
  };

  const getElapsedTime = () => {
    if (!order.createdAt) return null;
    
    const now = currentTime.getTime();
    const created = new Date(order.createdAt).getTime();
    const diff = now - created;
    
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes} min ago`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Order Tracking</h1>
            <p className="text-sm text-gray-600">Order #{order.id}</p>
          </div>
          <button
            onClick={onNewOrder}
            className="text-blue-600 text-sm font-medium hover:text-blue-700"
          >
            New Order
          </button>
        </div>
      </header>

      <div className="px-4 py-6 space-y-6">
        {/* Current Status */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${
              statusInfo.color === 'green' ? 'bg-green-100' :
              statusInfo.color === 'blue' ? 'bg-blue-100' :
              statusInfo.color === 'yellow' ? 'bg-yellow-100' :
              'bg-gray-100'
            }`}>
              <StatusIcon icon={statusInfo.icon} color={statusInfo.color} />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900">{statusInfo.label}</h2>
              <p className="text-gray-600">{statusInfo.description}</p>
            </div>
          </div>

          {/* Time information */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Ordered</p>
              <p className="font-medium text-gray-900">{getElapsedTime()}</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                {order.orderType === 'pickup' ? 'Ready in' : 'Delivery in'}
              </p>
              <p className="font-medium text-gray-900">{getTimeRemaining()}</p>
            </div>
          </div>
        </div>

        {/* Order Progress */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Progress</h3>
          <OrderProgressTimeline 
            currentStatus={order.status} 
            orderType={order.orderType}
            createdAt={order.createdAt}
          />
        </div>

        {/* Order Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Details</h3>
          
          <div className="space-y-3 mb-4">
            {order.items?.map((item: any, index: number) => (
              <div key={index} className="flex justify-between items-center">
                <div>
                  <span className="font-medium text-gray-900">{item.name}</span>
                  <span className="text-gray-600 ml-2">x{item.quantity}</span>
                </div>
                <span className="font-medium text-gray-900">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 pt-3">
            <div className="flex justify-between items-center font-semibold text-lg">
              <span>Total</span>
              <span>${order.total?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Name</span>
              <span className="font-medium text-gray-900">{order.customerInfo?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Phone</span>
              <span className="font-medium text-gray-900">{order.customerInfo?.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Order Type</span>
              <span className="font-medium text-gray-900 capitalize">{order.orderType}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {order.status === 'ready' && order.orderType === 'pickup' && (
            <button className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors">
              I've Picked Up My Order
            </button>
          )}
          
          <button className="w-full bg-gray-600 text-white py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors">
            Contact Support
          </button>
          
          <button
            onClick={onNewOrder}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Place Another Order
          </button>
        </div>
      </div>
    </div>
  );
}

// Order progress timeline component
function OrderProgressTimeline({ 
  currentStatus, 
  orderType, 
  createdAt 
}: {
  currentStatus: string;
  orderType: string;
  createdAt?: Date;
}) {
  const getSteps = () => {
    const baseSteps = [
      { key: 'created', label: 'Order Received', time: createdAt },
      { key: 'confirmed', label: 'Confirmed', time: null },
      { key: 'preparing', label: 'Preparing', time: null },
    ];

    if (orderType === 'pickup') {
      return [
        ...baseSteps,
        { key: 'ready', label: 'Ready for Pickup', time: null },
        { key: 'completed', label: 'Completed', time: null },
      ];
    } else {
      return [
        ...baseSteps,
        { key: 'ready', label: 'Ready', time: null },
        { key: 'in_transit', label: 'Out for Delivery', time: null },
        { key: 'delivered', label: 'Delivered', time: null },
      ];
    }
  };

  const steps = getSteps();
  const currentIndex = steps.findIndex(step => step.key === currentStatus);

  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const isCompleted = index <= currentIndex;
        const isCurrent = index === currentIndex;
        
        return (
          <div key={step.key} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${
              isCompleted 
                ? isCurrent 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}>
              {isCompleted && !isCurrent ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <span className="text-sm font-medium">{index + 1}</span>
              )}
            </div>
            
            <div className="flex-1">
              <p className={`font-medium ${
                isCompleted ? 'text-gray-900' : 'text-gray-500'
              }`}>
                {step.label}
              </p>
              {step.time && (
                <p className="text-sm text-gray-500">
                  {new Date(step.time).toLocaleTimeString()}
                </p>
              )}
            </div>
            
            {isCurrent && (
              <div className="flex items-center text-blue-600">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse mr-2" />
                <span className="text-sm font-medium">In Progress</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Status icon component
function StatusIcon({ icon, color }: { icon: string; color: string }) {
  const iconColor = color === 'green' ? 'text-green-600' :
                   color === 'blue' ? 'text-blue-600' :
                   color === 'yellow' ? 'text-yellow-600' :
                   'text-gray-600';

  switch (icon) {
    case 'receipt':
      return (
        <svg className={`w-6 h-6 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'check':
      return (
        <svg className={`w-6 h-6 ${iconColor}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      );
    case 'cooking':
      return (
        <svg className={`w-6 h-6 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case 'ready':
      return (
        <svg className={`w-6 h-6 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'truck':
      return (
        <svg className={`w-6 h-6 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      );
    case 'delivered':
      return (
        <svg className={`w-6 h-6 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
        </svg>
      );
    case 'completed':
      return (
        <svg className={`w-6 h-6 ${iconColor}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    default:
      return (
        <svg className={`w-6 h-6 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}