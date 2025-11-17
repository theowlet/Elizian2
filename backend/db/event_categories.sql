-- Event Categories for Events & Experiences Platform
-- Comprehensive event taxonomy for better categorization and discovery

-- Create event categories table
CREATE TABLE IF NOT EXISTS event_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50), -- Icon class or emoji
    color VARCHAR(7), -- Hex color code
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    parent_category_id UUID REFERENCES event_categories(id), -- For subcategories
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create event subcategories table for more specific categorization
CREATE TABLE IF NOT EXISTS event_subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    event_category_id UUID NOT NULL REFERENCES event_categories(id),
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert main event categories
INSERT INTO event_categories (name, slug, description, icon, color, display_order) VALUES
('Music', 'music', 'Concerts, live music, DJ sets, and musical performances', '🎵', '#FF6B6B', 1),
('Nightlife', 'nightlife', 'Clubs, bars, parties, and late-night entertainment', '🌙', '#4ECDC4', 2),
('Comedy', 'comedy', 'Stand-up comedy, improv shows, and comedy events', '😂', '#45B7D1', 3),
('Sports', 'sports', 'Sports events, tournaments, and fitness activities', '⚽', '#96CEB4', 4),
('Performances', 'performances', 'Theater, dance, and live performances', '🎭', '#FFEAA7', 5),
('Food & Drinks', 'food-drinks', 'Food festivals, wine tastings, and culinary events', '🍽️', '#DDA0DD', 6),
('Fests & Fairs', 'fests-fairs', 'Festivals, fairs, and community celebrations', '🎪', '#98D8C8', 7),
('Social Mixers', 'social-mixers', 'Networking events, meetups, and social gatherings', '🤝', '#F7DC6F', 8),
('Screenings', 'screenings', 'Movie screenings, TV show premieres, and film events', '🎬', '#BB8FCE', 9),
('Fitness Events', 'fitness-events', 'Workout classes, marathons, and fitness challenges', '💪', '#85C1E9', 10),
('Art Exhibitions', 'art-exhibitions', 'Art galleries, exhibitions, and cultural events', '🎨', '#F8C471', 11),
('Conferences', 'conferences', 'Business conferences, seminars, and professional events', '💼', '#82E0AA', 12)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Music
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Rock & Alternative', 'rock-alternative', 'Rock, alternative, and indie music events', 
 (SELECT id FROM event_categories WHERE slug = 'music'), 1),
('Electronic & EDM', 'electronic-edm', 'Electronic music, EDM, and dance events', 
 (SELECT id FROM event_categories WHERE slug = 'music'), 2),
('Hip Hop & Rap', 'hip-hop-rap', 'Hip hop, rap, and urban music events', 
 (SELECT id FROM event_categories WHERE slug = 'music'), 3),
('Jazz & Blues', 'jazz-blues', 'Jazz, blues, and soul music events', 
 (SELECT id FROM event_categories WHERE slug = 'music'), 4),
('Classical & Opera', 'classical-opera', 'Classical music and opera performances', 
 (SELECT id FROM event_categories WHERE slug = 'music'), 5),
('World Music', 'world-music', 'International and world music events', 
 (SELECT id FROM event_categories WHERE slug = 'music'), 6),
('Pop & Mainstream', 'pop-mainstream', 'Pop music and mainstream concerts', 
 (SELECT id FROM event_categories WHERE slug = 'music'), 7)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Nightlife
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Club Events', 'club-events', 'Nightclub parties and events', 
 (SELECT id FROM event_categories WHERE slug = 'nightlife'), 1),
('Bar Events', 'bar-events', 'Bar parties, happy hours, and social events', 
 (SELECT id FROM event_categories WHERE slug = 'nightlife'), 2),
('Rooftop Parties', 'rooftop-parties', 'Rooftop and outdoor nightlife events', 
 (SELECT id FROM event_categories WHERE slug = 'nightlife'), 3),
('Pool Parties', 'pool-parties', 'Pool parties and summer nightlife', 
 (SELECT id FROM event_categories WHERE slug = 'nightlife'), 4),
