'use client';

import React, { useState } from 'react';
import { useCartState } from '../../lib/hooks/useUISync';

interface CartManagementProps {
  sessionId: string;
  websocketUrl?: string;
  onCheckout?: () => void;
  onContinueShopping?: () => void;
}

export function CartManagement({ 
  sessionId, 
  websocketUrl, 
  onCheckout, 
  onContinueShopping 
}: CartManagementProps) {
  const cartState = useCartState(sessionId, websocketUrl);
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCode, setCouponCode] = useState('');

  const handleApplyCoupon = () => {
    // This would send a message to apply the coupon
    console.log('Applying coupon:', couponCode);
    setCouponCode('');
    setShowCouponInput(false);
  };

  const handleRemoveItem = (itemIndex: number) => {
    // This would send a message to remove the item
    console.log('Removing item at index:', itemIndex);
  };

  const handleUpdateQuantity = (itemIndex: number, newQuantity: number) => {
    // This would send a message to update quantity
    console.log('Updating quantity for item', itemIndex, 'to', newQuantity);
  };

  if (cartState.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading cart...</p>
        </div>
      </div>
    );
  }

  if (cartState.items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.1 5M7 13l-1.1 5m0 0h9.2M17 13v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Your cart is empty</h3>
        <p className="text-gray-600 mb-6">Add some delicious items to get started</p>
        <button
          onClick={onContinueShopping}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white">
      {/* Cart header */}
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Shopping Cart ({cartState.itemCount} items)
          </h2>
          <button
            onClick={onContinueShopping}
            className="text-blue-600 text-sm font-medium hover:text-blue-700"
          >
            Continue Shopping
          </button>
        </div>
      </div>

      {/* Cart items */}
      <div className="px-4 py-4 space-y-4">
        {cartState.items.map((item: any, index: number) => (
          <CartItemCard
            key={index}
            item={item}
            index={index}
            onRemove={handleRemoveItem}
            onUpdateQuantity={handleUpdateQuantity}
          />
        ))}
      </div>

      {/* Coupon section */}
      <div className="px-4 py-4 border-t border-gray-200">
        {!showCouponInput ? (
          <button
            onClick={() => setShowCouponInput(true)}
            className="flex items-center text-blue-600 text-sm font-medium hover:text-blue-700"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add coupon code
          </button>
        ) : (
          <div className="flex space-x-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="Enter coupon code"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <button
              onClick={handleApplyCoupon}
              disabled={!couponCode.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => {
                setShowCouponInput(false);
                setCouponCode('');
              }}
              className="text-gray-500 px-2 py-2 hover:text-gray-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Applied coupons */}
        {cartState.discounts && cartState.discounts.length > 0 && (
          <div className="mt-3 space-y-2">
            {cartState.discounts.map((discount: any, index: number) => (
              <div key={index} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                <div className="flex items-center">
                  <svg className="w-4 h-4 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-green-800">{discount.couponCode}</span>
                </div>
                <span className="text-sm font-medium text-green-800">
                  -${discount.appliedAmount?.toFixed(2) || '0.00'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cart summary */}
      <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span className="text-gray-900">${cartState.subtotal?.toFixed(2) || '0.00'}</span>
          </div>
          
          {cartState.discounts && cartState.discounts.map((discount: any, index: number) => (
            <div key={index} className="flex justify-between text-sm">
              <span className="text-green-600">Discount ({discount.couponCode})</span>
              <span className="text-green-600">-${discount.appliedAmount?.toFixed(2) || '0.00'}</span>
            </div>
          ))}
          
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tax</span>
            <span className="text-gray-900">$0.00</span>
          </div>
          
          <div className="flex justify-between text-lg font-semibold border-t border-gray-300 pt-2">
            <span>Total</span>
            <span>${cartState.total?.toFixed(2) || '0.00'}</span>
          </div>
        </div>

        <button
          onClick={onCheckout}
          className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}

// Cart item card component
function CartItemCard({ 
  item, 
  index, 
  onRemove, 
  onUpdateQuantity 
}: {
  item: any;
  index: number;
  onRemove: (index: number) => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(item.quantity || 1);

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity < 1) return;
    setQuantity(newQuantity);
    onUpdateQuantity(index, newQuantity);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-start space-x-4">
        {/* Product image placeholder */}
        <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-base font-medium text-gray-900 truncate">
            {item.productName || 'Product'}
          </h3>
          
          {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              {Object.entries(item.selectedOptions).map(([key, value]) => `${key}: ${value}`).join(', ')}
            </p>
          )}

          <div className="flex items-center justify-between mt-3">
            {/* Quantity controls */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleQuantityChange(quantity - 1)}
                disabled={quantity <= 1}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              
              <span className="text-base font-medium text-gray-900 min-w-[2rem] text-center">
                {quantity}
              </span>
              
              <button
                onClick={() => handleQuantityChange(quantity + 1)}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            </div>

            {/* Price and remove button */}
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="text-base font-semibold text-gray-900">
                  ${item.totalPrice?.toFixed(2) || '0.00'}
                </p>
                <p className="text-sm text-gray-600">
                  ${item.unitPrice?.toFixed(2) || '0.00'} each
                </p>
              </div>
              
              <button
                onClick={() => onRemove(index)}
                className="text-red-600 hover:text-red-700 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick add to cart component for voice ordering
export function QuickAddToCart({ 
  sessionId, 
  product, 
  onAdded 
}: {
  sessionId: string;
  product: any;
  onAdded?: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [isAdding, setIsAdding] = useState(false);

  const handleAddToCart = async () => {
    setIsAdding(true);
    try {
      // This would send a message to add the item to cart
      console.log('Adding to cart:', { product, quantity, selectedOptions });
      onAdded?.();
    } catch (error) {
      console.error('Failed to add to cart:', error);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center space-x-4 mb-4">
        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{product.name}</h3>
          <p className="text-sm text-gray-600">${product.price?.toFixed(2) || '0.00'}</p>
        </div>
      </div>

      {/* Options */}
      {product.options && product.options.length > 0 && (
        <div className="mb-4 space-y-3">
          {product.options.map((option: any) => (
            <div key={option.id}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {option.name} {option.required && <span className="text-red-500">*</span>}
              </label>
              <select
                value={selectedOptions[option.id] || ''}
                onChange={(e) => setSelectedOptions(prev => ({ ...prev, [option.id]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">Select {option.name}</option>
                {option.choices.map((choice: any) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.name} {choice.priceModifier !== 0 && `(+$${choice.priceModifier.toFixed(2)})`}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Quantity */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-700">Quantity</span>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-base font-medium text-gray-900 min-w-[2rem] text-center">
            {quantity}
          </span>
          <button
            onClick={() => setQuantity(quantity + 1)}
            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
        </div>
      </div>

      <button
        onClick={handleAddToCart}
        disabled={isAdding}
        className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
      >
        {isAdding ? 'Adding...' : `Add to Cart - $${((product.price || 0) * quantity).toFixed(2)}`}
      </button>
    </div>
  );
}