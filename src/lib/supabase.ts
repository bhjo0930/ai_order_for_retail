import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client for browser/client-side operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations with elevated privileges
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Database schema types
export type Database = {
  ai_order: {
    Tables: {
      products: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price: number;
          currency: string;
          category: string;
          image_url: string | null;
          options: any;
          inventory_count: number;
          tags: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          price: number;
          currency?: string;
          category: string;
          image_url?: string | null;
          options?: any;
          inventory_count?: number;
          tags?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          currency?: string;
          category?: string;
          image_url?: string | null;
          options?: any;
          inventory_count?: number;
          tags?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_options: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          type: 'single' | 'multiple';
          required: boolean;
          choices: any;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          type: 'single' | 'multiple';
          required?: boolean;
          choices: any;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          name?: string;
          type?: 'single' | 'multiple';
          required?: boolean;
          choices?: any;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          session_id: string;
          customer_id: string | null;
          order_type: 'pickup' | 'delivery';
          status: string;
          payment_status: string;
          customer_info: any;
          delivery_info: any | null;
          pickup_info: any | null;
          pricing: any;
          special_instructions: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          customer_id?: string | null;
          order_type: 'pickup' | 'delivery';
          status?: string;
          payment_status?: string;
          customer_info: any;
          delivery_info?: any | null;
          pickup_info?: any | null;
          pricing: any;
          special_instructions?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          customer_id?: string | null;
          order_type?: 'pickup' | 'delivery';
          status?: string;
          payment_status?: string;
          customer_info?: any;
          delivery_info?: any | null;
          pickup_info?: any | null;
          pricing?: any;
          special_instructions?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          selected_options: any;
          unit_price: number;
          total_price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          quantity: number;
          selected_options?: any;
          unit_price: number;
          total_price: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          quantity?: number;
          selected_options?: any;
          unit_price?: number;
          total_price?: number;
          created_at?: string;
        };
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          status: string;
          metadata: any;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          status: string;
          metadata?: any;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          status?: string;
          metadata?: any;
          created_at?: string;
        };
      };
      sessions: {
        Row: {
          id: string;
          user_id: string | null;
          current_state: string;
          conversation_history: any;
          cart: any;
          current_order_id: string | null;
          preferences: any;
          created_at: string;
          last_activity: string;
          expires_at: string;
        };
        Insert: {
          id: string;
          user_id?: string | null;
          current_state?: string;
          conversation_history?: any;
          cart?: any;
          current_order_id?: string | null;
          preferences?: any;
          created_at?: string;
          last_activity?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          current_state?: string;
          conversation_history?: any;
          cart?: any;
          current_order_id?: string | null;
          preferences?: any;
          created_at?: string;
          last_activity?: string;
          expires_at?: string;
        };
      };
      coupons: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          discount_type: 'percentage' | 'fixed_amount' | 'free_shipping';
          discount_value: number;
          minimum_order_amount: number | null;
          maximum_discount_amount: number | null;
          valid_from: string;
          valid_until: string;
          usage_limit: number | null;
          usage_count: number;
          restrictions: any;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          discount_type: 'percentage' | 'fixed_amount' | 'free_shipping';
          discount_value: number;
          minimum_order_amount?: number | null;
          maximum_discount_amount?: number | null;
          valid_from: string;
          valid_until: string;
          usage_limit?: number | null;
          usage_count?: number;
          restrictions?: any;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          discount_type?: 'percentage' | 'fixed_amount' | 'free_shipping';
          discount_value?: number;
          minimum_order_amount?: number | null;
          maximum_discount_amount?: number | null;
          valid_from?: string;
          valid_until?: string;
          usage_limit?: number | null;
          usage_count?: number;
          restrictions?: any;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      payment_sessions: {
        Row: {
          id: string;
          session_id: string;
          order_id: string;
          amount: number;
          currency: string;
          status: string;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          order_id: string;
          amount: number;
          currency?: string;
          status?: string;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          order_id?: string;
          amount?: number;
          currency?: string;
          status?: string;
          created_at?: string;
          expires_at?: string;
        };
      };
      store_locations: {
        Row: {
          id: string;
          name: string;
          address: string;
          phone: string | null;
          coordinates: any | null;
          operating_hours: any;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          phone?: string | null;
          coordinates?: any | null;
          operating_hours: any;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          phone?: string | null;
          coordinates?: any | null;
          operating_hours?: any;
          is_active?: boolean;
          created_at?: string;
        };
      };
    };
    Functions: {
      search_products: {
        Args: {
          search_query?: string;
          category_filter?: string;
          limit_count?: number;
        };
        Returns: {
          id: string;
          name: string;
          description: string;
          price: number;
          currency: string;
          category: string;
          image_url: string;
          inventory_count: number;
        }[];
      };
      validate_coupon: {
        Args: {
          coupon_code: string;
          cart_total: number;
          cart_items?: any;
        };
        Returns: {
          is_valid: boolean;
          coupon_id: string;
          discount_amount: number;
          discount_type: string;
          error_message: string;
        }[];
      };
      calculate_order_totals: {
        Args: {
          items: any;
          applied_coupons?: any;
          delivery_fee?: number;
        };
        Returns: {
          subtotal: number;
          discount_total: number;
          tax_total: number;
          final_total: number;
        }[];
      };
      update_inventory_for_order: {
        Args: {
          order_uuid: string;
        };
        Returns: boolean;
      };
      cleanup_expired_sessions: {
        Args: {};
        Returns: number;
      };
    };
  };
};