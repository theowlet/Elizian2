-- Food Menu Categories for Restaurant Booking Platform
-- This creates proper food categories for restaurant menus

-- Create food menu categories table
CREATE TABLE IF NOT EXISTS food_menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create dish categorization table
CREATE TABLE IF NOT EXISTS dish_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create beverage categories table
CREATE TABLE IF NOT EXISTS beverage_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert food menu categories
INSERT INTO food_menu_categories (name, slug, description, display_order) VALUES
('Starters', 'starters', 'Appetizers, soups, and small plates', 1),
('Main Course', 'main-course', 'Primary dishes and entrees', 2),
('Breads', 'breads', 'Naan, roti, and other bread varieties', 3),
('Sides', 'sides', 'Accompaniments and side dishes', 4),
('Rice and Biryani', 'rice-biryani', 'Rice dishes and biryani varieties', 5),
('Beverages', 'beverages', 'Non-alcoholic drinks', 6),
('Cocktails', 'cocktails', 'Alcoholic mixed drinks', 7),
('Mocktails', 'mocktails', 'Non-alcoholic mixed drinks', 8),
('Desserts', 'desserts', 'Sweet dishes and desserts', 9),
('Specials', 'specials', 'Chef specials and seasonal items', 10)
ON CONFLICT (slug) DO NOTHING;

-- Insert dish categories (Veg/Non-Veg)
INSERT INTO dish_categories (name, slug, description) VALUES
('Vegetarian', 'veg', 'Vegetarian dishes'),
('Non-Vegetarian', 'non-veg', 'Non-vegetarian dishes'),
('Vegan', 'vegan', 'Vegan dishes'),
('Jain', 'jain', 'Jain vegetarian dishes')
ON CONFLICT (slug) DO NOTHING;

-- Insert beverage categories (Alcoholic/Non-Alcoholic)
INSERT INTO beverage_categories (name, slug, description) VALUES
('Alcoholic', 'alcoholic', 'Alcoholic beverages'),
('Non-Alcoholic', 'non-alcoholic', 'Non-alcoholic beverages'),
('Hot Beverages', 'hot-beverages', 'Tea, coffee, and hot drinks'),
('Cold Beverages', 'cold-beverages', 'Cold drinks and juices')
ON CONFLICT (slug) DO NOTHING;

-- Update menu_items table to support food categorization
ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS food_category_id UUID REFERENCES food_menu_categories(id),
ADD COLUMN IF NOT EXISTS dish_category_id UUID REFERENCES dish_categories(id),
ADD COLUMN IF NOT EXISTS beverage_category_id UUID REFERENCES beverage_categories(id),
ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS preparation_time INTEGER DEFAULT 15, -- in minutes
ADD COLUMN IF NOT EXISTS spice_level INTEGER DEFAULT 1 CHECK (spice_level BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS is_chef_special BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS allergens TEXT[],
ADD COLUMN IF NOT EXISTS nutritional_info JSONB;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_menu_items_food_category ON menu_items(food_category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_dish_category ON menu_items(dish_category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_beverage_category ON menu_items(beverage_category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(is_available);

-- Create pre-order system tables
CREATE TABLE IF NOT EXISTS pre_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    partner_id UUID NOT NULL REFERENCES partners(id),
    reservation_id UUID, -- Links to reservation if exists
    order_date DATE NOT NULL,
    order_time TIME NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
    special_instructions TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pre_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pre_order_id UUID NOT NULL REFERENCES pre_orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    special_instructions TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for pre-orders
CREATE INDEX IF NOT EXISTS idx_pre_orders_user ON pre_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_pre_orders_partner ON pre_orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_pre_orders_date ON pre_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_pre_orders_status ON pre_orders(status);
CREATE INDEX IF NOT EXISTS idx_pre_order_items_order ON pre_order_items(pre_order_id);

-- Add comments for documentation
COMMENT ON TABLE food_menu_categories IS 'Main food categories for restaurant menus (Starters, Main Course, etc.)';
COMMENT ON TABLE dish_categories IS 'Dish type categorization (Veg/Non-Veg)';
COMMENT ON TABLE beverage_categories IS 'Beverage type categorization (Alcoholic/Non-Alcoholic)';
COMMENT ON TABLE pre_orders IS 'Pre-order system for Echelon tier reservations';
COMMENT ON TABLE pre_order_items IS 'Individual items in pre-orders';

-- Update existing menu items to have proper food categories
UPDATE menu_items 
SET food_category_id = (
    SELECT id FROM food_menu_categories 
    WHERE name = 'Main Course' 
    LIMIT 1
)
WHERE food_category_id IS NULL;

-- Add sample menu items with proper categorization
INSERT INTO menu_items (
    partner_id, 
    name, 
    description, 
    price, 
    food_category_id, 
    dish_category_id, 
    preparation_time,
    spice_level,
    is_chef_special
) VALUES 
-- Starters
((SELECT id FROM partners WHERE email LIKE '%bukhara%' LIMIT 1), 'Chicken Tikka', 'Tender chicken marinated in spices and grilled', 450.00, 
 (SELECT id FROM food_menu_categories WHERE name = 'Starters'), 
 (SELECT id FROM dish_categories WHERE name = 'Non-Vegetarian'), 20, 3, false),

-- Main Course
((SELECT id FROM partners WHERE email LIKE '%bukhara%' LIMIT 1), 'Butter Chicken', 'Creamy tomato-based curry with tender chicken', 550.00, 
 (SELECT id FROM food_menu_categories WHERE name = 'Main Course'), 
 (SELECT id FROM dish_categories WHERE name = 'Non-Vegetarian'), 25, 2, true),

-- Breads
((SELECT id FROM partners WHERE email LIKE '%bukhara%' LIMIT 1), 'Garlic Naan', 'Fresh baked bread with garlic and herbs', 80.00, 
 (SELECT id FROM food_menu_categories WHERE name = 'Breads'), 
 (SELECT id FROM dish_categories WHERE name = 'Vegetarian'), 10, 1, false),

-- Beverages
((SELECT id FROM partners WHERE email LIKE '%bukhara%' LIMIT 1), 'Mango Lassi', 'Refreshing yogurt drink with mango', 120.00, 
 (SELECT id FROM food_menu_categories WHERE name = 'Beverages'), 
 (SELECT id FROM beverage_categories WHERE name = 'Non-Alcoholic'), 5, 1, false)
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE name = 'Chicken Tikka');
