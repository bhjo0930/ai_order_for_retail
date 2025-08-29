// Core entity types
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  imageUrl?: string;
  options: ProductOption[];
  inventory: InventoryInfo;
  tags: string[];
  isActive: boolean;
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

export interface InventoryInfo {
  count: number;
  isAvailable: boolean;
  lowStockThreshold: number;
}

// Cart and Order types
export interface Cart {
  sessionId: string;
  items: CartItem[];
  subtotal: number;
  discounts: AppliedDiscount[];
  taxes: TaxCalculation[];
  total: number;
  currency: string;
  updatedAt: Date;
}

export interface CartItem {
  productId: string;
  quantity: number;
  selectedOptions: Record<string, string>;
  unitPrice: number;
  totalPrice: number;
  addedAt: Date;
}

export interface Order {
  id: string;
  sessionId: string;
  customerId?: string;
  items: OrderItem[];
  orderType: 'pickup' | 'delivery';
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerInfo: CustomerInfo;
  deliveryInfo?: DeliveryInfo;
  pickupInfo?: PickupInfo;
  pricing: OrderPricing;
  timestamps: OrderTimestamps;
  specialInstructions?: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  selectedOptions: Record<string, string>;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderStatus {
  current: 'created' | 'confirmed' | 'preparing' | 'ready' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';
  history: StatusChange[];
  estimatedCompletion?: Date;
}

export interface StatusChange {
  status: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface PaymentStatus {
  current: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  sessionId?: string;
  history: PaymentStatusChange[];
}

export interface PaymentStatusChange {
  status: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Customer and delivery types
export interface CustomerInfo {
  name: string;
  phone: string;
  email?: string;
}

export interface DeliveryInfo {
  address: DeliveryAddress;
  fee: number;
  estimatedTime: number;
  instructions?: string;
}

export interface DeliveryAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface PickupInfo {
  locationId: string;
  locationName: string;
  address: string;
  estimatedTime: Date;
  instructions?: string;
}

// Pricing types
export interface OrderPricing {
  subtotal: number;
  discounts: AppliedDiscount[];
  taxes: TaxCalculation[];
  deliveryFee?: number;
  total: number;
  currency: string;
}

export interface AppliedDiscount {
  couponId: string;
  couponCode: string;
  discountType: 'percentage' | 'fixed_amount' | 'free_shipping';
  discountValue: number;
  appliedAmount: number;
}

export interface TaxCalculation {
  type: string;
  rate: number;
  amount: number;
}

export interface OrderTimestamps {
  created: Date;
  confirmed?: Date;
  preparing?: Date;
  ready?: Date;
  completed?: Date;
  cancelled?: Date;
}

// Coupon types
export interface Coupon {
  id: string;
  code: string;
  name: string;
  description: string;
  discountType: 'percentage' | 'fixed_amount' | 'free_shipping';
  discountValue: number;
  minimumOrderAmount?: number;
  maximumDiscountAmount?: number;
  validFrom: Date;
  validUntil: Date;
  usageLimit?: number;
  usageCount: number;
  restrictions: CouponRestriction[];
  isActive: boolean;
}

export interface CouponRestriction {
  type: 'category' | 'product' | 'user' | 'time';
  value: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in';
}

// Session and conversation types
export interface ConversationSession {
  sessionId: string;
  userId?: string;
  currentState: SessionState;
  conversationHistory: ConversationTurn[];
  cart: Cart;
  currentOrder?: Order;
  preferences: UserPreferences;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
}

export interface SessionState {
  current: SessionStateType;
  context: StateContext;
  allowedTransitions: SessionStateType[];
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

export interface StateContext {
  currentIntent?: Intent;
  missingSlots?: string[];
  retryCount: number;
  errorMessage?: string;
  lastUserInput?: UserInput;
  pendingActions?: PendingAction[];
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: TurnContent[];
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface TurnContent {
  type: 'text' | 'audio' | 'function_call' | 'function_response' | 'ui_update';
  data: any;
}

export interface UserPreferences {
  language: string;
  currency: string;
  defaultDeliveryAddress?: DeliveryAddress;
  favoriteProducts?: string[];
}

// Voice and LLM types
export interface UserInput {
  type: 'voice' | 'text';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface Intent {
  category: 'product' | 'coupon' | 'order' | 'general';
  action: string;
  confidence: number;
  slots: Record<string, any>;
}

export interface FunctionCall {
  name: string;
  parameters: Record<string, any>;
  id: string;
}

export interface FunctionResponse {
  id: string;
  result: any;
  error?: string;
}

export interface PendingAction {
  type: string;
  parameters: Record<string, any>;
  retryCount: number;
}

// UI and synchronization types
export interface UIUpdate {
  panel: 'search' | 'product' | 'cart' | 'checkout' | 'order_status';
  view: string;
  data: Record<string, any>;
  timestamp: number;
}

export interface ToastMessage {
  kind: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface NavigationEvent {
  path: string;
  params?: Record<string, any>;
}

export interface LoaderState {
  isLoading: boolean;
  message?: string;
}

// Audio and voice processing types
export interface AudioConfig {
  sampleRate: number; // 16000 Hz required
  channels: number;   // 1 (mono) required
  encoding: 'PCM_16'; // 16-bit PCM required
  languageCode: string; // 'ko-KR' default
  enablePartialResults: boolean;
  enableVoiceActivityDetection: boolean;
}

export interface TranscriptionResult {
  sessionId: string;
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
  alternatives?: string[];
}

// Payment types
export interface PaymentSession {
  sessionId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'created' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
}

export interface PaymentSessionCreationRequest {
  orderId: string;
  amount: number;
  currency: string;
  sessionId: string;
}

export interface PaymentSimulationConfig {
  successRate: number; // 0-1, probability of success
  processingDelay: number; // milliseconds
  timeoutDelay: number; // milliseconds for session timeout
}

export interface PaymentCancellation {
  success: boolean;
  sessionId: string;
  cancelledAt: Date;
  refundAmount?: number;
  message: string;
}

export interface PaymentRetryResult {
  success: boolean;
  newSessionId?: string;
  paymentSession?: PaymentSession;
  message: string;
  errorCode?: string;
}

// Store location types
export interface StoreLocation {
  id: string;
  name: string;
  address: string;
  phone?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  operatingHours: OperatingHours;
  isActive: boolean;
}

export interface OperatingHours {
  [key: string]: {
    open: string;
    close: string;
    isClosed: boolean;
  };
}

// Product Agent specific types
export interface ProductFilters {
  category?: string;
  priceRange?: [number, number];
  availability?: boolean;
  tags?: string[];
  limit?: number;
}

export interface ProductSearchResult {
  query: string;
  products: Product[];
  totalCount: number;
  hasMore: boolean;
  filters?: ProductFilters;
  suggestions: string[];
}

export interface ProductDetails extends Product {
  relatedProducts: Product[];
  nutritionInfo?: NutritionInfo;
  allergenInfo?: AllergenInfo;
  reviews: ProductReviews;
}

export interface NutritionInfo {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface AllergenInfo {
  contains: string[];
  mayContain: string[];
}

export interface ProductReviews {
  averageRating: number;
  totalReviews: number;
  recentReviews: ProductReview[];
}

export interface ProductReview {
  id: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface CartUpdate {
  success: boolean;
  cart: Cart;
  addedItem?: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    selectedOptions: Record<string, string>;
  };
  updatedItem?: {
    productId: string;
    quantity: number;
    totalPrice: number;
  };
  removedItem?: {
    productId: string;
    quantity: number;
  };
  message: string;
}

export interface InventoryUpdate {
  productId: string;
  previousCount: number;
  newCount: number;
  delta: number;
  isAvailable: boolean;
  isLowStock: boolean;
  message: string;
}

export interface ProductRecommendation {
  product: Product;
  reason: 'category_match' | 'cart_complement' | 'popular' | 'user_preference';
  confidence: number;
  explanation: string;
}

export interface RecommendationContext {
  category?: string;
  limit?: number;
  userId?: string;
  currentCart?: CartItem[];
}

export interface ProductOptions {
  [optionId: string]: string; // optionId -> choiceId
}

// Coupon Agent specific types
export interface CouponValidation {
  isValid: boolean;
  couponId?: string;
  couponCode?: string;
  couponName?: string;
  discountType?: 'percentage' | 'fixed_amount' | 'free_shipping';
  discountValue?: number;
  discountAmount?: number;
  minimumOrderAmount?: number;
  maximumDiscountAmount?: number;
  description?: string;
  validUntil?: Date;
  errorMessage?: string;
  errorCode?: string;
}

export interface DiscountApplication {
  success: boolean;
  appliedDiscount?: AppliedDiscount;
  removedDiscount?: AppliedDiscount;
  newCartTotal?: number;
  savedAmount?: number;
  message?: string;
  errorMessage?: string;
  errorCode?: string;
}

export interface AvailableCoupon {
  coupon: Coupon;
  isApplicable: boolean;
  applicabilityReason?: string;
  potentialDiscount: number;
  priority: number;
}

export interface DiscountCalculation {
  couponId: string;
  couponCode: string;
  discountType: 'percentage' | 'fixed_amount' | 'free_shipping';
  baseDiscountAmount: number;
  finalDiscountAmount: number;
  applicableAmount: number;
  savings: number;
  explanation: string;
}

export interface CartContext {
  items: CartItem[];
  subtotal: number;
  appliedCoupons?: AppliedDiscount[];
}

// Order Agent specific types
export interface OrderCreationRequest {
  orderType: 'pickup' | 'delivery';
  customerInfo: CustomerInfo;
  deliveryAddress?: DeliveryAddress;
  pickupLocation?: { id: string };
  specialInstructions?: string;
}

export interface OrderCreated {
  success: boolean;
  order?: Order;
  estimatedCompletion?: Date;
  message?: string;
  errorMessage?: string;
  errorCode?: string;
}

export interface DeliveryQuote {
  address: DeliveryAddress;
  fee: number;
  estimatedDeliveryTime: number;
  breakdown: {
    baseFee: number;
    distanceFee: number;
    peakHourSurcharge: number;
    discount: number;
  };
  freeDeliveryThreshold: number;
  message: string;
}

export interface OrderUpdate {
  success: boolean;
  orderId: string;
  previousStatus?: OrderStatus['current'];
  newStatus?: OrderStatus['current'];
  estimatedCompletion?: Date;
  message?: string;
  notificationRequired?: boolean;
  errorMessage?: string;
  errorCode?: string;
}

export interface PickupLocation {
  id: string;
  name: string;
  address: string;
  phone?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  operatingHours: OperatingHours;
  isCurrentlyOpen: boolean;
  estimatedPickupTime: Date;
  distance?: number;
}

export interface PickupSchedule {
  success: boolean;
  orderId: string;
  pickupLocation?: PickupLocation;
  scheduledTime?: Date;
  confirmationCode?: string;
  message?: string;
  errorMessage?: string;
  errorCode?: string;
}

export interface OrderStatusMetadata {
  [key: string]: any;
}

export interface GeoLocation {
  lat: number;
  lng: number;
}

// Error handling types
export interface ErrorResponse {
  errorCode: string;
  errorMessage: string;
  errorCategory: 'voice' | 'llm' | 'business' | 'payment' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoveryActions: RecoveryAction[];
  userMessage: string;
  timestamp: Date;
}

export interface RecoveryAction {
  type: 'retry' | 'fallback' | 'user_input' | 'restart';
  description: string;
  parameters?: Record<string, any>;
}