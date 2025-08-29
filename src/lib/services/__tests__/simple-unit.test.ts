import { describe, it, expect, vi } from 'vitest';

describe('Simple Unit Tests', () => {
  it('should run basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should mock functions', () => {
    const mockFn = vi.fn();
    mockFn('test');
    expect(mockFn).toHaveBeenCalledWith('test');
  });

  it('should handle async operations', async () => {
    const asyncFn = vi.fn().mockResolvedValue('success');
    const result = await asyncFn();
    expect(result).toBe('success');
  });

  it('should test error handling', () => {
    const errorFn = () => {
      throw new Error('Test error');
    };
    expect(errorFn).toThrow('Test error');
  });

  it('should test object properties', () => {
    const testObject = {
      id: 'test-123',
      name: 'Test Object',
      active: true,
    };

    expect(testObject).toEqual({
      id: 'test-123',
      name: 'Test Object',
      active: true,
    });

    expect(testObject).toHaveProperty('id');
    expect(testObject.name).toBe('Test Object');
  });

  it('should test arrays', () => {
    const testArray = [1, 2, 3, 4, 5];
    
    expect(testArray).toHaveLength(5);
    expect(testArray).toContain(3);
    expect(testArray[0]).toBe(1);
  });

  it('should test date operations', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60000); // 1 minute later
    
    expect(future.getTime()).toBeGreaterThan(now.getTime());
  });

  it('should test string operations', () => {
    const testString = '안녕하세요 아메리카노 주문하고 싶어요';
    
    expect(testString).toContain('아메리카노');
    expect(testString).toMatch(/주문/);
    expect(testString.length).toBeGreaterThan(10);
  });

  it('should test number operations', () => {
    const price = 4500;
    const quantity = 2;
    const total = price * quantity;
    
    expect(total).toBe(9000);
    expect(total).toBeGreaterThan(8000);
    expect(total).toBeLessThan(10000);
  });

  it('should test boolean operations', () => {
    const isAvailable = true;
    const isOutOfStock = false;
    
    expect(isAvailable).toBe(true);
    expect(isOutOfStock).toBe(false);
    expect(isAvailable && !isOutOfStock).toBe(true);
  });
});