-- Event V2 Taxonomy - Comprehensive Event Classification System
-- This replaces the basic event categories with a multi-dimensional taxonomy

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS event_tag_mappings CASCADE;
DROP TABLE IF EXISTS event_attributes CASCADE;
DROP TABLE IF EXISTS event_tags CASCADE;
DROP TABLE IF EXISTS event_subcategories CASCADE;
DROP TABLE IF EXISTS event_categories CASCADE;

-- Event Categories Table (Primary Classification)
CREATE TABLE event_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    color VARCHAR(7), -- Hex color code
    parent_category_id UUID REFERENCES event_categories(id),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Event Subcategories Table
CREATE TABLE event_subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES event_categories(id) ON DELETE CASCADE,
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Event Tags Table (Tertiary Classification)
CREATE TABLE event_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    tag_type VARCHAR(50) NOT NULL, -- 'experience', 'feature', 'theme', 'benefit', etc.
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Event to Tag Mapping
CREATE TABLE event_tag_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES event_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(event_id, tag_id)
);

-- Event Attributes Table (Secondary Classification)
CREATE TABLE event_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    attribute_type VARCHAR(50) NOT NULL, -- 'format', 'duration', 'audience', etc.
    attribute_value VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(event_id, attribute_type)
);

-- Insert Main Event Categories
INSERT INTO event_categories (slug, name, description, icon, color, display_order) VALUES
('music', 'Music & Concerts', 'Live music, concerts, and musical performances', '🎵', '#FF6B6B', 1),
('performing_arts', 'Performing Arts', 'Theater, dance, comedy, and live performances', '🎭', '#4ECDC4', 2),
('sports', 'Sports & Recreation', 'Sports events, tournaments, and fitness activities', '⚽', '#45B7D1', 3),
('business', 'Business & Professional', 'Conferences, networking, and professional events', '💼', '#96CEB4', 4),
('food_beverage', 'Food & Beverage', 'Culinary events, tastings, and food festivals', '🍽️', '#FFEAA7', 5),
('arts_culture', 'Arts & Culture', 'Art exhibitions, cultural events, and creative activities', '🎨', '#DDA0DD', 6),
('community', 'Community & Social', 'Meetups, social events, and community gatherings', '🤝', '#98D8C8', 7),
('education', 'Education & Learning', 'Classes, workshops, and educational events', '📚', '#F7DC6F', 8),
('wellness', 'Health & Wellness', 'Fitness, wellness, and health-related events', '💪', '#BB8FCE', 9),
('family', 'Family & Kids', 'Family-friendly events and children''s activities', '👨‍👩‍👧‍👦', '#85C1E9', 10)
ON CONFLICT (slug) DO NOTHING;

-- Insert Music Subcategories
INSERT INTO event_subcategories (category_id, slug, name, description, display_order) VALUES
((SELECT id FROM event_categories WHERE slug = 'music'), 'rock_concert', 'Rock Concert', 'Rock and alternative music concerts', 1),
((SELECT id FROM event_categories WHERE slug = 'music'), 'pop_concert', 'Pop Concert', 'Pop music concerts and performances', 2),
((SELECT id FROM event_categories WHERE slug = 'music'), 'classical_music', 'Classical Music', 'Classical music concerts and performances', 3),
((SELECT id FROM event_categories WHERE slug = 'music'), 'jazz_blues', 'Jazz & Blues', 'Jazz and blues music events', 4),
((SELECT id FROM event_categories WHERE slug = 'music'), 'electronic_dj', 'Electronic/DJ', 'Electronic music and DJ performances', 5),
((SELECT id FROM event_categories WHERE slug = 'music'), 'hip_hop', 'Hip Hop', 'Hip hop and rap music events', 6),
((SELECT id FROM event_categories WHERE slug = 'music'), 'country', 'Country', 'Country music concerts and events', 7),
((SELECT id FROM event_categories WHERE slug = 'music'), 'folk_acoustic', 'Folk & Acoustic', 'Folk and acoustic music performances', 8),
((SELECT id FROM event_categories WHERE slug = 'music'), 'music_festival', 'Music Festival', 'Multi-day music festivals', 9)
ON CONFLICT (slug) DO NOTHING;

