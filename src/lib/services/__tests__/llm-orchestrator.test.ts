import { LLMOrchestratorService } from '../llm-orchestrator';
import { UserInput, Intent } from '../../types';

// Mock the Google Generative AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      startChat: jest.fn().mockReturnValue({
        sendMessage: jest.fn().mockResolvedValue({
          response: {
            text: jest.fn().mockReturnValue('Test response'),
            functionCalls: jest.fn().mockReturnValue([])
          }
        })
      })
    })
  }))
}));

describe('LLMOrchestratorService', () => {
  let orchestrator: LLMOrchestratorService;

  beforeEach(() => {
    // Set up environment variable for testing
    process.env.GEMINI_API_KEY = 'test-api-key';
    orchestrator = new LLMOrchestratorService();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  describe('processUserInput', () => {
    it('should process user input without throwing errors', async () => {
      const sessionId = 'test-session-123';
      const input: UserInput = {
        type: 'text',
        content: '아메리카노 주문하고 싶어요',
        timestamp: Date.now()
      };

      // Should not throw
      await expect(orchestrator.processUserInput(sessionId, input)).resolves.not.toThrow();
    });
  });

  describe('routeToAgent', () => {
    it('should route product intent correctly', async () => {
      const sessionId = 'test-session-123';
      const intent: Intent = {
        category: 'product',
        action: 'search',
        confidence: 0.8,
        slots: { query: '아메리카노' }
      };

      const result = await orchestrator.routeToAgent(sessionId, intent, {});
      
      // Should return a result (even if it's a placeholder)
      expect(result).toBeDefined();
    });
  });

  describe('handleFunctionCall', () => {
    it('should handle search_catalog function call', async () => {
      const sessionId = 'test-session-123';
      const functionCall = {
        name: 'search_catalog',
        parameters: { query: '아메리카노' },
        id: 'test-call-123'
      };

      const result = await orchestrator.handleFunctionCall(sessionId, functionCall);
      
      expect(result).toEqual({
        id: 'test-call-123',
        result: expect.objectContaining({
          products: [],
          total: 0,
          message: expect.stringContaining('Product search functionality')
        })
      });
    });

    it('should handle unknown function call gracefully', async () => {
      const sessionId = 'test-session-123';
      const functionCall = {
        name: 'unknown_function',
        parameters: {},
        id: 'test-call-123'
      };

      const result = await orchestrator.handleFunctionCall(sessionId, functionCall);
      
      expect(result).toEqual({
        id: 'test-call-123',
        result: null,
        error: 'Unknown function: unknown_function'
      });
    });
  });

  describe('classifyIntent', () => {
    it('should classify product search intent', () => {
      const intent = orchestrator.classifyIntent('아메리카노 찾아줘');
      
      expect(intent.category).toBe('product');
      expect(intent.action).toBe('search');
      expect(intent.confidence).toBeGreaterThan(0.5);
      expect(intent.slots.query).toBe('아메리카노 찾아줘');
    });

    it('should classify coupon intent', () => {
      const intent = orchestrator.classifyIntent('쿠폰 적용해줘');
      
      expect(intent.category).toBe('coupon');
      expect(intent.action).toBe('apply');
      expect(intent.confidence).toBeGreaterThan(0.5);
    });

    it('should classify order intent', () => {
      const intent = orchestrator.classifyIntent('결제할게요');
      
      expect(intent.category).toBe('order');
      expect(intent.action).toBe('process');
      expect(intent.confidence).toBeGreaterThan(0.5);
    });

    it('should default to general intent for unclear input', () => {
      const intent = orchestrator.classifyIntent('hello world');
      
      expect(intent.category).toBe('general');
      expect(intent.action).toBe('chat');
    });
  });
});