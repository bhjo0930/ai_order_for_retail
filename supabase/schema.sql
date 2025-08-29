-- Create the schema for the AI ordering system
CREATE SCHEMA IF NOT EXISTS ai_order;

-- Set the search path to include the new schema
SET search_path = ai_order, public;

-- Products Table
CREATE TABLE IF NOT EXISTS ai_order.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
    category TEXT,
    image_url TEXT,
    options JSONB, -- e.g., {"size": ["S", "M", "L"], "milk": ["whole", "skim"]}
    inventory INT NOT NULL DEFAULT 0,
    tags TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Coupons Table
CREATE TABLE IF NOT EXISTS ai_order.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL, -- 'percentage', 'fixed_amount', 'free_shipping'
    discount_value NUMERIC(10, 2) NOT NULL,
    minimum_order_amount NUMERIC(10, 2),
    maximum_discount_amount NUMERIC(10, 2),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    usage_limit INT,
    usage_count INT NOT NULL DEFAULT 0,
    restrictions JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orders Table
CREATE TABLE IF NOT EXISTS ai_order.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT,
    customer_id UUID,
    items JSONB NOT NULL,
    order_type TEXT NOT NULL, -- 'pickup' or 'delivery'
    status TEXT NOT NULL, -- 'created', 'confirmed', 'preparing', etc.
    payment_status TEXT NOT NULL,
    customer_info JSONB,
    delivery_info JSONB,
    pickup_info JSONB,
    pricing JSONB NOT NULL,
    special_instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversation Sessions Table
CREATE TABLE IF NOT EXISTS ai_order.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    user_id UUID,
    current_state TEXT,
    conversation_history JSONB,
    cart JSONB,
    current_order_id UUID REFERENCES ai_order.orders(id),
    preferences JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Enable Row Level Security (RLS) for all tables
ALTER TABLE ai_order.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_order.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_order.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_order.sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (example: allow public read access for products)
CREATE POLICY "Allow public read access on products"
ON ai_order.products FOR SELECT
USING (is_active = TRUE);

-- Allow all access for authenticated users on their own orders
CREATE POLICY "Allow users to manage their own orders"
ON ai_order.orders FOR ALL
USING (auth.uid() = customer_id)
WITH CHECK (auth.uid() = customer_id);

-- Allow users to manage their own sessions
CREATE POLICY "Allow users to manage their own sessions"
ON ai_order.sessions FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Grant usage on schema and tables to authenticated role
GRANT USAGE ON SCHEMA ai_order TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA ai_order TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ai_order TO authenticated;
