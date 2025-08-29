import { Intent, UserInput } from '../types';

export class IntentClassifier {
  private productKeywords = {
    ko: ['주문', '찾', '검색', '메뉴', '아메리카노', '라떼', '카푸치노', '에스프레소', '피자', '버거', '샐러드', '음료', '커피', '차', '디저트'],
    en: ['order', 'search', 'find', 'menu', 'americano', 'latte', 'cappuccino', 'espresso', 'pizza', 'burger', 'salad', 'drink', 'coffee', 'tea', 'dessert']
  };

  private couponKeywords = {
    ko: ['쿠폰', '할인', '적용', '코드', '프로모션', '이벤트'],
    en: ['coupon', 'discount', 'apply', 'code', 'promotion', 'event']
  };

  private orderKeywords = {
    ko: ['결제', '주문완료', '픽업', '배달', '주소', '전화번호', '이름', '완료'],
    en: ['payment', 'checkout', 'pickup', 'delivery', 'address', 'phone', 'name', 'complete']
  };

  private greetingKeywords = {
    ko: ['안녕', '안녕하세요', '반갑', '처음', '시작', '도움'],
    en: ['hello', 'hi', 'hey', 'start', 'help', 'welcome']
  };

  /**
   * Classify intent from user input
   */
  classifyIntent(input: UserInput): Intent {
    const text = input.content.toLowerCase().trim();
    
    // Handle empty or very short input
    if (text.length < 2) {
      return this.createIntent('general', 'unclear', 0.3, { query: input.content });
    }

    // Check for greetings first
    if (this.containsKeywords(text, this.greetingKeywords)) {
      return this.createIntent('general', 'greeting', 0.9, { query: input.content });
    }

    // Classify based on keyword matching
    const scores = {
      product: this.calculateScore(text, this.productKeywords),
      coupon: this.calculateScore(text, this.couponKeywords),
      order: this.calculateScore(text, this.orderKeywords)
    };

    // Find the highest scoring category
    const maxCategory = Object.entries(scores).reduce((a, b) => 
      scores[a[0] as keyof typeof scores] > scores[b[0] as keyof typeof scores] ? a : b
    )[0] as keyof typeof scores;

    const maxScore = scores[maxCategory];

    // If no category has a good score, classify as general
    if (maxScore < 0.3) {
      return this.createIntent('general', 'chat', 0.5, { query: input.content });
    }

    // Determine specific action based on category and content
    const action = this.determineAction(maxCategory, text);
    const slots = this.extractSlots(maxCategory, text);

    return this.createIntent(maxCategory, action, maxScore, slots);
  }