('Themed Parties', 'themed-parties', 'Costume parties and themed events', 
 (SELECT id FROM event_categories WHERE slug = 'nightlife'), 5)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Comedy
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Stand-up Comedy', 'stand-up-comedy', 'Stand-up comedy shows and performances', 
 (SELECT id FROM event_categories WHERE slug = 'comedy'), 1),
('Improv Shows', 'improv-shows', 'Improvisational comedy and theater', 
 (SELECT id FROM event_categories WHERE slug = 'comedy'), 2),
('Comedy Festivals', 'comedy-festivals', 'Comedy festivals and multi-day events', 
 (SELECT id FROM event_categories WHERE slug = 'comedy'), 3),
('Open Mic Nights', 'open-mic-nights', 'Open mic comedy and amateur shows', 
 (SELECT id FROM event_categories WHERE slug = 'comedy'), 4),
('Comedy Workshops', 'comedy-workshops', 'Comedy writing and performance workshops', 
 (SELECT id FROM event_categories WHERE slug = 'comedy'), 5)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Sports
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Football/Soccer', 'football-soccer', 'Football and soccer events', 
 (SELECT id FROM event_categories WHERE slug = 'sports'), 1),
('Basketball', 'basketball', 'Basketball games and tournaments', 
 (SELECT id FROM event_categories WHERE slug = 'sports'), 2),
('Tennis', 'tennis', 'Tennis matches and tournaments', 
 (SELECT id FROM event_categories WHERE slug = 'sports'), 3),
('Cricket', 'cricket', 'Cricket matches and tournaments', 
 (SELECT id FROM event_categories WHERE slug = 'sports'), 4),
('Marathon & Running', 'marathon-running', 'Running events and marathons', 
 (SELECT id FROM event_categories WHERE slug = 'sports'), 5),
('Swimming', 'swimming', 'Swimming competitions and events', 
 (SELECT id FROM event_categories WHERE slug = 'sports'), 6),
('Cycling', 'cycling', 'Cycling events and races', 
 (SELECT id FROM event_categories WHERE slug = 'sports'), 7),
('Other Sports', 'other-sports', 'Other sports and athletic events', 
 (SELECT id FROM event_categories WHERE slug = 'sports'), 8)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Performances
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Theater', 'theater', 'Theater productions and plays', 
 (SELECT id FROM event_categories WHERE slug = 'performances'), 1),
('Dance', 'dance', 'Dance performances and shows', 
 (SELECT id FROM event_categories WHERE slug = 'performances'), 2),
('Musical Theater', 'musical-theater', 'Musical theater and Broadway shows', 
 (SELECT id FROM event_categories WHERE slug = 'performances'), 3),
('Circus & Acrobatics', 'circus-acrobatics', 'Circus shows and acrobatic performances', 
 (SELECT id FROM event_categories WHERE slug = 'performances'), 4),
('Magic Shows', 'magic-shows', 'Magic shows and illusion performances', 
 (SELECT id FROM event_categories WHERE slug = 'performances'), 5),
('Puppet Shows', 'puppet-shows', 'Puppet shows and children''s theater', 
 (SELECT id FROM event_categories WHERE slug = 'performances'), 6)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Food & Drinks
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Food Festivals', 'food-festivals', 'Food festivals and culinary events', 
 (SELECT id FROM event_categories WHERE slug = 'food-drinks'), 1),
('Wine Tastings', 'wine-tastings', 'Wine tastings and wine events', 
 (SELECT id FROM event_categories WHERE slug = 'food-drinks'), 2),
('Beer Festivals', 'beer-festivals', 'Beer festivals and craft beer events', 
 (SELECT id FROM event_categories WHERE slug = 'food-drinks'), 3),
('Cooking Classes', 'cooking-classes', 'Cooking classes and culinary workshops', 
 (SELECT id FROM event_categories WHERE slug = 'food-drinks'), 4),
('Food Tours', 'food-tours', 'Food tours and culinary experiences', 
 (SELECT id FROM event_categories WHERE slug = 'food-drinks'), 5),
