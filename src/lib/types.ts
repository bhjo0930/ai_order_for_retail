// Based on design.md and supabase/schema.sql

// Product Models
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  imageUrl?: string;
  options: ProductOption[];
  inventory: number;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductOption {
  id: string;
  name: string;
  type: 'single' | 'multiple';
  required: boolean;
  choices: OptionChoice[];
}

export interface OptionChoice {
  id: string;
  name: string;
  priceModifier: number;
  isAvailable: boolean;
}

// Cart Models
export interface Cart {
  sessionId: string;
  items: CartItem[];
  subtotal: number;
  discounts: AppliedDiscount[];
  taxes: TaxCalculation[];
  total: number;
  currency: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
  selectedOptions: Record<string, string>;
  unitPrice: number;
  totalPrice: number;
  addedAt: string;
}

export interface AppliedDiscount {
    couponId: string;
    discountAmount: number;
}

export interface TaxCalculation {
    name: string;
    amount: number;
}

// Order Models
export interface Order {
  id: string;
  sessionId?: string;
  customerId?: string;
  items: CartItem[];
  orderType: 'pickup' | 'delivery';
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerInfo: CustomerInfo;
  deliveryInfo?: DeliveryInfo;
  pickupInfo?: PickupInfo;
  pricing: OrderPricing;
  specialInstructions?: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = 'created' | 'confirmed' | 'preparing' | 'ready' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface CustomerInfo {
    name: string;
    phone: string;
    email?: string;
}

export interface DeliveryInfo {
    address: string;
    fee: number;
    estimatedTime: string;
}

export interface PickupInfo {
    locationId: string;
    pickupTime: string;
}

export interface OrderPricing {
    subtotal: number;
    discounts: number;
    deliveryFee: number;
    taxes: number;
    total: number;
}


// Coupon Models
export interface Coupon {
  id: string;
  code: string;
  name: string;
  description: string;
  discountType: 'percentage' | 'fixed_amount' | 'free_shipping';
  discountValue: number;
  minimumOrderAmount?: number;
  maximumDiscountAmount?: number;
  validFrom: string;
  validUntil: string;
  usageLimit?: number;
  usageCount: number;
  restrictions?: any; // Can be more specific later
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Session Models
export interface ConversationSession {
  id: string;
  sessionId: string;
  userId?: string;
  currentState: SessionStateType;
  conversationHistory: ConversationTurn[];
  cart: Cart;
  currentOrderId?: string;
  preferences: UserPreferences;
  createdAt: string;
  lastActivity: string;
  expiresAt?: string;
}

export type SessionStateType =
  | 'idle'
  | 'listening'
  | 'processing_voice'
  | 'intent_detected'
  | 'slot_filling'
  | 'cart_review'
  | 'checkout_info'
  | 'payment_session_created'
  | 'payment_pending'
  | 'payment_completed'
  | 'payment_failed'
  | 'order_confirmed'
  | 'error';


export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: TurnContent[];
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface TurnContent {
  type: 'text' | 'audio' | 'function_call' | 'function_response' | 'ui_update';
  data: any;
}

export interface UserPreferences {
    language: string;
    // other preferences
}
