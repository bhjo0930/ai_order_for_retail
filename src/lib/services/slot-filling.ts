import { Intent, UserInput, SessionStateType } from '../types';
import { intentClassifier } from './intent-classifier';

export interface SlotFillingResult {
  isComplete: boolean;
  missingSlots: string[];
  clarificationQuestion?: string;
  updatedIntent: Intent;
  nextState: SessionStateType;
}

export class SlotFillingService {
  /**
   * Process slot filling for an intent
   */
  async processSlotFilling(
    currentIntent: Intent, 
    userInput: UserInput, 
    sessionState: SessionStateType
  ): Promise<SlotFillingResult> {
    
    // Extract new slots from user input
    const newSlots = this.extractSlotsFromInput(userInput, currentIntent);
    
    // Merge with existing slots
    const updatedIntent: Intent = {
      ...currentIntent,
      slots: { ...currentIntent.slots, ...newSlots }
    };

    // Check if intent is now complete
    const missingSlots = intentClassifier.getMissingSlots(updatedIntent);
    const isComplete = missingSlots.length === 0;

    let nextState: SessionStateType = sessionState;
    let clarificationQuestion: string | undefined;

    if (isComplete) {
      // Intent is complete, move to next appropriate state
      nextState = this.getNextStateForCompleteIntent(updatedIntent);
    } else {
      // Still missing slots, ask for clarification
      nextState = 'slot_filling';
      clarificationQuestion = this.generateClarificationQuestion(updatedIntent, missingSlots);
    }

    return {
      isComplete,
      missingSlots,
      clarificationQuestion,
      updatedIntent,
      nextState
    };
  }

  /**
   * Generate a clarification question for missing slots
   */
  generateClarificationQuestion(intent: Intent, missingSlots: string[]): string {
    // Prioritize slots based on intent category
    const prioritizedSlots = this.prioritizeSlots(intent.category, missingSlots);
    const primarySlot = prioritizedSlots[0];

    const questions: Record<string, Record<string, string>> = {
      product: {
        productName: this.getProductNameQuestion(intent),
        quantity: '몇 개를 주문하시겠어요?',
        size: '사이즈를 선택해 주세요. (스몰, 미디움, 라지)',
        options: '추가 옵션이 있으시면 말씀해 주세요.'
      },
      coupon: {
        couponCode: '쿠폰 코드를 말씀해 주세요.',
        cartTotal: '현재 주문 금액을 확인 중입니다...'
      },
      order: {
        orderType: '픽업 또는 배달 중 어떤 방식을 원하시나요?',
        customerName: '성함을 알려주세요.',
        phone: '연락처를 알려주세요.',
        address: '배달 주소를 자세히 알려주세요.',
        pickupLocation: '어느 매장에서 픽업하시겠어요?',
        preferredTime: '언제 픽업하시겠어요?'
      }
    };

    const categoryQuestions = questions[intent.category as keyof typeof questions];
    if (categoryQuestions && categoryQuestions[primarySlot]) {
      return categoryQuestions[primarySlot];
    }

    // Fallback generic questions
    return this.getGenericClarificationQuestion(primarySlot);
  }

  /**
   * Extract slots from user input based on current intent context
   */
  private extractSlotsFromInput(input: UserInput, currentIntent: Intent): Record<string, any> {
    const text = input.content.toLowerCase().trim();
    const slots: Record<string, any> = {};

    // Context-aware slot extraction based on what's missing
    const missingSlots = intentClassifier.getMissingSlots(currentIntent);

    for (const slot of missingSlots) {
      const value = this.extractSpecificSlot(slot, text, currentIntent);
      if (value !== null) {
        slots[slot] = value;
      }
    }

    // Also try general extraction
    const generalSlots = this.extractGeneralSlots(text, currentIntent.category);
    Object.assign(slots, generalSlots);

    return slots;
  }

