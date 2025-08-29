export interface KoreanLanguageConfig {
  enableHonorific: boolean;
  enableCasualSpeech: boolean;
  enableNumberConversion: boolean;
  enableParticleHandling: boolean;
}

export interface KoreanProcessingResult {
  normalizedText: string;
  detectedNumbers: Array<{ original: string; value: number; position: number }>;
  detectedProducts: Array<{ name: string; confidence: number; position: number }>;
  speechLevel: 'formal' | 'casual' | 'honorific';
  particles: Array<{ particle: string; position: number; function: string }>;
}

export class KoreanLanguageProcessor {
  private config: KoreanLanguageConfig;
  
  // Korean number mappings
  private koreanNumbers = {
    // Basic numbers
    '영': 0, '공': 0, '제로': 0,
    '일': 1, '하나': 1, '한': 1,
    '이': 2, '둘': 2, '두': 2,
    '삼': 3, '셋': 3, '세': 3,
    '사': 4, '넷': 4, '네': 4,
    '오': 5, '다섯': 5,
    '육': 6, '여섯': 6,
    '칠': 7, '일곱': 7,
    '팔': 8, '여덟': 8,
    '구': 9, '아홉': 9,
    '십': 10, '열': 10,
    '백': 100, '천': 1000, '만': 10000
  };

  // Korean particles and their functions
  private particles = {
    '은': 'topic_marker',
    '는': 'topic_marker',
    '이': 'subject_marker',
    '가': 'subject_marker',
    '을': 'object_marker',
    '를': 'object_marker',
    '에': 'location_time_marker',
    '에서': 'location_marker',
    '로': 'direction_method_marker',
    '으로': 'direction_method_marker',
    '와': 'conjunction',
    '과': 'conjunction',
    '하고': 'conjunction',
    '의': 'possessive_marker',
    '도': 'addition_marker',
    '만': 'only_marker',
    '부터': 'starting_point_marker',
    '까지': 'ending_point_marker'
  };

  // Common Korean food/drink terms
  private productTerms = {
    // Coffee
    '아메리카노': { category: 'coffee', confidence: 0.95 },
    '라떼': { category: 'coffee', confidence: 0.9 },
    '카푸치노': { category: 'coffee', confidence: 0.9 },
    '에스프레소': { category: 'coffee', confidence: 0.95 },
    '마키아토': { category: 'coffee', confidence: 0.9 },
    '모카': { category: 'coffee', confidence: 0.85 },
    '카페라떼': { category: 'coffee', confidence: 0.9 },
    '바닐라라떼': { category: 'coffee', confidence: 0.9 },
    '카라멜마키아토': { category: 'coffee', confidence: 0.9 },
    
    // Tea
    '녹차': { category: 'tea', confidence: 0.9 },
    '홍차': { category: 'tea', confidence: 0.9 },
    '우롱차': { category: 'tea', confidence: 0.85 },
    '허브차': { category: 'tea', confidence: 0.8 },
    
    // Food
    '피자': { category: 'food', confidence: 0.95 },
    '버거': { category: 'food', confidence: 0.9 },
    '햄버거': { category: 'food', confidence: 0.95 },
    '샐러드': { category: 'food', confidence: 0.9 },
    '파스타': { category: 'food', confidence: 0.9 },
    '샌드위치': { category: 'food', confidence: 0.9 },
    '리조또': { category: 'food', confidence: 0.85 },
    
    // Desserts
    '케이크': { category: 'dessert', confidence: 0.9 },
    '쿠키': { category: 'dessert', confidence: 0.9 },
    '머핀': { category: 'dessert', confidence: 0.9 },
    '도넛': { category: 'dessert', confidence: 0.9 },
    '크로와상': { category: 'dessert', confidence: 0.85 },
    '마카롱': { category: 'dessert', confidence: 0.85 }
  };

  // Speech level indicators
  private speechLevelIndicators = {
    formal: ['습니다', '습니까', '시겠습니다', '하겠습니다'],
    casual: ['해요', '해', '이야', '야', '지', '어'],
    honorific: ['세요', '시네요', '십시오', '하세요', '드세요', '주세요']
  };

  constructor(config: KoreanLanguageConfig = {
    enableHonorific: true,
    enableCasualSpeech: true,
    enableNumberConversion: true,
    enableParticleHandling: true
  }) {
    this.config = config;
  }

