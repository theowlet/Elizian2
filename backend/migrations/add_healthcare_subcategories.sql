-- ============================================
-- ADD HEALTHCARE SERVICE TYPE (ISO/WHO ALIGNED)
-- Extension to existing service_subcategories table
-- ============================================

-- Insert Healthcare subcategories with WHO/ISIC standards
INSERT INTO service_subcategories (service_type, name, description, iso_reference, is_active) VALUES
('healthcare', 'General Physicians & Specialists', 'Medical consultations by registered doctors', 'ISIC 8620', true),
('healthcare', 'Hospitals & Clinics', 'Multi and super specialty centers', 'ISIC 8610', true),
('healthcare', 'Diagnostics & Labs', 'Pathology and sample collection', 'ISIC 8690', true),
('healthcare', 'Radiology & Imaging', 'X-ray, MRI, ultrasound, CT scan', 'ISIC 8690', true),
('healthcare', 'Dental Clinics', 'Dental and orthodontic treatments', 'ISIC 8620', true),
('healthcare', 'Physiotherapy & Rehabilitation', 'Post-surgery and recovery therapy', 'ISIC 8690', true),
('healthcare', 'Home Healthcare', 'Nursing and in-home telemedicine', 'ISIC 8690', true),
('healthcare', 'Pharmacies & Medicine Delivery', 'Prescription and OTC medication', 'ISIC 4772', true),
('healthcare', 'Teleconsultation / e-Clinic', 'Virtual doctor consultations', 'WHO mHealth', true),
('healthcare', 'Vaccination & Preventive Care', 'Immunization, health camps', 'WHO ICD-10 Z23', true);

-- Verification Query
-- SELECT service_type, COUNT(*) as count FROM service_subcategories GROUP BY service_type ORDER BY service_type;
-- Expected: healthcare = 10 (new total: 48 subcategories)

