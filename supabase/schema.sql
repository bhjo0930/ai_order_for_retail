-- Create ai_order schema
CREATE SCHEMA IF NOT EXISTS ai_order;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Products table
CREATE TABLE ai_order.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'KRW',
    category VARCHAR(100) NOT NULL,
    image_url TEXT,
    options JSONB DEFAULT '[]',
    inventory_count INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product options table for structured options
CREATE TABLE ai_order.product_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES ai_order.products(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('single', 'multiple')) NOT NULL,
    required BOOLEAN DEFAULT false,
    choices JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Coupons table
CREATE TABLE ai_order.coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_shipping')) NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    minimum_order_amount DECIMAL(10,2),
    maximum_discount_amount DECIMAL(10,2),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    restrictions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE ai_order.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    customer_id UUID,
    order_type VARCHAR(20) CHECK (order_type IN ('pickup', 'delivery')) NOT NULL,
    status VARCHAR(50) DEFAULT 'created',
    payment_status VARCHAR(50) DEFAULT 'pending',
    customer_info JSONB NOT NULL,
    delivery_info JSONB,
    pickup_info JSONB,
    pricing JSONB NOT NULL,
    special_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order items table
CREATE TABLE ai_order.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES ai_order.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES ai_order.products(id),
    quantity INTEGER NOT NULL,
    selected_options JSONB DEFAULT '{}',
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order status history table
CREATE TABLE ai_order.order_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES ai_order.orders(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table for conversation management
CREATE TABLE ai_order.sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID,
    current_state VARCHAR(50) DEFAULT 'idle',
    conversation_history JSONB DEFAULT '[]',
    cart JSONB DEFAULT '{}',
    current_order_id UUID REFERENCES ai_order.orders(id),
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours')
);

-- Payment sessions table (for mock payments)
CREATE TABLE ai_order.payment_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    order_id UUID REFERENCES ai_order.orders(id),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'KRW',
    status VARCHAR(50) DEFAULT 'created',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 minutes')
);

-- Store locations table for pickup orders
CREATE TABLE ai_order.store_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(20),
    coordinates POINT,
    operating_hours JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_products_category ON ai_order.products(category);
CREATE INDEX idx_products_active ON ai_order.products(is_active);
CREATE INDEX idx_orders_session_id ON ai_order.orders(session_id);
CREATE INDEX idx_orders_status ON ai_order.orders(status);
CREATE INDEX idx_sessions_expires_at ON ai_order.sessions(expires_at);
CREATE INDEX idx_coupons_code ON ai_order.coupons(code);
CREATE INDEX idx_coupons_active ON ai_order.coupons(is_active);

-- Row Level Security (RLS) policies
ALTER TABLE ai_order.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_order.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_order.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_order.coupons ENABLE ROW LEVEL SECURITY;

-- Allow public read access to products and active coupons
CREATE POLICY "Public can view active products" ON ai_order.products
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public can view active coupons" ON ai_order.coupons
    FOR SELECT USING (is_active = true);

-- Session-based access for orders and sessions
CREATE POLICY "Users can access their own sessions" ON ai_order.sessions
    FOR ALL USING (true); -- Will be refined based on authentication

CREATE POLICY "Users can access orders from their sessions" ON ai_order.orders
    FOR ALL USING (true); -- Will be refined based on authentication

-- Functions for common operations
CREATE OR REPLACE FUNCTION ai_order.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at columns
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON ai_order.products
    FOR EACH ROW EXECUTE FUNCTION ai_order.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON ai_order.orders
    FOR EACH ROW EXECUTE FUNCTION ai_order.update_updated_at_column();

CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON ai_order.coupons
    FOR EACH ROW EXECUTE FUNCTION ai_order.update_updated_at_column();

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION ai_order.cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM ai_order.sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;-
- Function to search products by name and category
CREATE OR REPLACE FUNCTION ai_order.search_products(
    search_query TEXT DEFAULT '',
    category_filter TEXT DEFAULT NULL,
    limit_count INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    description TEXT,
    price DECIMAL(10,2),
    currency VARCHAR(3),
    category VARCHAR(100),
    image_url TEXT,
    inventory_count INTEGER
) AS $
BEGIN
    RETURN QUERY
    SELECT p.id, p.name, p.description, p.price, p.currency, p.category, p.image_url, p.inventory_count
    FROM ai_order.products p
    WHERE p.is_active = true
    AND (search_query = '' OR p.name ILIKE '%' || search_query || '%' OR p.description ILIKE '%' || search_query || '%')
    AND (category_filter IS NULL OR p.category = category_filter)
    AND p.inventory_count > 0
    ORDER BY 
        CASE WHEN p.name ILIKE search_query || '%' THEN 1 ELSE 2 END,
        p.name
    LIMIT limit_count;
END;
$ LANGUAGE plpgsql;

