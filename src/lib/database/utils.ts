import { supabase, supabaseAdmin } from '../supabase';

/**
 * Database connection utilities and helpers
 */

// Test database connection
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('count(*)')
      .limit(1);
    
    return !error;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// Initialize database with sample data (for development/demo)
export async function initializeSampleData(): Promise<void> {
  try {
    // Check if data already exists
    const { data: existingProducts } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    if (existingProducts && existingProducts.length > 0) {
      console.log('Sample data already exists, skipping initialization');
      return;
    }

    // Sample products
    const sampleProducts = [
      {
        name: '아메리카노',
        description: '진한 에스프레소와 뜨거운 물로 만든 클래식 아메리카노',
        price: 4500,
        category: '커피',
        inventory_count: 100,
        tags: ['hot', 'coffee', 'espresso'],
        options: [
          {
            id: 'size',
            name: '사이즈',
            type: 'single',
            required: true,
            choices: [
              { id: 'regular', name: '레귤러', priceModifier: 0 },
              { id: 'large', name: '라지', priceModifier: 500 }
            ]
          }
        ]
      },
      {
        name: '카페라떼',
        description: '부드러운 스팀 밀크와 에스프레소의 완벽한 조화',
        price: 5500,
        category: '커피',
        inventory_count: 100,
        tags: ['hot', 'coffee', 'milk'],
        options: [
          {
            id: 'size',
            name: '사이즈',
            type: 'single',
            required: true,
            choices: [
              { id: 'regular', name: '레귤러', priceModifier: 0 },
              { id: 'large', name: '라지', priceModifier: 500 }
            ]
          }
        ]
      },
      {
        name: '마르게리타 피자',
        description: '신선한 토마토 소스, 모짜렐라 치즈, 바질로 만든 클래식 피자',
        price: 18000,
        category: '피자',
        inventory_count: 50,
        tags: ['pizza', 'vegetarian', 'classic'],
        options: [
          {
            id: 'size',
            name: '사이즈',
            type: 'single',
            required: true,
            choices: [
              { id: 'medium', name: '미디움', priceModifier: 0 },
              { id: 'large', name: '라지', priceModifier: 3000 }
            ]
          }
        ]
      }
    ];

    const { error: productsError } = await supabaseAdmin
      .from('products')
      .insert(sampleProducts);

    if (productsError) throw productsError;

    // Sample coupons
    const sampleCoupons = [
      {
        code: 'WELCOME10',
        name: '신규 고객 10% 할인',
        description: '첫 주문 시 10% 할인 혜택',
        discount_type: 'percentage',
        discount_value: 10,
        minimum_order_amount: 10000,
        maximum_discount_amount: 5000,
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        usage_limit: 100,
        restrictions: []
      },
      {
        code: 'DELIVERY5000',
        name: '배달비 5000원 할인',
        description: '배달 주문 시 5000원 할인',
        discount_type: 'fixed_amount',
        discount_value: 5000,
        minimum_order_amount: 20000,
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        usage_limit: 50,
        restrictions: []
      }
    ];

    const { error: couponsError } = await supabaseAdmin
      .from('coupons')
      .insert(sampleCoupons);

    if (couponsError) throw couponsError;

    // Sample store locations
    const sampleStoreLocations = [
      {
        name: '강남점',
        address: '서울특별시 강남구 테헤란로 123',
        phone: '02-1234-5678',
        operating_hours: {
          monday: { open: '08:00', close: '22:00', isClosed: false },
          tuesday: { open: '08:00', close: '22:00', isClosed: false },
          wednesday: { open: '08:00', close: '22:00', isClosed: false },
          thursday: { open: '08:00', close: '22:00', isClosed: false },
          friday: { open: '08:00', close: '22:00', isClosed: false },
          saturday: { open: '09:00', close: '21:00', isClosed: false },
          sunday: { open: '09:00', close: '21:00', isClosed: false }
        }
      },
      {
        name: '홍대점',
        address: '서울특별시 마포구 홍익로 456',
        phone: '02-2345-6789',
        operating_hours: {
          monday: { open: '08:00', close: '23:00', isClosed: false },
          tuesday: { open: '08:00', close: '23:00', isClosed: false },
          wednesday: { open: '08:00', close: '23:00', isClosed: false },
          thursday: { open: '08:00', close: '23:00', isClosed: false },
          friday: { open: '08:00', close: '24:00', isClosed: false },
          saturday: { open: '09:00', close: '24:00', isClosed: false },
          sunday: { open: '09:00', close: '22:00', isClosed: false }
        }
      }
    ];

    const { error: locationsError } = await supabaseAdmin
      .from('store_locations')
      .insert(sampleStoreLocations);

    if (locationsError) throw locationsError;

    console.log('Sample data initialized successfully');
  } catch (error) {
    console.error('Failed to initialize sample data:', error);
    throw error;
  }
}

// Database health check
export async function performHealthCheck(): Promise<{
  isHealthy: boolean;
  checks: Record<string, boolean>;
  errors: string[];
}> {
  const checks: Record<string, boolean> = {};
  const errors: string[] = [];

  try {
    // Test basic connection
    const { error: connectionError } = await supabase
      .from('products')
      .select('count(*)')
      .limit(1);
    
    checks.connection = !connectionError;
    if (connectionError) errors.push(`Connection: ${connectionError.message}`);

    // Test RPC functions
    try {
      await supabase.rpc('search_products', { search_query: 'test', limit_count: 1 });
      checks.rpc_functions = true;
    } catch (error) {
      checks.rpc_functions = false;
      errors.push(`RPC Functions: ${error}`);
    }

    // Test admin operations
    try {
      await supabaseAdmin.from('sessions').select('count(*)').limit(1);
      checks.admin_access = true;
    } catch (error) {
      checks.admin_access = false;
      errors.push(`Admin Access: ${error}`);
    }

    const isHealthy = Object.values(checks).every(check => check);

    return {
      isHealthy,
      checks,
      errors
    };
  } catch (error) {
    return {
      isHealthy: false,
      checks,
      errors: [`Health check failed: ${error}`]
    };
  }
}

// Clean up expired data
export async function cleanupExpiredData(): Promise<{
  sessionsDeleted: number;
  paymentsDeleted: number;
}> {
  try {
    // Clean up expired sessions
    const sessionsDeleted = await supabaseAdmin.rpc('cleanup_expired_sessions');

    // Clean up expired payment sessions
    const { data: expiredPayments } = await supabaseAdmin
      .from('payment_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    const paymentsDeleted = expiredPayments?.length || 0;

    return {
      sessionsDeleted: sessionsDeleted || 0,
      paymentsDeleted
    };
  } catch (error) {
    console.error('Failed to cleanup expired data:', error);
    throw error;
  }
}

export default {
  testDatabaseConnection,
  initializeSampleData,
  performHealthCheck,
  cleanupExpiredData
};