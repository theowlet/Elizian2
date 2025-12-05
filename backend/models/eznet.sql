-- EZNet Database Schema
-- Events, Bookings, Venues, Reviews tables

-- Create venues table
CREATE TABLE IF NOT EXISTS venues (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    max_capacity INTEGER,
    category_id UUID REFERENCES categories(id),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    amenities JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    max_capacity INTEGER,
    price_per_ticket DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed', 'postponed')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    num_tickets INTEGER NOT NULL CHECK (num_tickets > 0),
    total_price DECIMAL(10, 2) NOT NULL,
    special_requests TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'refunded')),
    booking_reference VARCHAR(50) UNIQUE,
    confirmed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    venue_id INTEGER REFERENCES venues(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    photos JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, venue_id), -- One review per user per venue
    UNIQUE(user_id, event_id)  -- One review per user per event
);

-- Create review_likes table
CREATE TABLE IF NOT EXISTS review_likes (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    review_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, review_id)
);

-- Create event_categories table (if not exists in main schema)
CREATE TABLE IF NOT EXISTS event_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(100),
    color VARCHAR(7), -- Hex color code
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_category ON venues(category_id);
CREATE INDEX IF NOT EXISTS idx_venues_location ON venues(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category_id);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event ON bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(booking_reference);

CREATE INDEX IF NOT EXISTS idx_reviews_venue ON reviews(venue_id);
CREATE INDEX IF NOT EXISTS idx_reviews_event ON reviews(event_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);

CREATE INDEX IF NOT EXISTS idx_review_likes_user ON review_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_review_likes_review ON review_likes(review_id);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample event categories
INSERT INTO event_categories (name, slug, description, icon, color) VALUES
('Music & Concerts', 'music-concerts', 'Live music performances and concerts', '🎵', '#FF6B6B'),
('Sports & Fitness', 'sports-fitness', 'Sports events and fitness activities', '⚽', '#4ECDC4'),
('Food & Dining', 'food-dining', 'Food festivals and dining events', '🍽️', '#45B7D1'),
('Art & Culture', 'art-culture', 'Art exhibitions and cultural events', '🎨', '#96CEB4'),
('Technology', 'technology', 'Tech meetups and conferences', '💻', '#FFEAA7'),
('Business & Networking', 'business-networking', 'Business events and networking', '🤝', '#DDA0DD'),
('Education & Learning', 'education-learning', 'Educational workshops and seminars', '📚', '#98D8C8'),
('Entertainment', 'entertainment', 'Entertainment shows and performances', '🎭', '#F7DC6F')
ON CONFLICT (name) DO NOTHING;

-- Insert sample venues
-- INSERT INTO venues (name, description, address, city, state, max_capacity, category_id, latitude, longitude, amenities) VALUES
-- ('Convention Center Delhi', 'Large convention center for events', 'Pragati Maidan, New Delhi', 'Delhi', 'Delhi', 5000, 1, 28.6139, 77.2090, '["Parking", "WiFi", "Catering", "Audio/Visual"]'),
-- ('Mumbai Sports Complex', 'Multi-purpose sports venue', 'Bandra Kurla Complex, Mumbai', 'Mumbai', 'Maharashtra', 3000, 2, 19.0760, 72.8777, '["Parking", "Changing Rooms", "First Aid"]'),
-- ('Bangalore Tech Hub', 'Modern tech conference center', 'Electronic City, Bangalore', 'Bangalore', 'Karnataka', 1000, 5, 12.9716, 77.5946, '["WiFi", "Projectors", "Recording Equipment"]'),
-- ('Chennai Cultural Center', 'Traditional cultural venue', 'T. Nagar, Chennai', 'Chennai', 'Tamil Nadu', 800, 4, 13.0827, 80.2707, '["Air Conditioning", "Sound System"]')
-- ON CONFLICT DO NOTHING;

-- INSERT INTO venues (name, ..., category_id, ...) New VALUES

