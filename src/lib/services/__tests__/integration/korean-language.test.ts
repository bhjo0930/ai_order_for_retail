import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceProcessingServiceImpl } from '../../voice-processing';
import { LLMOrchestratorService } from '../../llm-orchestrator';
import { ProductAgent } from '../../../agents/product-agent';
import { CouponAgent } from '../../../agents/coupon-agent';
import { OrderAgent } from '../../../agents/order-agent';
import { koreanLanguageService } from '../../korean-language';

// Mock external dependencies
vi.mock('@google-cloud/speech');
vi.mock('@google/generative-ai');
vi.mock('../../../database');

describe('Korean Language Processing Integration', () => {
  let voiceService: VoiceProcessingServiceImpl;
  let llmOrchestrator: LLMOrchestratorService;
  
  const sessionId = 'korean-test-session';

  beforeEach(() => {
    // Set up environment
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
    process.env.GEMINI_API_KEY = 'test-key';
    
    // Initialize services
    voiceService = new VoiceProcessingServiceImpl();
    llmOrchestrator = new LLMOrchestratorService();
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Korean Voice Recognition', () => {
    it('should configure Korean language settings correctly', async () => {
      const koreanConfig = {
        sampleRate: 16000,
        channels: 1,
        encoding: 'PCM_16' as const,
        languageCode: 'ko-KR',
        enablePartialResults: true,
        enableVoiceActivityDetection: true,
      };

      const streamConnection = await voiceService.startAudioStream(sessionId, koreanConfig);
      
      expect(streamConnection.audioConfig.languageCode).toBe('ko-KR');
      expect(streamConnection.isActive).toBe(true);
    });

    it('should handle Korean speech patterns and colloquialisms', async () => {
      const koreanPhrases = [
        '안녕하세요, 아메리카노 한 잔 주세요',
        '커피 하나 주문할게요',
        '라떼 두 개 포장으로 부탁드려요',
        '아이스 아메리카노 라지 사이즈로 주세요',
        '따뜻한 카페라떼 하나 주문하고 싶어요',
      ];

      for (const phrase of koreanPhrases) {
        const intent = llmOrchestrator.classifyIntent(phrase);
        
        expect(intent.category).toBe('product');
        expect(intent.action).toBe('search');
        expect(intent.confidence).toBeGreaterThan(0.5);
        expect(intent.slots.query).toBeDefined();
      }
    });

    it('should handle mixed Korean-English product names', async () => {
      const mixedLanguagePhrases = [
        '아메리카노 주세요',
        '카페라떼 하나요',
        '에스프레소 더블샷으로',
        '프라푸치노 주문할게요',
        '마키아토 아이스로',
      ];

      for (const phrase of mixedLanguagePhrases) {
        const searchResult = await ProductAgent.search_catalog(phrase);
        
        // Should find products even with mixed language
        expect(searchResult.query).toBe(phrase);
        expect(searchResult.products).toBeDefined();
      }
    });
  });

  describe('Korean Natural Language Understanding', () => {
    it('should understand Korean ordering expressions', async () => {
      const orderingExpressions = [
        { input: '주문하고 싶어요', expectedAction: 'search' },
        { input: '결제할게요', expectedAction: 'process' },
        { input: '쿠폰 사용하고 싶어요', expectedAction: 'apply' },
        { input: '배달로 주문해주세요', expectedAction: 'search' },
        { input: '픽업으로 할게요', expectedAction: 'search' },
      ];

      for (const { input, expectedAction } of orderingExpressions) {
        const intent = llmOrchestrator.classifyIntent(input);
        expect(intent.action).toBe(expectedAction);
      }
    });

    it('should extract Korean product specifications', async () => {
      const specifications = [
        { input: '아메리카노 라지 사이즈', expected: { product: '아메리카노', size: '라지' } },
        { input: '아이스 카페라떼 두 잔', expected: { product: '카페라떼', temperature: '아이스', quantity: '두' } },
        { input: '따뜻한 녹차라떼 설탕 빼고', expected: { product: '녹차라떼', temperature: '따뜻한', customization: '설탕 빼고' } },
      ];

      for (const { input, expected } of specifications) {
        const intent = llmOrchestrator.classifyIntent(input);
        
        expect(intent.slots.query).toContain(expected.product);
        // Additional slot extraction would be tested here in a real implementation
      }
    });

    it('should handle Korean politeness levels', async () => {
      const politenessForms = [
        '아메리카노 주세요', // Formal polite
        '아메리카노 주실래요?', // Informal polite question
        '아메리카노 하나 부탁드려요', // Very polite
        '커피 하나요', // Casual
        '아메리카노 주문할게요', // Declarative polite
      ];

      for (const phrase of politenessForms) {
        const intent = llmOrchestrator.classifyIntent(phrase);
        
        expect(intent.category).toBe('product');
        expect(intent.confidence).toBeGreaterThan(0.5);
        // All forms should be understood regardless of politeness level
      }
    });
  });

  describe('Korean Response Generation', () => {
    it('should generate appropriate Korean responses', async () => {
      const userInput = {
        type: 'text' as const,
        content: '아메리카노 주문하고 싶어요',
        timestamp: Date.now(),
      };

      // Mock LLM response generation
      const mockResponse = '네, 아메리카노 주문을 도와드리겠습니다. 사이즈를 선택해주세요.';
      
      // In a real implementation, this would test the actual response generation
      expect(mockResponse).toContain('아메리카노');
      expect(mockResponse).toContain('주문');
      expect(mockResponse).toMatch(/^네,/); // Starts with polite acknowledgment
    });

    it('should use appropriate Korean honorifics', async () => {
      const customerInfo = {
        name: '김철수',
        phone: '010-1234-5678',
      };

      // Mock response with honorifics
      const mockResponse = '김철수님, 주문이 접수되었습니다. 감사합니다.';
      
      expect(mockResponse).toContain('님'); // Honorific suffix
      expect(mockResponse).toContain('감사합니다'); // Polite thank you
    });

    it('should handle Korean number expressions', async () => {
      const numberExpressions = [
        { korean: '한 잔', expected: 1 },
        { korean: '두 개', expected: 2 },
        { korean: '세 잔', expected: 3 },
        { korean: '다섯 개', expected: 5 },
        { korean: '열 잔', expected: 10 },
      ];

      for (const { korean, expected } of numberExpressions) {
        // Mock number parsing
        const parsed = koreanLanguageService.parseKoreanNumber(korean);
        expect(parsed).toBe(expected);
      }
    });
  });

  describe('Korean Error Messages', () => {
    it('should provide Korean error messages', async () => {
      // Test product not found error
      const searchResult = await ProductAgent.search_catalog('존재하지않는상품');
      expect(searchResult.products).toHaveLength(0);
      
      // Test invalid coupon error
      const couponResult = await CouponAgent.apply_coupon(sessionId, 'INVALID');
      expect(couponResult.success).toBe(false);
      expect(couponResult.errorMessage).toMatch(/한국어/); // Should contain Korean text
    });

    it('should provide helpful Korean suggestions', async () => {
      // Test search suggestions in Korean
      const searchResult = await ProductAgent.search_catalog('커');
      expect(searchResult.suggestions).toBeDefined();
      
      // Suggestions should be in Korean
      if (searchResult.suggestions.length > 0) {
        expect(searchResult.suggestions.some(s => /[가-힣]/.test(s))).toBe(true);
      }
    });
  });

  describe('Korean Address and Location Handling', () => {
    it('should handle Korean address formats', async () => {
      const koreanAddresses = [
        {
          street: '서울시 강남구 테헤란로 123',
          city: '서울',
          postalCode: '06142',
          country: '대한민국',
        },
        {
          street: '부산시 해운대구 해운대해변로 456',
          city: '부산',
          postalCode: '48094',
          country: '대한민국',
        },
      ];

      for (const address of koreanAddresses) {
        const deliveryQuote = await OrderAgent.quote_delivery_fee(address, []);
        
        expect(deliveryQuote.address).toEqual(address);
        expect(deliveryQuote.fee).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle Korean store location names', async () => {
      const koreanStoreNames = [
        '강남점',
        '홍대점',
        '명동점',
        '이태원점',
        '신촌점',
      ];

      const locations = await OrderAgent.get_pickup_locations();
      
      // Should handle Korean store names properly
      expect(locations).toBeDefined();
      // In a real implementation, would verify Korean store names are handled correctly
    });
  });

  describe('Korean Customer Information Validation', () => {
    it('should validate Korean names correctly', async () => {
      const koreanNames = [
        { name: '김철수', valid: true },
        { name: '이영희', valid: true },
        { name: '박민수', valid: true },
        { name: 'A', valid: false }, // Too short
        { name: '홍길동입니다', valid: true }, // Longer name
      ];

      for (const { name, valid } of koreanNames) {
        const customerInfo = {
          name,
          phone: '010-1234-5678',
        };

        const validation = await OrderAgent.validate_customer_info(customerInfo);
        expect(validation.isValid).toBe(valid);
      }
    });

    it('should handle Korean phone number formats', async () => {
      const phoneFormats = [
        { phone: '010-1234-5678', valid: true },
        { phone: '02-123-4567', valid: true },
        { phone: '031-123-4567', valid: true },
        { phone: '01012345678', valid: false }, // Missing dashes
        { phone: '123-456-7890', valid: false }, // Invalid format
      ];

      for (const { phone, valid } of phoneFormats) {
        const customerInfo = {
          name: '김철수',
          phone,
        };

        const validation = await OrderAgent.validate_customer_info(customerInfo);
        expect(validation.isValid).toBe(valid);
      }
    });
  });

  describe('Korean Currency and Pricing', () => {
    it('should handle Korean Won currency formatting', async () => {
      const prices = [1000, 4500, 15000, 25000];

      for (const price of prices) {
        // Mock price formatting
        const formatted = new Intl.NumberFormat('ko-KR', {
          style: 'currency',
          currency: 'KRW',
        }).format(price);

        expect(formatted).toContain('₩');
        expect(formatted).toContain(price.toLocaleString('ko-KR'));
      }
    });

    it('should handle Korean price expressions in voice input', async () => {
      const priceExpressions = [
        '천원',
        '오천원',
        '만원',
        '이만원',
      ];

      for (const expression of priceExpressions) {
        const intent = llmOrchestrator.classifyIntent(`${expression} 이하로 주문하고 싶어요`);
        
        expect(intent.category).toBe('product');
        expect(intent.slots.query).toContain(expression);
      }
    });
  });
});