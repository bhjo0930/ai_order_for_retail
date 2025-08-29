import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Session ID generation
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Currency formatting
export function formatCurrency(amount: number, currency: string = 'KRW'): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

// Date formatting
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// Validation utilities
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[0-9-+\s()]+$/;
  return phoneRegex.test(phone) && phone.replace(/[^0-9]/g, '').length >= 10;
}

// Error handling utilities
export function createErrorResponse(
  code: string,
  message: string,
  category: 'voice' | 'llm' | 'business' | 'payment' | 'system' = 'system',
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
) {
  return {
    errorCode: code,
    errorMessage: message,
    errorCategory: category,
    severity,
    recoveryActions: [],
    userMessage: message,
    timestamp: new Date(),
  };
}

// Retry utilities
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Audio utilities
export function validateAudioConfig(config: any): boolean {
  return (
    config.sampleRate === 16000 &&
    config.channels === 1 &&
    config.encoding === 'PCM_16'
  );
}

// Cart utilities
export function calculateCartTotal(items: any[], discounts: any[] = []): number {
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountAmount = discounts.reduce((sum, discount) => sum + discount.appliedAmount, 0);
  return Math.max(0, subtotal - discountAmount);
}

// Session utilities
export function isSessionExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

export function extendSessionExpiry(currentExpiry: Date, extensionHours: number = 2): Date {
  const newExpiry = new Date(currentExpiry);
  newExpiry.setHours(newExpiry.getHours() + extensionHours);
  return newExpiry;
}