('Chef Demonstrations', 'chef-demonstrations', 'Chef demonstrations and masterclasses', 
 (SELECT id FROM event_categories WHERE slug = 'food-drinks'), 6)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Fests & Fairs
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Cultural Festivals', 'cultural-festivals', 'Cultural and traditional festivals', 
 (SELECT id FROM event_categories WHERE slug = 'fests-fairs'), 1),
('Art Fairs', 'art-fairs', 'Art fairs and craft markets', 
 (SELECT id FROM event_categories WHERE slug = 'fests-fairs'), 2),
('Music Festivals', 'music-festivals', 'Multi-day music festivals', 
 (SELECT id FROM event_categories WHERE slug = 'fests-fairs'), 3),
('Street Fairs', 'street-fairs', 'Street fairs and community events', 
 (SELECT id FROM event_categories WHERE slug = 'fests-fairs'), 4),
('Seasonal Festivals', 'seasonal-festivals', 'Seasonal and holiday festivals', 
 (SELECT id FROM event_categories WHERE slug = 'fests-fairs'), 5),
('Carnivals', 'carnivals', 'Carnivals and fun fairs', 
 (SELECT id FROM event_categories WHERE slug = 'fests-fairs'), 6)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Social Mixers
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Networking Events', 'networking-events', 'Professional networking and business events', 
 (SELECT id FROM event_categories WHERE slug = 'social-mixers'), 1),
('Meetups', 'meetups', 'Interest-based meetups and gatherings', 
 (SELECT id FROM event_categories WHERE slug = 'social-mixers'), 2),
('Speed Dating', 'speed-dating', 'Speed dating and singles events', 
 (SELECT id FROM event_categories WHERE slug = 'social-mixers'), 3),
('Community Events', 'community-events', 'Community gatherings and local events', 
 (SELECT id FROM event_categories WHERE slug = 'social-mixers'), 4),
('Language Exchange', 'language-exchange', 'Language exchange and learning events', 
 (SELECT id FROM event_categories WHERE slug = 'social-mixers'), 5),
('Hobby Groups', 'hobby-groups', 'Hobby-based social groups and events', 
 (SELECT id FROM event_categories WHERE slug = 'social-mixers'), 6)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Screenings
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Movie Premieres', 'movie-premieres', 'Movie premieres and red carpet events', 
 (SELECT id FROM event_categories WHERE slug = 'screenings'), 1),
('Film Festivals', 'film-festivals', 'Film festivals and cinema events', 
 (SELECT id FROM event_categories WHERE slug = 'screenings'), 2),
('TV Show Premieres', 'tv-premieres', 'TV show premieres and screenings', 
 (SELECT id FROM event_categories WHERE slug = 'screenings'), 3),
('Documentary Screenings', 'documentary-screenings', 'Documentary film screenings', 
 (SELECT id FROM event_categories WHERE slug = 'screenings'), 4),
('Outdoor Screenings', 'outdoor-screenings', 'Outdoor movie screenings and drive-ins', 
 (SELECT id FROM event_categories WHERE slug = 'screenings'), 5),
('Sports Screenings', 'sports-screenings', 'Sports game screenings and viewing parties', 
 (SELECT id FROM event_categories WHERE slug = 'screenings'), 6)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Fitness Events
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Yoga Classes', 'yoga-classes', 'Yoga classes and workshops', 
 (SELECT id FROM event_categories WHERE slug = 'fitness-events'), 1),
('Marathons', 'marathons', 'Marathons and long-distance running events', 
 (SELECT id FROM event_categories WHERE slug = 'fitness-events'), 2),
('Cycling Events', 'cycling-events', 'Cycling races and bike events', 
 (SELECT id FROM event_categories WHERE slug = 'fitness-events'), 3),
('Swimming Competitions', 'swimming-competitions', 'Swimming competitions and water sports', 
 (SELECT id FROM event_categories WHERE slug = 'fitness-events'), 4),