-- Insert Performing Arts Subcategories
INSERT INTO event_subcategories (category_id, slug, name, description, display_order) VALUES
((SELECT id FROM event_categories WHERE slug = 'performing_arts'), 'theater', 'Theater', 'Theater productions and plays', 1),
((SELECT id FROM event_categories WHERE slug = 'performing_arts'), 'musical_theater', 'Musical Theater', 'Musical theater and Broadway shows', 2),
((SELECT id FROM event_categories WHERE slug = 'performing_arts'), 'opera', 'Opera', 'Opera performances', 3),
((SELECT id FROM event_categories WHERE slug = 'performing_arts'), 'ballet', 'Ballet', 'Ballet performances and dance shows', 4),
((SELECT id FROM event_categories WHERE slug = 'performing_arts'), 'contemporary_dance', 'Contemporary Dance', 'Modern and contemporary dance performances', 5),
((SELECT id FROM event_categories WHERE slug = 'performing_arts'), 'standup_comedy', 'Stand-up Comedy', 'Stand-up comedy shows', 6),
((SELECT id FROM event_categories WHERE slug = 'performing_arts'), 'magic_show', 'Magic Show', 'Magic shows and illusion performances', 7),
((SELECT id FROM event_categories WHERE slug = 'performing_arts'), 'circus', 'Circus', 'Circus shows and acrobatic performances', 8)
ON CONFLICT (slug) DO NOTHING;

-- Insert Sports Subcategories
INSERT INTO event_subcategories (category_id, slug, name, description, display_order) VALUES
((SELECT id FROM event_categories WHERE slug = 'sports'), 'cricket_match', 'Cricket Match', 'Cricket matches and tournaments', 1),
((SELECT id FROM event_categories WHERE slug = 'sports'), 'football_soccer', 'Football/Soccer', 'Football and soccer matches', 2),
((SELECT id FROM event_categories WHERE slug = 'sports'), 'basketball', 'Basketball', 'Basketball games and tournaments', 3),
((SELECT id FROM event_categories WHERE slug = 'sports'), 'tennis', 'Tennis', 'Tennis matches and tournaments', 4),
((SELECT id FROM event_categories WHERE slug = 'sports'), 'marathon_race', 'Marathon/Race', 'Running events and marathons', 5),
((SELECT id FROM event_categories WHERE slug = 'sports'), 'esports', 'Esports', 'Electronic sports and gaming tournaments', 6),
((SELECT id FROM event_categories WHERE slug = 'sports'), 'combat_sports', 'Combat Sports', 'Boxing, MMA, and martial arts events', 7),
((SELECT id FROM event_categories WHERE slug = 'sports'), 'extreme_sports', 'Extreme Sports', 'Extreme sports and adventure activities', 8)
ON CONFLICT (slug) DO NOTHING;

-- Insert Business Subcategories
INSERT INTO event_subcategories (category_id, slug, name, description, display_order) VALUES
((SELECT id FROM event_categories WHERE slug = 'business'), 'conference', 'Conference', 'Business and professional conferences', 1),
((SELECT id FROM event_categories WHERE slug = 'business'), 'trade_show', 'Trade Show', 'Trade shows and exhibitions', 2),
((SELECT id FROM event_categories WHERE slug = 'business'), 'networking_event', 'Networking Event', 'Professional networking events', 3),
((SELECT id FROM event_categories WHERE slug = 'business'), 'workshop', 'Workshop', 'Professional workshops and training', 4),
((SELECT id FROM event_categories WHERE slug = 'business'), 'seminar', 'Seminar', 'Educational seminars and talks', 5),
((SELECT id FROM event_categories WHERE slug = 'business'), 'product_launch', 'Product Launch', 'Product launches and announcements', 6),
((SELECT id FROM event_categories WHERE slug = 'business'), 'career_fair', 'Career Fair', 'Job fairs and career events', 7),
((SELECT id FROM event_categories WHERE slug = 'business'), 'pitch_competition', 'Pitch Competition', 'Startup pitch competitions', 8)
ON CONFLICT (slug) DO NOTHING;