  /**
   * Process Korean text input
   */
  processText(text: string): KoreanProcessingResult {
    const normalizedText = this.normalizeText(text);
    const detectedNumbers = this.config.enableNumberConversion ? this.extractNumbers(text) : [];
    const detectedProducts = this.extractProducts(text);
    const speechLevel = this.detectSpeechLevel(text);
    const particles = this.config.enableParticleHandling ? this.extractParticles(text) : [];

    return {
      normalizedText,
      detectedNumbers,
      detectedProducts,
      speechLevel,
      particles
    };
  }

  /**
   * Generate appropriate Korean response based on input speech level
   */
  generateResponse(message: string, inputSpeechLevel: 'formal' | 'casual' | 'honorific'): string {
    // Match the user's speech level for natural conversation
    switch (inputSpeechLevel) {
      case 'formal':
        return this.convertToFormalSpeech(message);
      case 'casual':
        return this.convertToCasualSpeech(message);
      case 'honorific':
        return this.convertToHonorificSpeech(message);
      default:
        return this.convertToFormalSpeech(message); // Default to formal
    }
  }

  /**
   * Extract and convert Korean numbers to digits
   */
  extractNumbers(text: string): Array<{ original: string; value: number; position: number }> {
    const numbers: Array<{ original: string; value: number; position: number }> = [];
    
    // Pattern for Korean numbers with units
    const patterns = [
      // Complex numbers like "스물다섯개", "서른한잔"
      /([일이삼사오육칠팔구십백천만]+)\s*(개|잔|개입|명|시|분|원)/g,
      // Simple numbers like "하나", "둘", "세개"
      /(하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)\s*(개|잔|개입|명)?/g,
      // Mixed numbers like "2개", "10잔"
      /(\d+)\s*(개|잔|개입|명|시|분|원)/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const original = match[0];
        const numberPart = match[1];
        const unit = match[2];
        const position = match.index;

        let value = this.convertKoreanNumberToDigit(numberPart);
        if (value !== null) {
          numbers.push({ original, value, position });
        }
      }
    });

    return numbers.sort((a, b) => a.position - b.position);
  }

  /**
   * Extract product names from Korean text
   */
  extractProducts(text: string): Array<{ name: string; confidence: number; position: number }> {
    const products: Array<{ name: string; confidence: number; position: number }> = [];
    
    Object.entries(this.productTerms).forEach(([productName, info]) => {
      const index = text.indexOf(productName);
      if (index !== -1) {
        products.push({
          name: productName,
          confidence: info.confidence,
          position: index
        });
      }
    });

    return products.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Detect speech level from Korean text
   */
  detectSpeechLevel(text: string): 'formal' | 'casual' | 'honorific' {
    let formalScore = 0;
    let casualScore = 0;
    let honorificScore = 0;

    // Check for formal indicators
    this.speechLevelIndicators.formal.forEach(indicator => {
      if (text.includes(indicator)) {
        formalScore += 1;
      }
    });

    // Check for casual indicators
    this.speechLevelIndicators.casual.forEach(indicator => {
      if (text.includes(indicator)) {
        casualScore += 1;
      }
    });

    // Check for honorific indicators
    this.speechLevelIndicators.honorific.forEach(indicator => {
      if (text.includes(indicator)) {
        honorificScore += 2; // Weight honorific higher
      }
    });

    // Determine speech level
    if (honorificScore > 0) {
      return 'honorific';
    } else if (formalScore > casualScore) {
      return 'formal';
    } else if (casualScore > 0) {
      return 'casual';
    } else {
      return 'formal'; // Default
    }
  }

  /**
   * Extract Korean particles and their functions
   */
  extractParticles(text: string): Array<{ particle: string; position: number; function: string }> {
    const foundParticles: Array<{ particle: string; position: number; function: string }> = [];
    
    Object.entries(this.particles).forEach(([particle, func]) => {
      let index = text.indexOf(particle);
      while (index !== -1) {
        foundParticles.push({
          particle,
          position: index,
          function: func
        });
        index = text.indexOf(particle, index + 1);
      }
    });

    return foundParticles.sort((a, b) => a.position - b.position);
  }

  /**
   * Normalize Korean text (remove extra spaces, standardize punctuation)
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/[。．]/g, '.') // Normalize periods
      .replace(/[，]/g, ',') // Normalize commas
      .replace(/[？]/g, '?') // Normalize question marks
      .replace(/[！]/g, '!'); // Normalize exclamation marks
  }

  /**
   * Convert Korean number words to digits
   */
  private convertKoreanNumberToDigit(koreanNumber: string): number | null {
    // Handle simple cases first
    if (this.koreanNumbers[koreanNumber]) {
      return this.koreanNumbers[koreanNumber];
    }

    // Handle digit strings
    if (/^\d+$/.test(koreanNumber)) {
      return parseInt(koreanNumber);
    }

    // Handle complex Korean numbers
    let result = 0;
    let current = 0;
    
    // Split by major units (만, 천, 백, 십)
    const chars = koreanNumber.split('');
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const value = this.koreanNumbers[char];
      
      if (value === undefined) continue;
      
      if (value >= 10) {
        if (value >= 10000) {
          result += (current || 1) * value;
          current = 0;
        } else if (value >= 1000) {
          current += (current || 1) * value;
        } else if (value >= 100) {
          current += (current || 1) * value;
        } else if (value >= 10) {
          current += (current || 1) * value;
        }
      } else {
        current += value;
      }
    }
    
    result += current;
    return result > 0 ? result : null;
  }

  /**
   * Convert message to formal Korean speech
   */
  private convertToFormalSpeech(message: string): string {
    // Simple conversion - in a real system, this would be more sophisticated
    if (message.endsWith('요')) {
      return message.replace(/요$/, '습니다');
    } else if (message.endsWith('해')) {
      return message.replace(/해$/, '합니다');
    } else if (!message.match(/습니다|습니까$/)) {
      return message + '습니다';
    }
    return message;
  }

  /**
   * Convert message to casual Korean speech
   */
  private convertToCasualSpeech(message: string): string {
    if (message.endsWith('습니다')) {
      return message.replace(/습니다$/, '요');
    } else if (message.endsWith('습니까')) {
      return message.replace(/습니까$/, '요?');
    }
    return message;
  }

  /**
   * Convert message to honorific Korean speech
   */
  private convertToHonorificSpeech(message: string): string {
    // Add honorific elements
    let honorificMessage = message;
    
    // Replace common verbs with honorific forms
    const honorificReplacements = {
      '주문하': '주문하시',
      '선택하': '선택하시',
      '확인하': '확인하시',
      '말씀해': '말씀하시',
      '기다려': '기다리시'
    };

    Object.entries(honorificReplacements).forEach(([casual, honorific]) => {
      honorificMessage = honorificMessage.replace(new RegExp(casual, 'g'), honorific);
    });

    // Ensure proper ending
    if (!honorificMessage.match(/세요|십시오|하세요$/)) {
      if (honorificMessage.endsWith('습니다')) {
        honorificMessage = honorificMessage.replace(/습니다$/, '세요');
      } else {
        honorificMessage += '세요';
      }
    }

    return honorificMessage;
  }

  /**
   * Check if text contains Korean characters
   */
  isKoreanText(text: string): boolean {
    const koreanRegex = /[가-힣]/;
    return koreanRegex.test(text);
  }

  /**
   * Get product category suggestions based on Korean input
   */
  getProductCategorySuggestions(text: string): string[] {
    const suggestions: string[] = [];
    const lowerText = text.toLowerCase();

    if (lowerText.includes('커피') || lowerText.includes('coffee')) {
      suggestions.push('coffee');
    }
    if (lowerText.includes('차') || lowerText.includes('tea')) {
      suggestions.push('tea');
    }
    if (lowerText.includes('음식') || lowerText.includes('food')) {
      suggestions.push('food');
    }
    if (lowerText.includes('디저트') || lowerText.includes('dessert')) {
      suggestions.push('dessert');
    }

    return suggestions;
  }

  /**
   * Generate Korean quantity expressions
   */
  generateQuantityExpression(quantity: number, item: string): string {
    const quantityMap: Record<number, string> = {
      1: '한',
      2: '두',
      3: '세',
      4: '네',
      5: '다섯',
      6: '여섯',
      7: '일곱',
      8: '여덟',
      9: '아홉',
      10: '열'
    };

    const koreanQuantity = quantityMap[quantity] || quantity.toString();
    
    // Determine appropriate counter based on item type
    let counter = '개';
    if (item.includes('커피') || item.includes('차') || item.includes('음료')) {
      counter = '잔';
    } else if (item.includes('피자') || item.includes('케이크')) {
      counter = '조각';
    }

    return `${koreanQuantity} ${counter}`;
  }
}

// Singleton instance
export const koreanLanguageProcessor = new KoreanLanguageProcessor();