  /**
   * Extract a specific slot value from text
   */
  private extractSpecificSlot(slot: string, text: string, intent: Intent): any {
    switch (slot) {
      case 'productName':
        return this.extractProductName(text);
      
      case 'quantity':
        return this.extractQuantity(text);
      
      case 'size':
        return this.extractSize(text);
      
      case 'customerName':
        return this.extractCustomerName(text);
      
      case 'phone':
        return this.extractPhoneNumber(text);
      
      case 'address':
        return this.extractAddress(text);
      
      case 'orderType':
        return this.extractOrderType(text);
      
      case 'couponCode':
        return this.extractCouponCode(text);
      
      case 'pickupLocation':
        return this.extractPickupLocation(text);
      
      case 'preferredTime':
        return this.extractPreferredTime(text);
      
      default:
        return null;
    }
  }

  /**
   * Extract general slots based on category
   */
  private extractGeneralSlots(text: string, category: string): Record<string, any> {
    const slots: Record<string, any> = {};

    switch (category) {
      case 'product':
        const productName = this.extractProductName(text);
        if (productName) slots.productName = productName;
        
        const quantity = this.extractQuantity(text);
        if (quantity) slots.quantity = quantity;
        
        const size = this.extractSize(text);
        if (size) slots.size = size;
        break;

      case 'order':
        const orderType = this.extractOrderType(text);
        if (orderType) slots.orderType = orderType;
        
        const phone = this.extractPhoneNumber(text);
        if (phone) slots.phone = phone;
        
        const name = this.extractCustomerName(text);
        if (name) slots.customerName = name;
        
        const address = this.extractAddress(text);
        if (address) slots.address = address;
        break;

      case 'coupon':
        const couponCode = this.extractCouponCode(text);
        if (couponCode) slots.couponCode = couponCode;
        break;
    }

    return slots;
  }

  // Specific extraction methods
  private extractProductName(text: string): string | null {
    const products = [
      '아메리카노', '라떼', '카푸치노', '에스프레소', '마키아토', '모카',
      '피자', '버거', '샐러드', '파스타', '샌드위치', '리조또',
      '케이크', '쿠키', '머핀', '도넛', '크로와상'
    ];

    for (const product of products) {
      if (text.includes(product)) {
        return product;
      }
    }

    return null;
  }

  private extractQuantity(text: string): number | null {
    const patterns = [
      /(\d+)\s*(개|잔|개입|ea|pieces?)/,
      /(\d+)\s*개/,
      /(한|하나|one)\s*(개|잔)/,
      /(두|둘|two)\s*(개|잔)/,
      /(세|셋|three)\s*(개|잔)/,
      /(네|넷|four)\s*(개|잔)/,
      /(다섯|five)\s*(개|잔)/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const numStr = match[1];
        if (/\d+/.test(numStr)) {
          return parseInt(numStr);
        } else {
          // Convert Korean numbers
          const koreanNumbers: Record<string, number> = {
            '한': 1, '하나': 1, 'one': 1,
            '두': 2, '둘': 2, 'two': 2,
            '세': 3, '셋': 3, 'three': 3,
            '네': 4, '넷': 4, 'four': 4,
            '다섯': 5, 'five': 5
          };
          return koreanNumbers[numStr] || null;
        }
      }
    }