-- Function to validate and apply coupon
CREATE OR REPLACE FUNCTION ai_order.validate_coupon(
    coupon_code TEXT,
    cart_total DECIMAL(10,2),
    cart_items JSONB DEFAULT '[]'
)
RETURNS TABLE (
    is_valid BOOLEAN,
    coupon_id UUID,
    discount_amount DECIMAL(10,2),
    discount_type VARCHAR(20),
    error_message TEXT
) AS $
DECLARE
    coupon_record ai_order.coupons%ROWTYPE;
    calculated_discount DECIMAL(10,2);
BEGIN
    -- Find the coupon
    SELECT * INTO coupon_record
    FROM ai_order.coupons c
    WHERE c.code = coupon_code AND c.is_active = true;
    
    -- Check if coupon exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, 0::DECIMAL(10,2), NULL::VARCHAR(20), 'Coupon code not found';
        RETURN;
    END IF;
    
    -- Check if coupon is still valid (date range)
    IF NOW() < coupon_record.valid_from OR NOW() > coupon_record.valid_until THEN
        RETURN QUERY SELECT false, coupon_record.id, 0::DECIMAL(10,2), coupon_record.discount_type, 'Coupon has expired or is not yet valid';
        RETURN;
    END IF;
    
    -- Check minimum order amount
    IF coupon_record.minimum_order_amount IS NOT NULL AND cart_total < coupon_record.minimum_order_amount THEN
        RETURN QUERY SELECT false, coupon_record.id, 0::DECIMAL(10,2), coupon_record.discount_type, 
            'Minimum order amount of ' || coupon_record.minimum_order_amount || ' ' || coupon_record.currency || ' required';
        RETURN;
    END IF;
    
    -- Check usage limit
    IF coupon_record.usage_limit IS NOT NULL AND coupon_record.usage_count >= coupon_record.usage_limit THEN
        RETURN QUERY SELECT false, coupon_record.id, 0::DECIMAL(10,2), coupon_record.discount_type, 'Coupon usage limit exceeded';
        RETURN;
    END IF;
    
    -- Calculate discount amount
    IF coupon_record.discount_type = 'percentage' THEN
        calculated_discount := cart_total * (coupon_record.discount_value / 100);
        -- Apply maximum discount limit if set
        IF coupon_record.maximum_discount_amount IS NOT NULL AND calculated_discount > coupon_record.maximum_discount_amount THEN
            calculated_discount := coupon_record.maximum_discount_amount;
        END IF;
    ELSIF coupon_record.discount_type = 'fixed_amount' THEN
        calculated_discount := LEAST(coupon_record.discount_value, cart_total);
    ELSE -- free_shipping
        calculated_discount := 0; -- Will be handled separately in delivery fee calculation
    END IF;
    
    RETURN QUERY SELECT true, coupon_record.id, calculated_discount, coupon_record.discount_type, NULL::TEXT;
END;
$ LANGUAGE plpgsql;

-- Function to update inventory after order
CREATE OR REPLACE FUNCTION ai_order.update_inventory_for_order(order_uuid UUID)
RETURNS BOOLEAN AS $
DECLARE
    item_record RECORD;
BEGIN
    -- Update inventory for each item in the order
    FOR item_record IN 
        SELECT product_id, quantity 
        FROM ai_order.order_items 
        WHERE order_id = order_uuid
    LOOP
        UPDATE ai_order.products 
        SET inventory_count = inventory_count - item_record.quantity,
            updated_at = NOW()
        WHERE id = item_record.product_id;
    END LOOP;
    
    RETURN true;
END;
$ LANGUAGE plpgsql;

-- Function to calculate order totals
CREATE OR REPLACE FUNCTION ai_order.calculate_order_totals(
    items JSONB,
    applied_coupons JSONB DEFAULT '[]',
    delivery_fee DECIMAL(10,2) DEFAULT 0
)
RETURNS TABLE (
    subtotal DECIMAL(10,2),
    discount_total DECIMAL(10,2),
    tax_total DECIMAL(10,2),
    final_total DECIMAL(10,2)
) AS $
DECLARE
    item JSONB;
    coupon JSONB;
    calculated_subtotal DECIMAL(10,2) := 0;
    calculated_discount DECIMAL(10,2) := 0;
    calculated_tax DECIMAL(10,2) := 0;
    tax_rate DECIMAL(5,4) := 0.10; -- 10% tax rate
BEGIN
    -- Calculate subtotal from items
    FOR item IN SELECT * FROM jsonb_array_elements(items)
    LOOP
        calculated_subtotal := calculated_subtotal + (item->>'total_price')::DECIMAL(10,2);
    END LOOP;
    
    -- Calculate discount from coupons
    FOR coupon IN SELECT * FROM jsonb_array_elements(applied_coupons)
    LOOP
        calculated_discount := calculated_discount + (coupon->>'discount_amount')::DECIMAL(10,2);
    END LOOP;
    
    -- Calculate tax on subtotal minus discount plus delivery fee
    calculated_tax := (calculated_subtotal - calculated_discount + delivery_fee) * tax_rate;
    
    RETURN QUERY SELECT 
        calculated_subtotal,
        calculated_discount,
        calculated_tax,
        calculated_subtotal - calculated_discount + delivery_fee + calculated_tax;
END;
$ LANGUAGE plpgsql;