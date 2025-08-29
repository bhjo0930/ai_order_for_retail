-- Seed data for the ai_order schema

-- Products
INSERT INTO ai_order.products (name, description, price, category, inventory, tags, is_active) VALUES
('아메리카노', '신선한 원두로 내린 기본 커피', 4500, '커피', 100, '{"coffee", "basic"}', true),
('카페라떼', '부드러운 우유와 에스프레소의 조화', 5000, '커피', 100, '{"coffee", "milk"}', true),
('카푸치노', '풍성한 우유 거품과 시나몬 파우더', 5000, '커피', 100, '{"coffee", "foam"}', true),
('페퍼로니 피자', '짭짤한 페퍼로니가 듬뿍 올라간 피자', 18900, '피자', 50, '{"pizza", "pepperoni"}', true),
('치즈 피자', '다양한 치즈가 어우러진 클래식 피자', 16900, '피자', 50, '{"pizza", "cheese"}', true),
('초코 케이크', '진한 초콜릿 맛의 디저트 케이크', 6500, '디저트', 30, '{"dessert", "cake", "chocolate"}', true);

-- Coupons
INSERT INTO ai_order.coupons (code, name, description, discount_type, discount_value, minimum_order_amount, is_active) VALUES
('WELCOME10', '신규 고객 10% 할인', '첫 주문 시 10% 할인', 'percentage', 10, 10000, true),
('DELIVERYFREE', '배달비 무료', '20000원 이상 주문 시 배달비 무료', 'free_shipping', 0, 20000, true),
('PIZZALOVE', '피자 3000원 할인', '피자 주문 시 3000원 할인', 'fixed_amount', 3000, 15000, true);

-- Note: This is just sample data. A real application would have a more extensive catalog.