('Fitness Challenges', 'fitness-challenges', 'Fitness challenges and competitions', 
 (SELECT id FROM event_categories WHERE slug = 'fitness-events'), 5),
('Group Workouts', 'group-workouts', 'Group fitness classes and workouts', 
 (SELECT id FROM event_categories WHERE slug = 'fitness-events'), 6),
('Outdoor Activities', 'outdoor-activities', 'Hiking, climbing, and outdoor fitness', 
 (SELECT id FROM event_categories WHERE slug = 'fitness-events'), 7)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Art Exhibitions
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Art Galleries', 'art-galleries', 'Art gallery exhibitions and openings', 
 (SELECT id FROM event_categories WHERE slug = 'art-exhibitions'), 1),
('Museum Exhibitions', 'museum-exhibitions', 'Museum exhibitions and cultural events', 
 (SELECT id FROM event_categories WHERE slug = 'art-exhibitions'), 2),
('Street Art Tours', 'street-art-tours', 'Street art tours and graffiti events', 
 (SELECT id FROM event_categories WHERE slug = 'art-exhibitions'), 3),
('Art Workshops', 'art-workshops', 'Art workshops and creative classes', 
 (SELECT id FROM event_categories WHERE slug = 'art-exhibitions'), 4),
('Photography Exhibitions', 'photography-exhibitions', 'Photography exhibitions and shows', 
 (SELECT id FROM event_categories WHERE slug = 'art-exhibitions'), 5),
('Sculpture Exhibitions', 'sculpture-exhibitions', 'Sculpture and 3D art exhibitions', 
 (SELECT id FROM event_categories WHERE slug = 'art-exhibitions'), 6),
('Digital Art', 'digital-art', 'Digital art exhibitions and tech art', 
 (SELECT id FROM event_categories WHERE slug = 'art-exhibitions'), 7)
ON CONFLICT (slug) DO NOTHING;

-- Insert subcategories for Conferences
INSERT INTO event_subcategories (name, slug, description, event_category_id, display_order) VALUES
('Business Conferences', 'business-conferences', 'Business and corporate conferences', 
 (SELECT id FROM event_categories WHERE slug = 'conferences'), 1),
('Tech Conferences', 'tech-conferences', 'Technology and innovation conferences', 
 (SELECT id FROM event_categories WHERE slug = 'conferences'), 2),
('Academic Conferences', 'academic-conferences', 'Academic and research conferences', 
 (SELECT id FROM event_categories WHERE slug = 'conferences'), 3),
('Industry Seminars', 'industry-seminars', 'Industry-specific seminars and workshops', 
 (SELECT id FROM event_categories WHERE slug = 'conferences'), 4),
('Startup Events', 'startup-events', 'Startup pitch events and entrepreneurship', 
 (SELECT id FROM event_categories WHERE slug = 'conferences'), 5),
('Professional Development', 'professional-development', 'Professional development and training', 
 (SELECT id FROM event_categories WHERE slug = 'conferences'), 6),
('Trade Shows', 'trade-shows', 'Trade shows and industry exhibitions', 
 (SELECT id FROM event_categories WHERE slug = 'conferences'), 7)
ON CONFLICT (slug) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_event_categories_slug ON event_categories(slug);
CREATE INDEX IF NOT EXISTS idx_event_categories_active ON event_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_event_categories_display_order ON event_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_event_subcategories_category ON event_subcategories(event_category_id);
CREATE INDEX IF NOT EXISTS idx_event_subcategories_slug ON event_subcategories(slug);
CREATE INDEX IF NOT EXISTS idx_event_subcategories_active ON event_subcategories(is_active);

-- Add comments for documentation
COMMENT ON TABLE event_categories IS 'Main event categories for the Events & Experiences platform';
COMMENT ON TABLE event_subcategories IS 'Subcategories for more specific event classification';
COMMENT ON COLUMN event_categories.icon IS 'Icon class or emoji for visual representation';
COMMENT ON COLUMN event_categories.color IS 'Hex color code for category theming';
COMMENT ON COLUMN event_categories.parent_category_id IS 'Self-referencing for category hierarchies';