-- Insert Food & Beverage Subcategories
INSERT INTO event_subcategories (category_id, slug, name, description, display_order) VALUES
((SELECT id FROM event_categories WHERE slug = 'food_beverage'), 'food_festival', 'Food Festival', 'Food festivals and culinary events', 1),
((SELECT id FROM event_categories WHERE slug = 'food_beverage'), 'wine_tasting', 'Wine Tasting', 'Wine tastings and wine events', 2),
((SELECT id FROM event_categories WHERE slug = 'food_beverage'), 'beer_festival', 'Beer Festival', 'Beer festivals and craft beer events', 3),
((SELECT id FROM event_categories WHERE slug = 'food_beverage'), 'cooking_class', 'Cooking Class', 'Cooking classes and culinary workshops', 4),
((SELECT id FROM event_categories WHERE slug = 'food_beverage'), 'restaurant_popup', 'Restaurant Pop-up', 'Pop-up restaurants and temporary dining', 5),
((SELECT id FROM event_categories WHERE slug = 'food_beverage'), 'food_truck_rally', 'Food Truck Rally', 'Food truck gatherings and events', 6),
((SELECT id FROM event_categories WHERE slug = 'food_beverage'), 'culinary_competition', 'Culinary Competition', 'Cooking competitions and chef battles', 7)
ON CONFLICT (slug) DO NOTHING;

-- Insert Arts & Culture Subcategories
INSERT INTO event_subcategories (category_id, slug, name, description, display_order) VALUES
((SELECT id FROM event_categories WHERE slug = 'arts_culture'), 'art_exhibition', 'Art Exhibition', 'Art gallery exhibitions and openings', 1),
((SELECT id FROM event_categories WHERE slug = 'arts_culture'), 'film_screening', 'Film Screening', 'Movie screenings and film events', 2),
((SELECT id FROM event_categories WHERE slug = 'arts_culture'), 'film_festival', 'Film Festival', 'Film festivals and cinema events', 3),
((SELECT id FROM event_categories WHERE slug = 'arts_culture'), 'book_reading', 'Book Reading', 'Book readings and literary events', 4),
((SELECT id FROM event_categories WHERE slug = 'arts_culture'), 'literary_festival', 'Literary Festival', 'Literary festivals and writing events', 5),
((SELECT id FROM event_categories WHERE slug = 'arts_culture'), 'cultural_festival', 'Cultural Festival', 'Cultural festivals and heritage events', 6),
((SELECT id FROM event_categories WHERE slug = 'arts_culture'), 'museum_event', 'Museum Event', 'Museum exhibitions and cultural events', 7),
((SELECT id FROM event_categories WHERE slug = 'arts_culture'), 'gallery_opening', 'Gallery Opening', 'Art gallery openings and exhibitions', 8)
ON CONFLICT (slug) DO NOTHING;

-- Insert Community Subcategories
INSERT INTO event_subcategories (category_id, slug, name, description, display_order) VALUES
((SELECT id FROM event_categories WHERE slug = 'community'), 'meetup', 'Meetup', 'Interest-based meetups and gatherings', 1),
((SELECT id FROM event_categories WHERE slug = 'community'), 'social_mixer', 'Social Mixer', 'Social networking and mixer events', 2),
((SELECT id FROM event_categories WHERE slug = 'community'), 'charity_event', 'Charity Event', 'Charity fundraisers and volunteer events', 3),
((SELECT id FROM event_categories WHERE slug = 'community'), 'fundraiser', 'Fundraiser', 'Fundraising events and campaigns', 4),
((SELECT id FROM event_categories WHERE slug = 'community'), 'volunteer_activity', 'Volunteer Activity', 'Volunteer opportunities and community service', 5),
((SELECT id FROM event_categories WHERE slug = 'community'), 'religious_event', 'Religious Event', 'Religious ceremonies and spiritual events', 6),
((SELECT id FROM event_categories WHERE slug = 'community'), 'holiday_celebration', 'Holiday Celebration', 'Holiday celebrations and seasonal events', 7),
((SELECT id FROM event_categories WHERE slug = 'community'), 'block_party', 'Block Party', 'Community block parties and neighborhood events', 8)
ON CONFLICT (slug) DO NOTHING;

