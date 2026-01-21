-- ============================================
-- SERVICE SUBCATEGORIES TABLE (ISO/ISIC ALIGNED)
-- Implements ISO 18513:2003, ISIC Rev.4, WHO Global Wellness Economy, UNWTO standards
-- ============================================

-- Drop existing table (if exists) to recreate with ISO schema
DROP TABLE IF EXISTS service_subcategories CASCADE;

-- Create the table with ISO-compliant schema
CREATE TABLE service_subcategories (
  id SERIAL PRIMARY KEY,
  service_type VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  iso_reference VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_service_subcategories_type ON service_subcategories(service_type);
CREATE INDEX idx_service_subcategories_active ON service_subcategories(is_active);

-- ============================================
-- SEED DATA: ISO/ISIC-ALIGNED SUBCATEGORIES
-- ============================================

-- EVENTS (ISO 18513:2003, NAICS 7113)
INSERT INTO service_subcategories (service_type, name, description, iso_reference) VALUES
('events', 'Corporate / Business Events (MICE)', 'Conferences, trade fairs, product launches', 'ISO 18513:2003 §3.8'),
('events', 'Social Events', 'Weddings, birthdays, family gatherings', 'ISO 18513:2003 §3.12'),
('events', 'Cultural & Entertainment Events', 'Concerts, theater, film screenings, comedy nights', 'NAICS 7113'),
('events', 'Educational Events & Workshops', 'Seminars, lectures, and training sessions', 'ISIC 8559'),
('events', 'Sports & Fitness Events', 'Marathons, tournaments, yoga camps', 'ISIC 9319'),
('events', 'Festivals & Fairs', 'Art, craft, and food festivals', 'ISO 18513:2003 §3.9'),
('events', 'Charity & Fundraisers', 'Community and non-profit fundraising events', 'ISIC 8899');

-- SPA & SALON (ISIC 9602)
INSERT INTO service_subcategories (service_type, name, description, iso_reference) VALUES
('spa-and-salon', 'Hairdressing & Styling', 'Haircuts, coloring, and styling', 'ISIC 9602'),
('spa-and-salon', 'Facial & Skincare Treatments', 'Facials, exfoliation, peels', 'ISIC 9602'),
('spa-and-salon', 'Massage & Body Therapy', 'Swedish, Thai, deep tissue massage', 'ISO 18513:2003 §3.13'),
('spa-and-salon', 'Aromatherapy & Reflexology', 'Essential oil and reflex point therapies', 'ISIC 9604'),
('spa-and-salon', 'Nail Care & Beauty', 'Manicure, pedicure, nail art', 'ISIC 9602'),
('spa-and-salon', 'Make-up & Grooming', 'Make-up, waxing, bridal grooming', 'ISIC 9602'),
('spa-and-salon', 'Men''s Grooming & Barber Services', 'Beard styling, shaves, trims', 'ISIC 9602'),
('spa-and-salon', 'Spa Packages & Day Spa', 'Full-day spa and relaxation packages', 'ISO 18513:2003 §3.13');

-- WELLNESS (WHO Global Wellness Economy, ISIC 8690)
INSERT INTO service_subcategories (service_type, name, description, iso_reference) VALUES
('wellness', 'Yoga & Meditation', 'Group and guided meditation sessions', 'WHO GWI §2.1'),
('wellness', 'Ayurveda & Traditional Medicine', 'Panchakarma, Siddha, Unani treatments', 'WHO GWI §2.3'),
('wellness', 'Rehabilitation & Physiotherapy', 'Post-injury or post-surgery rehabilitation', 'ISIC 8690'),
('wellness', 'Holistic Healing & Energy Work', 'Reiki, sound healing, crystal therapy', 'WHO GWI §3.1'),
('wellness', 'Mental Wellness & Counseling', 'Therapy, life coaching, mental health sessions', 'WHO GWI §4.2'),
('wellness', 'Nutrition & Diet Counseling', 'Personalized nutrition and weight plans', 'WHO GWI §2.2'),
('wellness', 'Wellness Retreats & Resorts', 'Destination-based rejuvenation programs', 'ISO 18513:2003 §3.10'),
('wellness', 'Spa-Integrated Wellness', 'Medical and spa hybrid wellness centers', 'WHO GWI §2.4');

-- TRAVEL (ISO 18513:2003, UNWTO, IATA)
INSERT INTO service_subcategories (service_type, name, description, iso_reference) VALUES
('travel', 'Leisure Travel', 'Domestic and international vacation packages', 'UNWTO §4.3'),
('travel', 'Adventure Tourism', 'Trekking, rafting, diving, mountaineering', 'ISO 18513:2003 §3.15'),
('travel', 'Cultural & Heritage Travel', 'Museums, monuments, heritage tours', 'ISO 18513:2003 §3.16'),
('travel', 'Pilgrimage & Religious Travel', 'Faith-based travel packages', 'UNWTO Religious Tourism'),
('travel', 'Eco & Sustainable Tourism', 'Nature lodges, eco-resorts, green travel', 'UNWTO §5.2'),
('travel', 'Luxury & Premium Travel', 'Private jets, boutique resorts, cruises', 'ISO 18513:2003 §3.17'),
('travel', 'Business Travel (MICE)', 'Corporate travel and incentive programs', 'UNWTO §6.1'),
('travel', 'Cruise / Maritime Travel', 'Sea voyages, yacht charters', 'IATA CRS 4703');

-- OTHERS (ISIC General Services)
INSERT INTO service_subcategories (service_type, name, description, iso_reference) VALUES
('others', 'Pet Care & Grooming', 'Pet grooming, boarding, and training', 'ISIC 9609'),
('others', 'Education & Training', 'Tutoring, online courses, skill training', 'ISIC 8559'),
('others', 'Photography & Videography', 'Event or studio photography services', 'ISIC 7420'),
('others', 'Home & Lifestyle Services', 'Cleaning, repair, interior services', 'ISIC 9609'),
('others', 'Entertainment Professionals', 'DJs, emcees, performers', 'ISIC 9000'),
('others', 'Equipment & Venue Rentals', 'Event gear, decor, or venue rentals', 'ISIC 7730'),
('others', 'Consulting & Misc. Services', 'Specialized personal or B2B services', 'ISIC 7020');

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this to verify the data:
-- SELECT service_type, COUNT(*) as count FROM service_subcategories GROUP BY service_type ORDER BY service_type;
-- Expected results:
--   events: 7
--   spa-and-salon: 8
--   wellness: 8
--   travel: 8
--   others: 7
--   TOTAL: 38 rows