    return null;
  }

  private extractSize(text: string): string | null {
    if (text.includes('라지') || text.includes('large') || text.includes('큰')) {
      return 'large';
    } else if (text.includes('미디움') || text.includes('medium') || text.includes('보통')) {
      return 'medium';
    } else if (text.includes('스몰') || text.includes('small') || text.includes('작은')) {
      return 'small';
    }
    return null;
  }

  private extractCustomerName(text: string): string | null {
    // Look for Korean names (2-4 characters)
    const namePatterns = [
      /(이름은?|성함은?)\s*([가-힣]{2,4})/,
      /([가-힣]{2,4})\s*(입니다|이에요|예요)/,
      /^([가-힣]{2,4})$/
    ];

    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[2] || match[1];
      }
    }

    return null;
  }

  private extractPhoneNumber(text: string): string | null {
    const phonePatterns = [
      /(\d{3}[-\s]?\d{3,4}[-\s]?\d{4})/,
      /(010[-\s]?\d{3,4}[-\s]?\d{4})/,
      /(\d{11})/
    ];

    for (const pattern of phonePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].replace(/[-\s]/g, '');
      }
    }

    return null;
  }

  private extractAddress(text: string): string | null {
    // Simple address extraction - look for common address patterns
    const addressPatterns = [
      /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주).+/,
      /(.+시\s.+구\s.+)/,
      /(.+동\s.+)/
    ];

    for (const pattern of addressPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    // If it's a longer text that might be an address
    if (text.length > 10 && (text.includes('시') || text.includes('구') || text.includes('동'))) {
      return text;
    }

    return null;
  }

  private extractOrderType(text: string): string | null {
    if (text.includes('픽업') || text.includes('pickup') || text.includes('가져가')) {
      return 'pickup';
    } else if (text.includes('배달') || text.includes('delivery') || text.includes('배송')) {
      return 'delivery';
    }
    return null;
  }

  private extractCouponCode(text: string): string | null {
    // Look for alphanumeric codes (4+ characters)
    const couponPattern = /([A-Z0-9]{4,})/i;
    const match = text.match(couponPattern);
    return match ? match[1].toUpperCase() : null;
  }

  private extractPickupLocation(text: string): string | null {
    // Look for store/location names
    const locationPatterns = [
      /(강남|홍대|명동|신촌|이태원|압구정|청담|잠실|건대|신림|노원|분당|일산|수원|인천)\s*(점|매장|지점)?/,
      /(\w+)\s*(점|매장|지점)/
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] + (match[2] || '점');
      }
    }

    return null;
  }

  private extractPreferredTime(text: string): string | null {
    const timePatterns = [
      /(\d{1,2})\s*(시|:)\s*(\d{1,2})?\s*(분)?/,
      /(오전|오후|am|pm)\s*(\d{1,2})\s*(시|:)\s*(\d{1,2})?\s*(분)?/,
      /(지금|바로|즉시|now)/,
      /(\d+)\s*(분|시간)\s*(후|뒤)/
    ];

    for (const pattern of timePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0]; // Return the full match for now
      }
    }

    return null;
  }

  /**
   * Prioritize slots based on intent category
   */
  private prioritizeSlots(category: string, slots: string[]): string[] {
    const priorities: Record<string, string[]> = {
      product: ['productName', 'quantity', 'size', 'options'],
      coupon: ['couponCode', 'cartTotal'],
      order: ['orderType', 'customerName', 'phone', 'address', 'pickupLocation', 'preferredTime']
    };

    const categoryPriorities = priorities[category] || [];
    
    // Sort slots by priority
    return slots.sort((a, b) => {
      const aIndex = categoryPriorities.indexOf(a);
      const bIndex = categoryPriorities.indexOf(b);
      
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      
      return aIndex - bIndex;
    });
  }

  /**
   * Get next state for complete intent
   */
  private getNextStateForCompleteIntent(intent: Intent): SessionStateType {
    switch (intent.category) {
      case 'product':
        if (intent.action === 'add') {
          return 'cart_review';
        }
        return 'intent_detected';
      
      case 'coupon':
        return 'cart_review';
      
      case 'order':
        if (intent.action === 'create') {
          return 'checkout_info';
        }
        return 'intent_detected';
      
      default:
        return 'intent_detected';
    }
  }

  /**
   * Get product name question based on context
   */
  private getProductNameQuestion(intent: Intent): string {
    if (intent.slots.query && intent.slots.query.includes('커피')) {
      return '어떤 커피를 주문하시겠어요? (아메리카노, 라떼, 카푸치노 등)';
    } else if (intent.slots.query && intent.slots.query.includes('음식')) {
      return '어떤 음식을 주문하시겠어요? (피자, 버거, 샐러드 등)';
    }
    return '어떤 상품을 주문하시겠어요?';
  }

  /**
   * Get generic clarification question
   */
  private getGenericClarificationQuestion(slot: string): string {
    const genericQuestions: Record<string, string> = {
      productName: '상품명을 말씀해 주세요.',
      quantity: '수량을 말씀해 주세요.',
      customerName: '성함을 알려주세요.',
      phone: '연락처를 알려주세요.',
      address: '주소를 알려주세요.',
      orderType: '픽업 또는 배달을 선택해 주세요.',
      couponCode: '쿠폰 코드를 말씀해 주세요.'
    };

    return genericQuestions[slot] || '추가 정보를 알려주세요.';
  }
}

// Singleton instance
export const slotFillingService = new SlotFillingService();