-- Insert Education Subcategories
INSERT INTO event_subcategories (category_id, slug, name, description, display_order) VALUES
((SELECT id FROM event_categories WHERE slug = 'education'), 'class_course', 'Class/Course', 'Educational classes and courses', 1),
((SELECT id FROM event_categories WHERE slug = 'education'), 'lecture', 'Lecture', 'Educational lectures and talks', 2),
((SELECT id FROM event_categories WHERE slug = 'education'), 'tutorial', 'Tutorial', 'Tutorial sessions and workshops', 3),
((SELECT id FROM event_categories WHERE slug = 'education'), 'study_group', 'Study Group', 'Study groups and learning sessions', 4),
((SELECT id FROM event_categories WHERE slug = 'education'), 'hackathon', 'Hackathon', 'Programming and tech hackathons', 5),
((SELECT id FROM event_categories WHERE slug = 'education'), 'science_fair', 'Science Fair', 'Science fairs and STEM events', 6),
((SELECT id FROM event_categories WHERE slug = 'education'), 'academic_conference', 'Academic Conference', 'Academic conferences and research events', 7)
ON CONFLICT (slug) DO NOTHING;

-- Insert Wellness Subcategories
INSERT INTO event_subcategories (category_id, slug, name, description, display_order) VALUES
((SELECT id FROM event_categories WHERE slug = 'wellness'), 'yoga_class', 'Yoga Class', 'Yoga classes and workshops', 1),
((SELECT id FROM event_categories WHERE slug = 'wellness'), 'meditation_session', 'Meditation Session', 'Meditation and mindfulness sessions', 2),
((SELECT id FROM event_categories WHERE slug = 'wellness'), 'fitness_class', 'Fitness Class', 'Fitness classes and workout sessions', 3),
((SELECT id FROM event_categories WHERE slug = 'wellness'), 'health_seminar', 'Health Seminar', 'Health and wellness seminars', 4),
((SELECT id FROM event_categories WHERE slug = 'wellness'), 'wellness_retreat', 'Wellness Retreat', 'Wellness retreats and spa events', 5),
((SELECT id FROM event_categories WHERE slug = 'wellness'), 'mental_health_workshop', 'Mental Health Workshop', 'Mental health and wellness workshops', 6)
ON CONFLICT (slug) DO NOTHING;

-- Insert Family Subcategories
INSERT INTO event_subcategories (category_id, slug, name, description, display_order) VALUES
((SELECT id FROM event_categories WHERE slug = 'family'), 'kids_workshop', 'Kids Workshop', 'Children''s workshops and activities', 1),
((SELECT id FROM event_categories WHERE slug = 'family'), 'family_festival', 'Family Festival', 'Family-friendly festivals and events', 2),
((SELECT id FROM event_categories WHERE slug = 'family'), 'childrens_theater', 'Children''s Theater', 'Children''s theater and entertainment', 3),
((SELECT id FROM event_categories WHERE slug = 'family'), 'educational_program', 'Educational Program', 'Educational programs for children', 4),
((SELECT id FROM event_categories WHERE slug = 'family'), 'birthday_party', 'Birthday Party', 'Birthday party events and celebrations', 5),
((SELECT id FROM event_categories WHERE slug = 'family'), 'story_time', 'Story Time', 'Story time and reading events', 6)
ON CONFLICT (slug) DO NOTHING;

-- Insert Event Tags
INSERT INTO event_tags (slug, name, tag_type, description) VALUES
-- Experience Tags
('interactive', 'Interactive', 'experience', 'Hands-on and interactive experience'),
('educational', 'Educational', 'experience', 'Learning and educational content'),
('entertaining', 'Entertaining', 'experience', 'Fun and entertaining experience'),
('networking', 'Networking', 'experience', 'Professional networking opportunity'),
('hands_on', 'Hands-on', 'experience', 'Practical, hands-on learning'),