  /**
   * Extract confidence score for intent classification
   */
  getConfidenceScore(intent: Intent, input: UserInput): number {
    // Adjust confidence based on input type
    let confidence = intent.confidence;
    
    if (input.type === 'voice') {
      // Voice input might be less accurate
      confidence *= 0.9;
    }

    // Boost confidence for exact matches
    const text = input.content.toLowerCase();
    if (this.hasExactMatches(text, intent.category)) {
      confidence = Math.min(confidence * 1.2, 1.0);
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Validate if intent has sufficient information
   */
  isIntentComplete(intent: Intent): boolean {
    const requiredSlots: Record<string, string[]> = {
      'product.search': [],
      'product.add': ['productName'],
      'coupon.apply': ['couponCode'],
      'order.create': ['orderType'],
      'order.delivery': ['address'],
      'order.pickup': ['location']
    };

    const intentKey = `${intent.category}.${intent.action}`;
    const required = requiredSlots[intentKey] || [];

    return required.every(slot => intent.slots[slot]);
  }

  /**
   * Get missing slots for an intent
   */
  getMissingSlots(intent: Intent): string[] {
    const requiredSlots: Record<string, string[]> = {
      'product.search': [],
      'product.add': ['productName', 'quantity'],
      'coupon.apply': ['couponCode'],
      'order.create': ['orderType'],
      'order.delivery': ['address', 'phone'],
      'order.pickup': ['phone']
    };

    const intentKey = `${intent.category}.${intent.action}`;
    const required = requiredSlots[intentKey] || [];

    return required.filter(slot => !intent.slots[slot]);
  }

  /**
   * Suggest clarification questions for incomplete intents
   */
  getClarificationQuestion(intent: Intent, missingSlots: string[]): string {
    const questions: Record<string, Record<string, string>> = {
      ko: {
        productName: '어떤 상품을 찾고 계신가요?',
        quantity: '몇 개를 주문하시겠어요?',
        orderType: '픽업 또는 배달 중 어떤 방식을 원하시나요?',
        address: '배달 주소를 알려주세요.',
        phone: '연락처를 알려주세요.',
        couponCode: '쿠폰 코드를 입력해 주세요.',
        location: '어느 매장에서 픽업하시겠어요?'
      },
      en: {
        productName: 'What product are you looking for?',
        quantity: 'How many would you like to order?',
        orderType: 'Would you like pickup or delivery?',
        address: 'Please provide your delivery address.',
        phone: 'Please provide your phone number.',
        couponCode: 'Please enter your coupon code.',
        location: 'Which store would you like to pick up from?'
      }
    };

    // Use Korean by default
    const lang = 'ko';
    const firstMissingSlot = missingSlots[0];
    
    return questions[lang][firstMissingSlot] || '추가 정보가 필요합니다. 다시 말씀해 주세요.';
  }

  /**
   * Create intent object
   */
  private createIntent(category: string, action: string, confidence: number, slots: Record<string, any>): Intent {
    return {
      category: category as Intent['category'],
      action,
      confidence,
      slots: { query: slots.query || '', ...slots }
    };
  }

  /**
   * Check if text contains keywords from a category
   */
  private containsKeywords(text: string, keywords: { ko: string[], en: string[] }): boolean {
    const allKeywords = [...keywords.ko, ...keywords.en];
    return allKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Calculate score for a category based on keyword matching
   */
  private calculateScore(text: string, keywords: { ko: string[], en: string[] }): number {
    const allKeywords = [...keywords.ko, ...keywords.en];
    let score = 0;
    let matches = 0;

    for (const keyword of allKeywords) {
      if (text.includes(keyword)) {
        matches++;
        // Longer keywords get higher scores
        score += keyword.length / 10;
      }
    }

    // Normalize score
    if (matches > 0) {
      score = Math.min(score / allKeywords.length * 2, 1.0);
      // Boost score for multiple matches
      score += (matches - 1) * 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Determine specific action based on category and text
   */
  private determineAction(category: string, text: string): string {
    switch (category) {
      case 'product':
        if (text.includes('추가') || text.includes('담') || text.includes('add')) {
          return 'add';
        } else if (text.includes('찾') || text.includes('검색') || text.includes('search')) {
          return 'search';
        } else if (text.includes('추천') || text.includes('recommend')) {
          return 'recommend';
        }
        return 'search';

      case 'coupon':
        if (text.includes('적용') || text.includes('apply')) {
          return 'apply';
        } else if (text.includes('확인') || text.includes('validate')) {
          return 'validate';
        } else if (text.includes('목록') || text.includes('list')) {
          return 'list';
        }
        return 'apply';

      case 'order':
        if (text.includes('생성') || text.includes('만들') || text.includes('create')) {
          return 'create';
        } else if (text.includes('배달비') || text.includes('fee')) {
          return 'quote';
        } else if (text.includes('픽업') || text.includes('pickup')) {
          return 'pickup';
        } else if (text.includes('예약') || text.includes('schedule')) {
          return 'schedule';
        }
        return 'create';

      default:
        return 'chat';
    }
  }

  /**
   * Extract slots from text based on category
   */
  private extractSlots(category: string, text: string): Record<string, any> {
    const slots: Record<string, any> = { query: text };

    switch (category) {
      case 'product':
        // Extract quantity
        const quantityMatch = text.match(/(\d+)\s*(개|잔|개입|ea|pieces?)/);
        if (quantityMatch) {
          slots.quantity = parseInt(quantityMatch[1]);
        }

        // Extract product names
        const productNames = this.extractProductNames(text);
        if (productNames.length > 0) {
          slots.productName = productNames[0];
          slots.allProductNames = productNames;
        }

        // Extract size/options
        if (text.includes('라지') || text.includes('large')) {
          slots.size = 'large';
        } else if (text.includes('미디움') || text.includes('medium')) {
          slots.size = 'medium';
        } else if (text.includes('스몰') || text.includes('small')) {
          slots.size = 'small';
        }
        break;

      case 'coupon':
        // Extract coupon code (alphanumeric, 4+ characters)
        const couponMatch = text.match(/([A-Z0-9]{4,})/i);
        if (couponMatch) {
          slots.couponCode = couponMatch[1].toUpperCase();
        }
        break;

      case 'order':
        // Extract order type
        if (text.includes('픽업') || text.includes('pickup')) {
          slots.orderType = 'pickup';
        } else if (text.includes('배달') || text.includes('delivery')) {
          slots.orderType = 'delivery';
        }

        // Extract phone number
        const phoneMatch = text.match(/(\d{3}[-\s]?\d{3,4}[-\s]?\d{4})/);
        if (phoneMatch) {
          slots.phone = phoneMatch[1].replace(/[-\s]/g, '');
        }

        // Extract name
        const nameMatch = text.match(/(이름은?|성함은?)\s*([가-힣]{2,4})/);
        if (nameMatch) {
          slots.customerName = nameMatch[2];
        }
        break;
    }

    return slots;
  }

  /**
   * Extract product names from text
   */
  private extractProductNames(text: string): string[] {
    const productNames = [
      '아메리카노', '라떼', '카푸치노', '에스프레소', '마키아토',
      '피자', '버거', '샐러드', '파스타', '샌드위치',
      '케이크', '쿠키', '머핀', '도넛'
    ];

    return productNames.filter(name => text.includes(name));
  }

  /**
   * Check for exact keyword matches
   */
  private hasExactMatches(text: string, category: string): boolean {
    const exactMatches: Record<string, string[]> = {
      product: ['주문하고 싶어요', '찾아주세요', 'order please'],
      coupon: ['쿠폰 적용', 'apply coupon'],
      order: ['결제할게요', '주문 완료', 'checkout', 'complete order']
    };

    const matches = exactMatches[category] || [];
    return matches.some(match => text.includes(match));
  }
}

// Singleton instance
export const intentClassifier = new IntentClassifier();