INSERT INTO venues (name, description, address, city, state, max_capacity, category_id, latitude, longitude, amenities) VALUES
('Convention Center Delhi', 'Large convention center for events', 'Pragati Maidan, New Delhi', 'Delhi', 'Delhi', 5000, '4e164ead-56c7-4622-8ca2-463978e46b50', 28.6139, 77.2090, '["Parking", "WiFi", "Catering", "Audio/Visual"]'),
('Mumbai Sports Complex', 'Multi-purpose sports venue', 'Bandra Kurla Complex, Mumbai', 'Mumbai', 'Maharashtra', 3000, 'bafee63f-0291-444a-b0a5-8b12f41e5dda', 19.0760, 72.8777, '["Parking", "Changing Rooms", "First Aid"]'),
('Bangalore Tech Hub', 'Modern tech conference center', 'Electronic City, Bangalore', 'Bangalore', 'Karnataka', 1000, 'b7c01d87-06bd-4b8a-aca6-ecf7adf13cac', 12.9716, 77.5946, '["WiFi", "Projectors", "Recording Equipment"]'),
('Chennai Cultural Center', 'Traditional cultural venue', 'T. Nagar, Chennai', 'Chennai', 'Tamil Nadu', 800, '31416568-2691-4548-bab5-b8f2646617eb', 13.0827, 80.2707, '["Air Conditioning", "Sound System"]')
ON CONFLICT DO NOTHING;

-- Insert sample events
-- INSERT INTO events (title, description, venue_id, category_id, start_time, end_time, max_capacity, price_per_ticket, status) VALUES
-- ('Tech Conference 2025', 'Annual technology conference', 3, 5, '2025-03-15 09:00:00', '2025-03-15 18:00:00', 500, 2500.00, 'active'),
-- ('Music Festival Delhi', 'Live music festival', 1, 1, '2025-04-20 19:00:00', '2025-04-20 23:00:00', 3000, 1500.00, 'active'),
-- ('Sports Championship', 'Regional sports championship', 2, 2, '2025-05-10 08:00:00', '2025-05-10 20:00:00', 2000, 500.00, 'active'),
-- ('Cultural Exhibition', 'Traditional art and culture exhibition', 4, 4, '2025-06-05 10:00:00', '2025-06-05 18:00:00', 400, 300.00, 'active')
-- ON CONFLICT DO NOTHING;
-- Insert sample events (FIXED: Using UUID strings for Foreign Keys)
INSERT INTO events (title, description, venue_id, category_id, start_time, end_time, max_capacity, price_per_ticket, status) VALUES
(
    'Tech Conference 2025', 
    'Annual technology conference', 
    '13', -- VENUE ID 3: Bangalore Tech Hub
    '4e164ead-56c7-4622-8ca2-463978e46b50', -- CATEGORY ID 5: Tech
    '2025-03-15 09:00:00', 
    '2025-03-15 18:00:00', 
    500, 
    2500.00, 
    'active'
),
(
    'Music Festival Delhi', 
    'Live music festival', 
    '14', -- VENUE ID 1: Convention Center Delhi
    'bafee63f-0291-444a-b0a5-8b12f41e5dda', -- CATEGORY ID 1: Music
    '2025-04-20 19:00:00', 
    '2025-04-20 23:00:00', 
    3000, 
    1500.00, 
    'active'
),
(
    'Sports Championship', 
    'Regional sports championship', 
    '15', -- VENUE ID 2: Mumbai Sports Complex
    'b7c01d87-06bd-4b8a-aca6-ecf7adf13cac', -- CATEGORY ID 2: Sports
    '2025-05-10 08:00:00', 
    '2025-05-10 20:00:00', 
    2000, 
    500.00, 
    'active'
),
(
    'Cultural Exhibition', 
    'Traditional art and culture exhibition', 
    '16', -- VENUE ID 4: Chennai Cultural Center
    '31416568-2691-4548-bab5-b8f2646617eb', -- CATEGORY ID 4: Culture
    '2025-06-05 10:00:00', 
    '2025-06-05 18:00:00', 
    400, 
    300.00, 
    'active'
)
ON CONFLICT DO NOTHING;