-- Feature Tags
('celebrity_appearance', 'Celebrity Appearance', 'feature', 'Celebrity guest or performer'),
('live_music', 'Live Music', 'feature', 'Live musical performance'),
('food_included', 'Food Included', 'feature', 'Food and meals provided'),
('drinks_included', 'Drinks Included', 'feature', 'Beverages and drinks provided'),
('merchandise_available', 'Merchandise Available', 'feature', 'Event merchandise for purchase'),
('photo_opportunity', 'Photo Opportunity', 'feature', 'Photo opportunities with performers/guests'),
('meet_greet', 'Meet & Greet', 'feature', 'Meet and greet with performers/guests'),

-- Theme Tags
('seasonal', 'Seasonal', 'theme', 'Seasonal or holiday themed'),
('holiday_themed', 'Holiday Themed', 'theme', 'Holiday celebration theme'),
('retro', 'Retro', 'theme', 'Retro or vintage theme'),
('modern', 'Modern', 'theme', 'Contemporary and modern theme'),
('traditional', 'Traditional', 'theme', 'Traditional cultural theme'),
('experimental', 'Experimental', 'theme', 'Experimental or avant-garde theme'),

-- Benefit Tags
('certificate_provided', 'Certificate Provided', 'benefit', 'Certificate or completion document'),
('cpd_credits', 'CPD Credits', 'benefit', 'Continuing Professional Development credits'),
('networking_opportunity', 'Networking Opportunity', 'benefit', 'Professional networking benefits'),
('career_advancement', 'Career Advancement', 'benefit', 'Career development opportunity'),
('skill_building', 'Skill Building', 'benefit', 'Skill development and learning'),

-- Special Occasion Tags
('date_night', 'Date Night', 'occasion', 'Perfect for romantic dates'),
('team_building', 'Team Building', 'occasion', 'Corporate team building event'),
('corporate_outing', 'Corporate Outing', 'occasion', 'Corporate group event'),
('birthday_celebration', 'Birthday Celebration', 'occasion', 'Birthday party or celebration'),
('anniversary', 'Anniversary', 'occasion', 'Anniversary celebration'),

-- Unique Selling Point Tags
('limited_capacity', 'Limited Capacity', 'usp', 'Limited number of attendees'),
('exclusive', 'Exclusive', 'usp', 'Exclusive or invitation-only event'),
('first_time_city', 'First Time in City', 'usp', 'First time this event is held in the city'),
('last_chance', 'Last Chance', 'usp', 'Final opportunity to attend'),
('early_bird_pricing', 'Early Bird Pricing', 'usp', 'Discounted early bird tickets available'),
('group_discounts', 'Group Discounts', 'usp', 'Special pricing for groups')
ON CONFLICT (slug) DO NOTHING;

-- Create Indexes for Performance
CREATE INDEX idx_event_categories_parent ON event_categories(parent_category_id);
CREATE INDEX idx_event_categories_active ON event_categories(is_active);
CREATE INDEX idx_event_categories_display_order ON event_categories(display_order);

CREATE INDEX idx_event_subcategories_category ON event_subcategories(category_id);
CREATE INDEX idx_event_subcategories_active ON event_subcategories(is_active);
CREATE INDEX idx_event_subcategories_display_order ON event_subcategories(display_order);

CREATE INDEX idx_event_tags_type ON event_tags(tag_type);
CREATE INDEX idx_event_tags_active ON event_tags(is_active);

CREATE INDEX idx_event_tag_mappings_event ON event_tag_mappings(event_id);
CREATE INDEX idx_event_tag_mappings_tag ON event_tag_mappings(tag_id);

CREATE INDEX idx_event_attributes_event ON event_attributes(event_id);
CREATE INDEX idx_event_attributes_type ON event_attributes(attribute_type);

-- Add Comments for Documentation
COMMENT ON TABLE event_categories IS 'Primary event classification categories';
COMMENT ON TABLE event_subcategories IS 'Secondary classification within categories';
COMMENT ON TABLE event_tags IS 'Tertiary classification tags for specific features and themes';
COMMENT ON TABLE event_tag_mappings IS 'Many-to-many mapping between events and tags';
COMMENT ON TABLE event_attributes IS 'Event attributes like format, duration, audience, etc.';




