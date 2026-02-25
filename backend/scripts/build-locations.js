#!/usr/bin/env node
/**
 * Builds backend/data/locations.json from embedded global data.
 * Run: node backend/scripts/build-locations.js
 * Restart backend to pick up new file (controller caches in memory).
 */

const fs = require('fs');
const path = require('path');

// ISO 3166-1 countries (alpha2 id, name) - global list
const countries = [
  { id: 'AF', name: 'Afghanistan' }, { id: 'AL', name: 'Albania' }, { id: 'DZ', name: 'Algeria' },
  { id: 'AD', name: 'Andorra' }, { id: 'AO', name: 'Angola' }, { id: 'AG', name: 'Antigua and Barbuda' },
  { id: 'AR', name: 'Argentina' }, { id: 'AM', name: 'Armenia' }, { id: 'AU', name: 'Australia' },
  { id: 'AT', name: 'Austria' }, { id: 'AZ', name: 'Azerbaijan' }, { id: 'BS', name: 'Bahamas' },
  { id: 'BH', name: 'Bahrain' }, { id: 'BD', name: 'Bangladesh' }, { id: 'BB', name: 'Barbados' },
  { id: 'BY', name: 'Belarus' }, { id: 'BE', name: 'Belgium' }, { id: 'BZ', name: 'Belize' },
  { id: 'BJ', name: 'Benin' }, { id: 'BT', name: 'Bhutan' }, { id: 'BO', name: 'Bolivia' },
  { id: 'BA', name: 'Bosnia and Herzegovina' }, { id: 'BW', name: 'Botswana' }, { id: 'BR', name: 'Brazil' },
  { id: 'BN', name: 'Brunei' }, { id: 'BG', name: 'Bulgaria' }, { id: 'BF', name: 'Burkina Faso' },
  { id: 'BI', name: 'Burundi' }, { id: 'CV', name: 'Cabo Verde' }, { id: 'KH', name: 'Cambodia' },
  { id: 'CM', name: 'Cameroon' }, { id: 'CA', name: 'Canada' }, { id: 'CF', name: 'Central African Republic' },
  { id: 'TD', name: 'Chad' }, { id: 'CL', name: 'Chile' }, { id: 'CN', name: 'China' },
  { id: 'CO', name: 'Colombia' }, { id: 'KM', name: 'Comoros' }, { id: 'CG', name: 'Congo' },
  { id: 'CD', name: 'Congo, Democratic Republic of' }, { id: 'CR', name: 'Costa Rica' },
  { id: 'HR', name: 'Croatia' }, { id: 'CU', name: 'Cuba' }, { id: 'CY', name: 'Cyprus' },
  { id: 'CZ', name: 'Czechia' }, { id: 'DK', name: 'Denmark' }, { id: 'DJ', name: 'Djibouti' },
  { id: 'DM', name: 'Dominica' }, { id: 'DO', name: 'Dominican Republic' }, { id: 'EC', name: 'Ecuador' },
  { id: 'EG', name: 'Egypt' }, { id: 'SV', name: 'El Salvador' }, { id: 'GQ', name: 'Equatorial Guinea' },
  { id: 'ER', name: 'Eritrea' }, { id: 'EE', name: 'Estonia' }, { id: 'SZ', name: 'Eswatini' },
  { id: 'ET', name: 'Ethiopia' }, { id: 'FJ', name: 'Fiji' }, { id: 'FI', name: 'Finland' },
  { id: 'FR', name: 'France' }, { id: 'GA', name: 'Gabon' }, { id: 'GM', name: 'Gambia' },
  { id: 'GE', name: 'Georgia' }, { id: 'DE', name: 'Germany' }, { id: 'GH', name: 'Ghana' },
  { id: 'GR', name: 'Greece' }, { id: 'GD', name: 'Grenada' }, { id: 'GT', name: 'Guatemala' },
  { id: 'GN', name: 'Guinea' }, { id: 'GW', name: 'Guinea-Bissau' }, { id: 'GY', name: 'Guyana' },
  { id: 'HT', name: 'Haiti' }, { id: 'HN', name: 'Honduras' }, { id: 'HK', name: 'Hong Kong' },
  { id: 'HU', name: 'Hungary' }, { id: 'IS', name: 'Iceland' }, { id: 'IN', name: 'India' },
  { id: 'ID', name: 'Indonesia' }, { id: 'IR', name: 'Iran' }, { id: 'IQ', name: 'Iraq' },
  { id: 'IE', name: 'Ireland' }, { id: 'IL', name: 'Israel' }, { id: 'IT', name: 'Italy' },
  { id: 'JM', name: 'Jamaica' }, { id: 'JP', name: 'Japan' }, { id: 'JO', name: 'Jordan' },
  { id: 'KZ', name: 'Kazakhstan' }, { id: 'KE', name: 'Kenya' }, { id: 'KI', name: 'Kiribati' },
  { id: 'KP', name: 'Korea, North' }, { id: 'KR', name: 'Korea, South' }, { id: 'KW', name: 'Kuwait' },
  { id: 'KG', name: 'Kyrgyzstan' }, { id: 'LA', name: 'Laos' }, { id: 'LV', name: 'Latvia' },
  { id: 'LB', name: 'Lebanon' }, { id: 'LS', name: 'Lesotho' }, { id: 'LR', name: 'Liberia' },
  { id: 'LY', name: 'Libya' }, { id: 'LI', name: 'Liechtenstein' }, { id: 'LT', name: 'Lithuania' },
  { id: 'LU', name: 'Luxembourg' }, { id: 'MO', name: 'Macao' }, { id: 'MG', name: 'Madagascar' },
  { id: 'MW', name: 'Malawi' }, { id: 'MY', name: 'Malaysia' }, { id: 'MV', name: 'Maldives' },
  { id: 'ML', name: 'Mali' }, { id: 'MT', name: 'Malta' }, { id: 'MH', name: 'Marshall Islands' },
  { id: 'MR', name: 'Mauritania' }, { id: 'MU', name: 'Mauritius' }, { id: 'MX', name: 'Mexico' },
  { id: 'FM', name: 'Micronesia' }, { id: 'MD', name: 'Moldova' }, { id: 'MC', name: 'Monaco' },
  { id: 'MN', name: 'Mongolia' }, { id: 'ME', name: 'Montenegro' }, { id: 'MA', name: 'Morocco' },
  { id: 'MZ', name: 'Mozambique' }, { id: 'MM', name: 'Myanmar' }, { id: 'NA', name: 'Namibia' },
  { id: 'NR', name: 'Nauru' }, { id: 'NP', name: 'Nepal' }, { id: 'NL', name: 'Netherlands' },
  { id: 'NZ', name: 'New Zealand' }, { id: 'NI', name: 'Nicaragua' }, { id: 'NE', name: 'Niger' },
  { id: 'NG', name: 'Nigeria' }, { id: 'MK', name: 'North Macedonia' }, { id: 'NO', name: 'Norway' },
  { id: 'OM', name: 'Oman' }, { id: 'PK', name: 'Pakistan' }, { id: 'PW', name: 'Palau' },
  { id: 'PS', name: 'Palestine' }, { id: 'PA', name: 'Panama' }, { id: 'PG', name: 'Papua New Guinea' },
  { id: 'PY', name: 'Paraguay' }, { id: 'PE', name: 'Peru' }, { id: 'PH', name: 'Philippines' },
  { id: 'PL', name: 'Poland' }, { id: 'PT', name: 'Portugal' }, { id: 'PR', name: 'Puerto Rico' },
  { id: 'QA', name: 'Qatar' }, { id: 'RO', name: 'Romania' }, { id: 'RU', name: 'Russia' },
  { id: 'RW', name: 'Rwanda' }, { id: 'KN', name: 'Saint Kitts and Nevis' }, { id: 'LC', name: 'Saint Lucia' },
  { id: 'VC', name: 'Saint Vincent and the Grenadines' }, { id: 'WS', name: 'Samoa' },
  { id: 'SM', name: 'San Marino' }, { id: 'ST', name: 'Sao Tome and Principe' }, { id: 'SA', name: 'Saudi Arabia' },
  { id: 'SN', name: 'Senegal' }, { id: 'RS', name: 'Serbia' }, { id: 'SC', name: 'Seychelles' },
  { id: 'SL', name: 'Sierra Leone' }, { id: 'SG', name: 'Singapore' }, { id: 'SK', name: 'Slovakia' },
  { id: 'SI', name: 'Slovenia' }, { id: 'SB', name: 'Solomon Islands' }, { id: 'SO', name: 'Somalia' },
  { id: 'ZA', name: 'South Africa' }, { id: 'SS', name: 'South Sudan' }, { id: 'ES', name: 'Spain' },
  { id: 'LK', name: 'Sri Lanka' }, { id: 'SD', name: 'Sudan' }, { id: 'SR', name: 'Suriname' },
  { id: 'SE', name: 'Sweden' }, { id: 'CH', name: 'Switzerland' }, { id: 'SY', name: 'Syria' },
  { id: 'TW', name: 'Taiwan' }, { id: 'TJ', name: 'Tajikistan' }, { id: 'TZ', name: 'Tanzania' },
  { id: 'TH', name: 'Thailand' }, { id: 'TL', name: 'Timor-Leste' }, { id: 'TG', name: 'Togo' },
  { id: 'TO', name: 'Tonga' }, { id: 'TT', name: 'Trinidad and Tobago' }, { id: 'TN', name: 'Tunisia' },
  { id: 'TR', name: 'Türkiye' }, { id: 'TM', name: 'Turkmenistan' }, { id: 'TV', name: 'Tuvalu' },
  { id: 'UG', name: 'Uganda' }, { id: 'UA', name: 'Ukraine' }, { id: 'AE', name: 'United Arab Emirates' },
  { id: 'GB', name: 'United Kingdom' }, { id: 'US', name: 'United States' }, { id: 'UY', name: 'Uruguay' },
  { id: 'UZ', name: 'Uzbekistan' }, { id: 'VU', name: 'Vanuatu' }, { id: 'VE', name: 'Venezuela' },
  { id: 'VN', name: 'Vietnam' }, { id: 'YE', name: 'Yemen' }, { id: 'ZM', name: 'Zambia' }, { id: 'ZW', name: 'Zimbabwe' }
];

// Indian states (existing)
const indiaStates = [
  { id: 'AN', country_id: 'IN', name: 'Andaman and Nicobar Islands' }, { id: 'AP', country_id: 'IN', name: 'Andhra Pradesh' },
  { id: 'AR', country_id: 'IN', name: 'Arunachal Pradesh' }, { id: 'AS', country_id: 'IN', name: 'Assam' },
  { id: 'BR', country_id: 'IN', name: 'Bihar' }, { id: 'CH', country_id: 'IN', name: 'Chandigarh' },
  { id: 'CT', country_id: 'IN', name: 'Chhattisgarh' }, { id: 'DN', country_id: 'IN', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { id: 'DL', country_id: 'IN', name: 'Delhi' }, { id: 'GA', country_id: 'IN', name: 'Goa' },
  { id: 'GJ', country_id: 'IN', name: 'Gujarat' }, { id: 'HR', country_id: 'IN', name: 'Haryana' },
  { id: 'HP', country_id: 'IN', name: 'Himachal Pradesh' }, { id: 'JK', country_id: 'IN', name: 'Jammu and Kashmir' },
  { id: 'JH', country_id: 'IN', name: 'Jharkhand' }, { id: 'KA', country_id: 'IN', name: 'Karnataka' },
  { id: 'KL', country_id: 'IN', name: 'Kerala' }, { id: 'LA', country_id: 'IN', name: 'Ladakh' },
  { id: 'LD', country_id: 'IN', name: 'Lakshadweep' }, { id: 'MP', country_id: 'IN', name: 'Madhya Pradesh' },
  { id: 'MH', country_id: 'IN', name: 'Maharashtra' }, { id: 'MN', country_id: 'IN', name: 'Manipur' },
  { id: 'ML', country_id: 'IN', name: 'Meghalaya' }, { id: 'MZ', country_id: 'IN', name: 'Mizoram' },
  { id: 'NL', country_id: 'IN', name: 'Nagaland' }, { id: 'OR', country_id: 'IN', name: 'Odisha' },
  { id: 'PY', country_id: 'IN', name: 'Puducherry' }, { id: 'PB', country_id: 'IN', name: 'Punjab' },
  { id: 'RJ', country_id: 'IN', name: 'Rajasthan' }, { id: 'SK', country_id: 'IN', name: 'Sikkim' },
  { id: 'TN', country_id: 'IN', name: 'Tamil Nadu' }, { id: 'TG', country_id: 'IN', name: 'Telangana' },
  { id: 'TR', country_id: 'IN', name: 'Tripura' }, { id: 'UP', country_id: 'IN', name: 'Uttar Pradesh' },
  { id: 'UT', country_id: 'IN', name: 'Uttarakhand' }, { id: 'WB', country_id: 'IN', name: 'West Bengal' }
];

// US states + DC
const usStates = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
].map((code, i) => ({
  id: code,
  country_id: 'US',
  name: [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
    'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana',
    'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
    'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia'
  ][i]
}));

// UK constituent countries / regions
const ukStates = [
  { id: 'ENG', country_id: 'GB', name: 'England' },
  { id: 'SCT', country_id: 'GB', name: 'Scotland' },
  { id: 'WLS', country_id: 'GB', name: 'Wales' },
  { id: 'NIR', country_id: 'GB', name: 'Northern Ireland' }
];

// Canada provinces/territories
const caStates = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
].map((code, i) => ({
  id: code,
  country_id: 'CA',
  name: ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Northwest Territories', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'][i]
}));

// Australia states/territories
const auStates = [
  { id: 'ACT', country_id: 'AU', name: 'Australian Capital Territory' }, { id: 'NSW', country_id: 'AU', name: 'New South Wales' },
  { id: 'NT', country_id: 'AU', name: 'Northern Territory' }, { id: 'QLD', country_id: 'AU', name: 'Queensland' },
  { id: 'SA', country_id: 'AU', name: 'South Australia' }, { id: 'TAS', country_id: 'AU', name: 'Tasmania' },
  { id: 'VIC', country_id: 'AU', name: 'Victoria' }, { id: 'WA', country_id: 'AU', name: 'Western Australia' }
];

// UAE emirates
const aeStates = [
  { id: 'AE-AZ', country_id: 'AE', name: 'Abu Dhabi' },
  { id: 'AE-DU', country_id: 'AE', name: 'Dubai' },
  { id: 'AE-SH', country_id: 'AE', name: 'Sharjah' },
  { id: 'AE-AJ', country_id: 'AE', name: 'Ajman' },
  { id: 'AE-UQ', country_id: 'AE', name: 'Umm Al Quwain' },
  { id: 'AE-RK', country_id: 'AE', name: 'Ras Al Khaimah' },
  { id: 'AE-FU', country_id: 'AE', name: 'Fujairah' }
];

// Pakistan provinces & territories
const pkStates = [
  { id: 'PK-PB', country_id: 'PK', name: 'Punjab' }, { id: 'PK-SD', country_id: 'PK', name: 'Sindh' },
  { id: 'PK-KP', country_id: 'PK', name: 'Khyber Pakhtunkhwa' }, { id: 'PK-BL', country_id: 'PK', name: 'Balochistan' },
  { id: 'PK-GB', country_id: 'PK', name: 'Gilgit-Baltistan' }, { id: 'PK-AJ', country_id: 'PK', name: 'Azad Jammu and Kashmir' },
  { id: 'PK-IS', country_id: 'PK', name: 'Islamabad Capital Territory' }
];

// Bangladesh divisions
const bdStates = [
  { id: 'BD-DH', country_id: 'BD', name: 'Dhaka' }, { id: 'BD-CT', country_id: 'BD', name: 'Chittagong' },
  { id: 'BD-RS', country_id: 'BD', name: 'Rajshahi' }, { id: 'BD-KH', country_id: 'BD', name: 'Khulna' },
  { id: 'BD-BR', country_id: 'BD', name: 'Barisal' }, { id: 'BD-SY', country_id: 'BD', name: 'Sylhet' },
  { id: 'BD-RP', country_id: 'BD', name: 'Rangpur' }, { id: 'BD-MM', country_id: 'BD', name: 'Mymensingh' }
];

// Sri Lanka provinces
const lkStates = [
  { id: 'LK-WP', country_id: 'LK', name: 'Western' }, { id: 'LK-CP', country_id: 'LK', name: 'Central' },
  { id: 'LK-SP', country_id: 'LK', name: 'Southern' }, { id: 'LK-NP', country_id: 'LK', name: 'Northern' },
  { id: 'LK-EP', country_id: 'LK', name: 'Eastern' }, { id: 'LK-NW', country_id: 'LK', name: 'North Western' },
  { id: 'LK-NC', country_id: 'LK', name: 'North Central' }, { id: 'LK-UP', country_id: 'LK', name: 'Uva' },
  { id: 'LK-SB', country_id: 'LK', name: 'Sabaragamuwa' }
];

// Nepal provinces
const npStates = [
  { id: 'NP-1', country_id: 'NP', name: 'Koshi' }, { id: 'NP-2', country_id: 'NP', name: 'Madhesh' },
  { id: 'NP-3', country_id: 'NP', name: 'Bagmati' }, { id: 'NP-4', country_id: 'NP', name: 'Gandaki' },
  { id: 'NP-5', country_id: 'NP', name: 'Lumbini' }, { id: 'NP-6', country_id: 'NP', name: 'Karnali' },
  { id: 'NP-7', country_id: 'NP', name: 'Sudurpashchim' }
];

// Germany (Bundesländer)
const deStates = [
  'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'
].map((code, i) => ({
  id: code,
  country_id: 'DE',
  name: ['Baden-Württemberg', 'Bavaria', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hesse', 'Mecklenburg-Vorpommern', 'Lower Saxony', 'North Rhine-Westphalia', 'Rhineland-Palatinate', 'Saarland', 'Saxony', 'Saxony-Anhalt', 'Schleswig-Holstein', 'Thuringia'][i]
}));

// France (régions métropolitaines principales)
const frStates = [
  { id: 'FR-IDF', country_id: 'FR', name: 'Île-de-France' }, { id: 'FR-NAQ', country_id: 'FR', name: 'Nouvelle-Aquitaine' },
  { id: 'FR-ARA', country_id: 'FR', name: 'Auvergne-Rhône-Alpes' }, { id: 'FR-OCC', country_id: 'FR', name: 'Occitanie' },
  { id: 'FR-PAC', country_id: 'FR', name: 'Provence-Alpes-Côte d\'Azur' }, { id: 'FR-GES', country_id: 'FR', name: 'Grand Est' },
  { id: 'FR-HDF', country_id: 'FR', name: 'Hauts-de-France' }, { id: 'FR-BRE', country_id: 'FR', name: 'Brittany' },
  { id: 'FR-PDL', country_id: 'FR', name: 'Pays de la Loire' }, { id: 'FR-NOR', country_id: 'FR', name: 'Normandy' },
  { id: 'FR-CVL', country_id: 'FR', name: 'Centre-Val de Loire' }, { id: 'FR-BFC', country_id: 'FR', name: 'Bourgogne-Franche-Comté' },
  { id: 'FR-COR', country_id: 'FR', name: 'Corsica' }
];

// Spain (comunidades autónomas)
const esStates = [
  { id: 'ES-AN', country_id: 'ES', name: 'Andalusia' }, { id: 'ES-AR', country_id: 'ES', name: 'Aragon' },
  { id: 'ES-AS', country_id: 'ES', name: 'Asturias' }, { id: 'ES-CB', country_id: 'ES', name: 'Cantabria' },
  { id: 'ES-CL', country_id: 'ES', name: 'Castile and León' }, { id: 'ES-CM', country_id: 'ES', name: 'Castilla-La Mancha' },
  { id: 'ES-CT', country_id: 'ES', name: 'Catalonia' }, { id: 'ES-CE', country_id: 'ES', name: 'Ceuta' },
  { id: 'ES-MD', country_id: 'ES', name: 'Madrid' }, { id: 'ES-ML', country_id: 'ES', name: 'Melilla' },
  { id: 'ES-VC', country_id: 'ES', name: 'Valencian Community' }, { id: 'ES-EX', country_id: 'ES', name: 'Extremadura' },
  { id: 'ES-GA', country_id: 'ES', name: 'Galicia' }, { id: 'ES-IB', country_id: 'ES', name: 'Balearic Islands' },
  { id: 'ES-CN', country_id: 'ES', name: 'Canary Islands' }, { id: 'ES-RI', country_id: 'ES', name: 'La Rioja' },
  { id: 'ES-PV', country_id: 'ES', name: 'Basque Country' }, { id: 'ES-NC', country_id: 'ES', name: 'Navarre' },
  { id: 'ES-MU', country_id: 'ES', name: 'Region of Murcia' }
];

// Italy (regions)
const itStates = [
  { id: 'IT-ABR', country_id: 'IT', name: 'Abruzzo' }, { id: 'IT-BAS', country_id: 'IT', name: 'Basilicata' },
  { id: 'IT-CAL', country_id: 'IT', name: 'Calabria' }, { id: 'IT-CAM', country_id: 'IT', name: 'Campania' },
  { id: 'IT-EMR', country_id: 'IT', name: 'Emilia-Romagna' }, { id: 'IT-FVG', country_id: 'IT', name: 'Friuli-Venezia Giulia' },
  { id: 'IT-LAZ', country_id: 'IT', name: 'Lazio' }, { id: 'IT-LIG', country_id: 'IT', name: 'Liguria' },
  { id: 'IT-LOM', country_id: 'IT', name: 'Lombardy' }, { id: 'IT-MAR', country_id: 'IT', name: 'Marche' },
  { id: 'IT-MOL', country_id: 'IT', name: 'Molise' }, { id: 'IT-PIE', country_id: 'IT', name: 'Piedmont' },
  { id: 'IT-PUG', country_id: 'IT', name: 'Apulia' }, { id: 'IT-SAR', country_id: 'IT', name: 'Sardinia' },
  { id: 'IT-SIC', country_id: 'IT', name: 'Sicily' }, { id: 'IT-TOS', country_id: 'IT', name: 'Tuscany' },
  { id: 'IT-TAA', country_id: 'IT', name: 'Trentino-Alto Adige' }, { id: 'IT-UMB', country_id: 'IT', name: 'Umbria' },
  { id: 'IT-VEN', country_id: 'IT', name: 'Veneto' }, { id: 'IT-VDA', country_id: 'IT', name: 'Aosta Valley' }
];

// Mexico (estados)
const mxStates = [
  'AG', 'BC', 'BS', 'CM', 'CS', 'CH', 'CO', 'CL', 'DG', 'GT', 'GR', 'HG', 'JA', 'MX', 'MI', 'MO', 'NE', 'NL', 'OA', 'PU', 'QT', 'QR', 'SL', 'SI', 'SO', 'TB', 'TM', 'TL', 'VE', 'YU', 'ZA'
].map((code, i) => ({
  id: code,
  country_id: 'MX',
  name: ['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Coahuila', 'Colima', 'Durango', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'México', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'][i]
}));

// Brazil (estados)
const brStates = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
].map((code, i) => ({
  id: code,
  country_id: 'BR',
  name: ['Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'][i]
}));

// South Africa provinces
const zaStates = [
  { id: 'ZA-EC', country_id: 'ZA', name: 'Eastern Cape' }, { id: 'ZA-FS', country_id: 'ZA', name: 'Free State' },
  { id: 'ZA-GP', country_id: 'ZA', name: 'Gauteng' }, { id: 'ZA-KZN', country_id: 'ZA', name: 'KwaZulu-Natal' },
  { id: 'ZA-LP', country_id: 'ZA', name: 'Limpopo' }, { id: 'ZA-MP', country_id: 'ZA', name: 'Mpumalanga' },
  { id: 'ZA-NC', country_id: 'ZA', name: 'Northern Cape' }, { id: 'ZA-NW', country_id: 'ZA', name: 'North West' },
  { id: 'ZA-WC', country_id: 'ZA', name: 'Western Cape' }
];

// Saudi Arabia regions
const saStates = [
  { id: 'SA-01', country_id: 'SA', name: 'Riyadh' }, { id: 'SA-02', country_id: 'SA', name: 'Makkah' },
  { id: 'SA-03', country_id: 'SA', name: 'Madinah' }, { id: 'SA-04', country_id: 'SA', name: 'Eastern Province' },
  { id: 'SA-05', country_id: 'SA', name: 'Qassim' }, { id: 'SA-06', country_id: 'SA', name: 'Asir' },
  { id: 'SA-07', country_id: 'SA', name: 'Tabuk' }, { id: 'SA-08', country_id: 'SA', name: 'Northern Borders' },
  { id: 'SA-09', country_id: 'SA', name: 'Jazan' }, { id: 'SA-10', country_id: 'SA', name: 'Najran' },
  { id: 'SA-11', country_id: 'SA', name: 'Al Bahah' }, { id: 'SA-12', country_id: 'SA', name: 'Al Jawf' },
  { id: 'SA-14', country_id: 'SA', name: 'Ha\'il' }
];

// Malaysia states
const myStates = [
  { id: 'MY-JH', country_id: 'MY', name: 'Johor' }, { id: 'MY-KD', country_id: 'MY', name: 'Kedah' },
  { id: 'MY-KT', country_id: 'MY', name: 'Kelantan' }, { id: 'MY-KL', country_id: 'MY', name: 'Kuala Lumpur' },
  { id: 'MY-LB', country_id: 'MY', name: 'Labuan' }, { id: 'MY-ML', country_id: 'MY', name: 'Malacca' },
  { id: 'MY-NS', country_id: 'MY', name: 'Negeri Sembilan' }, { id: 'MY-PH', country_id: 'MY', name: 'Penang' },
  { id: 'MY-PJ', country_id: 'MY', name: 'Putrajaya' }, { id: 'MY-PK', country_id: 'MY', name: 'Perak' },
  { id: 'MY-PS', country_id: 'MY', name: 'Perlis' }, { id: 'MY-SB', country_id: 'MY', name: 'Sabah' },
  { id: 'MY-SR', country_id: 'MY', name: 'Sarawak' }, { id: 'MY-SG', country_id: 'MY', name: 'Selangor' },
  { id: 'MY-TR', country_id: 'MY', name: 'Terengganu' }
];

// Philippines (regions)
const phStates = [
  { id: 'PH-NCR', country_id: 'PH', name: 'National Capital Region' }, { id: 'PH-01', country_id: 'PH', name: 'Ilocos' },
  { id: 'PH-02', country_id: 'PH', name: 'Cagayan Valley' }, { id: 'PH-03', country_id: 'PH', name: 'Central Luzon' },
  { id: 'PH-4A', country_id: 'PH', name: 'Calabarzon' }, { id: 'PH-4B', country_id: 'PH', name: 'Mimaropa' },
  { id: 'PH-05', country_id: 'PH', name: 'Bicol' }, { id: 'PH-06', country_id: 'PH', name: 'Western Visayas' },
  { id: 'PH-07', country_id: 'PH', name: 'Central Visayas' }, { id: 'PH-08', country_id: 'PH', name: 'Eastern Visayas' },
  { id: 'PH-09', country_id: 'PH', name: 'Zamboanga Peninsula' }, { id: 'PH-10', country_id: 'PH', name: 'Northern Mindanao' },
  { id: 'PH-11', country_id: 'PH', name: 'Davao' }, { id: 'PH-12', country_id: 'PH', name: 'Soccsksargen' },
  { id: 'PH-13', country_id: 'PH', name: 'Caraga' }, { id: 'PH-14', country_id: 'PH', name: 'Bangsamoro' },
  { id: 'PH-15', country_id: 'PH', name: 'Cordillera' }
];

// Thailand (regions / major provinces as regions)
const thStates = [
  { id: 'TH-01', country_id: 'TH', name: 'Bangkok' }, { id: 'TH-02', country_id: 'TH', name: 'Central Thailand' },
  { id: 'TH-03', country_id: 'TH', name: 'Northern Thailand' }, { id: 'TH-04', country_id: 'TH', name: 'Northeastern Thailand' },
  { id: 'TH-05', country_id: 'TH', name: 'Southern Thailand' }, { id: 'TH-06', country_id: 'TH', name: 'Eastern Thailand' },
  { id: 'TH-07', country_id: 'TH', name: 'Western Thailand' }
];

// Vietnam (regions)
const vnStates = [
  { id: 'VN-NB', country_id: 'VN', name: 'Northern Vietnam' }, { id: 'VN-NC', country_id: 'VN', name: 'North Central Coast' },
  { id: 'VN-SC', country_id: 'VN', name: 'South Central Coast' }, { id: 'VN-CB', country_id: 'VN', name: 'Central Highlands' },
  { id: 'VN-SE', country_id: 'VN', name: 'Southeast' }, { id: 'VN-MK', country_id: 'VN', name: 'Mekong Delta' }
];

// New Zealand regions
const nzStates = [
  { id: 'NZ-AUK', country_id: 'NZ', name: 'Auckland' }, { id: 'NZ-BOP', country_id: 'NZ', name: 'Bay of Plenty' },
  { id: 'NZ-CAN', country_id: 'NZ', name: 'Canterbury' }, { id: 'NZ-GIS', country_id: 'NZ', name: 'Gisborne' },
  { id: 'NZ-HKB', country_id: 'NZ', name: "Hawke's Bay" }, { id: 'NZ-MWT', country_id: 'NZ', name: 'Manawatū-Whanganui' },
  { id: 'NZ-MBK', country_id: 'NZ', name: 'Marlborough' }, { id: 'NZ-NSN', country_id: 'NZ', name: 'Nelson' },
  { id: 'NZ-NTL', country_id: 'NZ', name: 'Northland' }, { id: 'NZ-OTA', country_id: 'NZ', name: 'Otago' },
  { id: 'NZ-STL', country_id: 'NZ', name: 'Southland' }, { id: 'NZ-TKI', country_id: 'NZ', name: 'Taranaki' },
  { id: 'NZ-TAS', country_id: 'NZ', name: 'Tasman' }, { id: 'NZ-WKO', country_id: 'NZ', name: 'Waikato' },
  { id: 'NZ-WGN', country_id: 'NZ', name: 'Wellington' }, { id: 'NZ-WTC', country_id: 'NZ', name: 'West Coast' }
];

// Netherlands provinces
const nlStates = [
  { id: 'NL-DR', country_id: 'NL', name: 'Drenthe' }, { id: 'NL-FL', country_id: 'NL', name: 'Flevoland' },
  { id: 'NL-FR', country_id: 'NL', name: 'Friesland' }, { id: 'NL-GE', country_id: 'NL', name: 'Gelderland' },
  { id: 'NL-GR', country_id: 'NL', name: 'Groningen' }, { id: 'NL-LI', country_id: 'NL', name: 'Limburg' },
  { id: 'NL-NB', country_id: 'NL', name: 'North Brabant' }, { id: 'NL-NH', country_id: 'NL', name: 'North Holland' },
  { id: 'NL-OV', country_id: 'NL', name: 'Overijssel' }, { id: 'NL-UT', country_id: 'NL', name: 'Utrecht' },
  { id: 'NL-ZH', country_id: 'NL', name: 'South Holland' }, { id: 'NL-ZE', country_id: 'NL', name: 'Zeeland' }
];

// Japan (8 regions)
const jpStates = [
  { id: 'JP-HKD', country_id: 'JP', name: 'Hokkaido' }, { id: 'JP-TOH', country_id: 'JP', name: 'Tohoku' },
  { id: 'JP-KTU', country_id: 'JP', name: 'Kanto' }, { id: 'JP-CHB', country_id: 'JP', name: 'Chubu' },
  { id: 'JP-KNK', country_id: 'JP', name: 'Kansai' }, { id: 'JP-CHG', country_id: 'JP', name: 'Chugoku' },
  { id: 'JP-SIK', country_id: 'JP', name: 'Shikoku' }, { id: 'JP-KYU', country_id: 'JP', name: 'Kyushu' }
];

// China (provinces / direct-administered - main)
const cnStates = [
  { id: 'CN-BJ', country_id: 'CN', name: 'Beijing' }, { id: 'CN-TJ', country_id: 'CN', name: 'Tianjin' },
  { id: 'CN-HE', country_id: 'CN', name: 'Hebei' }, { id: 'CN-SX', country_id: 'CN', name: 'Shanxi' },
  { id: 'CN-NM', country_id: 'CN', name: 'Inner Mongolia' }, { id: 'CN-LN', country_id: 'CN', name: 'Liaoning' },
  { id: 'CN-JL', country_id: 'CN', name: 'Jilin' }, { id: 'CN-HL', country_id: 'CN', name: 'Heilongjiang' },
  { id: 'CN-SH', country_id: 'CN', name: 'Shanghai' }, { id: 'CN-JS', country_id: 'CN', name: 'Jiangsu' },
  { id: 'CN-ZJ', country_id: 'CN', name: 'Zhejiang' }, { id: 'CN-AH', country_id: 'CN', name: 'Anhui' },
  { id: 'CN-FJ', country_id: 'CN', name: 'Fujian' }, { id: 'CN-JX', country_id: 'CN', name: 'Jiangxi' },
  { id: 'CN-SD', country_id: 'CN', name: 'Shandong' }, { id: 'CN-HA', country_id: 'CN', name: 'Henan' },
  { id: 'CN-HB', country_id: 'CN', name: 'Hubei' }, { id: 'CN-HN', country_id: 'CN', name: 'Hunan' },
  { id: 'CN-GD', country_id: 'CN', name: 'Guangdong' }, { id: 'CN-GX', country_id: 'CN', name: 'Guangxi' },
  { id: 'CN-HI', country_id: 'CN', name: 'Hainan' }, { id: 'CN-CQ', country_id: 'CN', name: 'Chongqing' },
  { id: 'CN-SC', country_id: 'CN', name: 'Sichuan' }, { id: 'CN-GZ', country_id: 'CN', name: 'Guizhou' },
  { id: 'CN-YN', country_id: 'CN', name: 'Yunnan' }, { id: 'CN-XZ', country_id: 'CN', name: 'Tibet' },
  { id: 'CN-SN', country_id: 'CN', name: 'Shaanxi' }, { id: 'CN-GS', country_id: 'CN', name: 'Gansu' },
  { id: 'CN-QH', country_id: 'CN', name: 'Qinghai' }, { id: 'CN-NX', country_id: 'CN', name: 'Ningxia' },
  { id: 'CN-XJ', country_id: 'CN', name: 'Xinjiang' }, { id: 'CN-TW', country_id: 'CN', name: 'Taiwan' },
  { id: 'CN-HK', country_id: 'CN', name: 'Hong Kong' }, { id: 'CN-MO', country_id: 'CN', name: 'Macau' }
];

// South Korea (provinces + metropolitan cities)
const krStates = [
  { id: 'KR-11', country_id: 'KR', name: 'Seoul' }, { id: 'KR-26', country_id: 'KR', name: 'Busan' },
  { id: 'KR-27', country_id: 'KR', name: 'Daegu' }, { id: 'KR-28', country_id: 'KR', name: 'Incheon' },
  { id: 'KR-29', country_id: 'KR', name: 'Gwangju' }, { id: 'KR-30', country_id: 'KR', name: 'Daejeon' },
  { id: 'KR-31', country_id: 'KR', name: 'Ulsan' }, { id: 'KR-41', country_id: 'KR', name: 'Gyeonggi' },
  { id: 'KR-42', country_id: 'KR', name: 'Gangwon' }, { id: 'KR-43', country_id: 'KR', name: 'North Chungcheong' },
  { id: 'KR-44', country_id: 'KR', name: 'South Chungcheong' }, { id: 'KR-45', country_id: 'KR', name: 'North Jeolla' },
  { id: 'KR-46', country_id: 'KR', name: 'South Jeolla' }, { id: 'KR-47', country_id: 'KR', name: 'North Gyeongsang' },
  { id: 'KR-48', country_id: 'KR', name: 'South Gyeongsang' }, { id: 'KR-49', country_id: 'KR', name: 'Jeju' }
];

// Indonesia (provinces - major)
const idStates = [
  { id: 'ID-JK', country_id: 'ID', name: 'Jakarta' }, { id: 'ID-JB', country_id: 'ID', name: 'West Java' },
  { id: 'ID-JT', country_id: 'ID', name: 'Central Java' }, { id: 'ID-JI', country_id: 'ID', name: 'East Java' },
  { id: 'ID-BT', country_id: 'ID', name: 'Banten' }, { id: 'ID-BA', country_id: 'ID', name: 'Bali' },
  { id: 'ID-SU', country_id: 'ID', name: 'North Sumatra' }, { id: 'ID-SB', country_id: 'ID', name: 'West Sumatra' },
  { id: 'ID-SS', country_id: 'ID', name: 'South Sumatra' }, { id: 'ID-KR', country_id: 'ID', name: 'Riau Islands' },
  { id: 'ID-KB', country_id: 'ID', name: 'West Kalimantan' }, { id: 'ID-KS', country_id: 'ID', name: 'South Kalimantan' },
  { id: 'ID-KI', country_id: 'ID', name: 'East Kalimantan' }, { id: 'ID-SN', country_id: 'ID', name: 'South Sulawesi' },
  { id: 'ID-NT', country_id: 'ID', name: 'East Nusa Tenggara' }, { id: 'ID-PB', country_id: 'ID', name: 'Papua' }
];

// Egypt (governorates - main)
const egStates = [
  { id: 'EG-CAI', country_id: 'EG', name: 'Cairo' }, { id: 'EG-ALX', country_id: 'EG', name: 'Alexandria' },
  { id: 'EG-GIZ', country_id: 'EG', name: 'Giza' }, { id: 'EG-SHR', country_id: 'EG', name: 'Sharqia' },
  { id: 'EG-DAK', country_id: 'EG', name: 'Dakahlia' }, { id: 'EG-BHS', country_id: 'EG', name: 'Beheira' },
  { id: 'EG-MNF', country_id: 'EG', name: 'Monufia' }, { id: 'EG-QHR', country_id: 'EG', name: 'Qalyubia' },
  { id: 'EG-GHR', country_id: 'EG', name: 'Gharbia' }, { id: 'EG-KFS', country_id: 'EG', name: 'Kafr El Sheikh' },
  { id: 'EG-DMY', country_id: 'EG', name: 'Damietta' }, { id: 'EG-PTS', country_id: 'EG', name: 'Port Said' },
  { id: 'EG-SIN', country_id: 'EG', name: 'North Sinai' }, { id: 'EG-SUZ', country_id: 'EG', name: 'Suez' },
  { id: 'EG-ASN', country_id: 'EG', name: 'Aswan' }, { id: 'EG-LXR', country_id: 'EG', name: 'Luxor' }
];

// Kenya (counties - major)
const keStates = [
  { id: 'KE-01', country_id: 'KE', name: 'Nairobi' }, { id: 'KE-02', country_id: 'KE', name: 'Mombasa' },
  { id: 'KE-03', country_id: 'KE', name: 'Kisumu' }, { id: 'KE-04', country_id: 'KE', name: 'Nakuru' },
  { id: 'KE-05', country_id: 'KE', name: 'Eldoret (Uasin Gishu)' }, { id: 'KE-06', country_id: 'KE', name: 'Kiambu' },
  { id: 'KE-07', country_id: 'KE', name: 'Meru' }, { id: 'KE-08', country_id: 'KE', name: 'Kakamega' },
  { id: 'KE-09', country_id: 'KE', name: 'Kisii' }, { id: 'KE-10', country_id: 'KE', name: 'Garissa' }
];

// Nigeria (states - all 36 + FCT)
const ngStates = [
  'AB', 'AD', 'AK', 'AN', 'BA', 'BY', 'BE', 'BO', 'CR', 'DE', 'EB', 'ED', 'EK', 'EN', 'FC', 'GO', 'IM', 'JI', 'KD', 'KN', 'KT', 'KE', 'KO', 'KW', 'LA', 'NA', 'NI', 'OG', 'ON', 'OS', 'OY', 'PL', 'RI', 'SO', 'TA', 'YO', 'ZA'
].map((code, i) => ({
  id: code,
  country_id: 'NG',
  name: ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'][i]
}));

// Argentina (provinces)
const arStates = [
  { id: 'AR-A', country_id: 'AR', name: 'Salta' }, { id: 'AR-B', country_id: 'AR', name: 'Buenos Aires' },
  { id: 'AR-C', country_id: 'AR', name: 'Ciudad Autónoma de Buenos Aires' }, { id: 'AR-D', country_id: 'AR', name: 'San Luis' },
  { id: 'AR-E', country_id: 'AR', name: 'Entre Ríos' }, { id: 'AR-F', country_id: 'AR', name: 'La Rioja' },
  { id: 'AR-G', country_id: 'AR', name: 'Santiago del Estero' }, { id: 'AR-H', country_id: 'AR', name: 'Chaco' },
  { id: 'AR-J', country_id: 'AR', name: 'San Juan' }, { id: 'AR-K', country_id: 'AR', name: 'Catamarca' },
  { id: 'AR-L', country_id: 'AR', name: 'La Pampa' }, { id: 'AR-M', country_id: 'AR', name: 'Mendoza' },
  { id: 'AR-N', country_id: 'AR', name: 'Misiones' }, { id: 'AR-P', country_id: 'AR', name: 'Formosa' },
  { id: 'AR-Q', country_id: 'AR', name: 'Neuquén' }, { id: 'AR-R', country_id: 'AR', name: 'Río Negro' },
  { id: 'AR-S', country_id: 'AR', name: 'Santa Fe' }, { id: 'AR-T', country_id: 'AR', name: 'Tucumán' },
  { id: 'AR-U', country_id: 'AR', name: 'Chubut' }, { id: 'AR-V', country_id: 'AR', name: 'Tierra del Fuego' },
  { id: 'AR-W', country_id: 'AR', name: 'Corrientes' }, { id: 'AR-X', country_id: 'AR', name: 'Córdoba' },
  { id: 'AR-Y', country_id: 'AR', name: 'Jujuy' }, { id: 'AR-Z', country_id: 'AR', name: 'Santa Cruz' }
];

// Switzerland (cantons)
const chStates = [
  'AG', 'AR', 'AI', 'BL', 'BS', 'BE', 'FR', 'GE', 'GL', 'GR', 'JU', 'LU', 'NE', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG', 'TI', 'UR', 'VS', 'VD', 'ZG', 'ZH'
].map((code, i) => ({
  id: code,
  country_id: 'CH',
  name: ['Aargau', 'Appenzell Ausserrhoden', 'Appenzell Innerrhoden', 'Basel-Landschaft', 'Basel-Stadt', 'Bern', 'Fribourg', 'Geneva', 'Glarus', 'Graubünden', 'Jura', 'Lucerne', 'Neuchâtel', 'Nidwalden', 'Obwalden', 'St. Gallen', 'Schaffhausen', 'Solothurn', 'Schwyz', 'Thurgau', 'Ticino', 'Uri', 'Valais', 'Vaud', 'Zug', 'Zurich'][i]
}));

// Qatar (municipalities)
const qaStates = [
  { id: 'QA-DA', country_id: 'QA', name: 'Doha' }, { id: 'QA-KH', country_id: 'QA', name: 'Al Khor' },
  { id: 'QA-WA', country_id: 'QA', name: 'Al Wakrah' }, { id: 'QA-RA', country_id: 'QA', name: 'Al Rayyan' },
  { id: 'QA-MS', country_id: 'QA', name: 'Al Shamal' }, { id: 'QA-US', country_id: 'QA', name: 'Umm Salal' }
];

// Kuwait (governorates)
const kwStates = [
  { id: 'KW-AH', country_id: 'KW', name: 'Ahmadi' }, { id: 'KW-FA', country_id: 'KW', name: 'Farwaniya' },
  { id: 'KW-HA', country_id: 'KW', name: 'Hawalli' }, { id: 'KW-JA', country_id: 'KW', name: 'Jahra' },
  { id: 'KW-KU', country_id: 'KW', name: 'Kuwait City' }, { id: 'KW-MU', country_id: 'KW', name: 'Mubarak Al-Kabeer' }
];

// Bahrain (governorates)
const bhStates = [
  { id: 'BH-CA', country_id: 'BH', name: 'Capital' }, { id: 'BH-MU', country_id: 'BH', name: 'Muharraq' },
  { id: 'BH-NO', country_id: 'BH', name: 'Northern' }, { id: 'BH-SO', country_id: 'BH', name: 'Southern' }
];

// Oman (governorates)
const omStates = [
  { id: 'OM-DQ', country_id: 'OM', name: 'Ad Dakhiliyah' }, { id: 'OM-BA', country_id: 'OM', name: 'Al Batinah North' },
  { id: 'OM-BS', country_id: 'OM', name: 'Al Batinah South' }, { id: 'OM-BU', country_id: 'OM', name: 'Al Buraimi' },
  { id: 'OM-DA', country_id: 'OM', name: 'Dhofar' }, { id: 'OM-MA', country_id: 'OM', name: 'Muscat' },
  { id: 'OM-MU', country_id: 'OM', name: 'Musandam' }, { id: 'OM-SH', country_id: 'OM', name: 'Ash Sharqiyah North' },
  { id: 'OM-SS', country_id: 'OM', name: 'Ash Sharqiyah South' }, { id: 'OM-ZH', country_id: 'OM', name: 'Ad Dhahirah' },
  { id: 'OM-WU', country_id: 'OM', name: 'Al Wusta' }
];

const states = [
  ...indiaStates, ...usStates, ...ukStates, ...caStates, ...auStates, ...aeStates,
  ...pkStates, ...bdStates, ...lkStates, ...npStates,
  ...deStates, ...frStates, ...esStates, ...itStates, ...mxStates, ...brStates,
  ...zaStates, ...saStates, ...myStates, ...phStates, ...thStates, ...vnStates,
  ...nzStates, ...nlStates, ...jpStates, ...cnStates, ...krStates, ...idStates,
  ...egStates, ...keStates, ...ngStates, ...arStates, ...chStates,
  ...qaStates, ...kwStates, ...bhStates, ...omStates
];

// Cities: India (all states) + US/UK major
function city(id, state_id, name) { return { id, state_id, name }; }

const indiaCities = [
  // Delhi
  city('DL-NEWDELHI', 'DL', 'New Delhi'), city('DL-DELHI', 'DL', 'Delhi'),
  // Maharashtra
  city('MH-MUMBAI', 'MH', 'Mumbai'), city('MH-PUNE', 'MH', 'Pune'), city('MH-NAGPUR', 'MH', 'Nagpur'), city('MH-THANE', 'MH', 'Thane'), city('MH-NASHIK', 'MH', 'Nashik'), city('MH-AURANGABAD', 'MH', 'Aurangabad'), city('MH-NAVI MUMBAI', 'MH', 'Navi Mumbai'), city('MH-SOLAPUR', 'MH', 'Solapur'), city('MH-KOLHAPUR', 'MH', 'Kolhapur'), city('MH-AMRAVATI', 'MH', 'Amravati'),
  // Karnataka
  city('KA-BANGALORE', 'KA', 'Bengaluru'), city('KA-MYSORE', 'KA', 'Mysuru'), city('KA-HUBLI', 'KA', 'Hubballi'), city('KA-MANGALURU', 'KA', 'Mangaluru'), city('KA-BELGAUM', 'KA', 'Belagavi'), city('KA-GULBARGA', 'KA', 'Kalaburagi'), city('KA-DHARWAD', 'KA', 'Dharwad'), city('KA-BIDAR', 'KA', 'Bidar'),
  // Tamil Nadu
  city('TN-CHENNAI', 'TN', 'Chennai'), city('TN-COIMBATORE', 'TN', 'Coimbatore'), city('TN-MADURAI', 'TN', 'Madurai'), city('TN-TIRUCHIRAPPALLI', 'TN', 'Tiruchirappalli'), city('TN-SALEM', 'TN', 'Salem'), city('TN-TIRUNELVELI', 'TN', 'Tirunelveli'), city('TN-TIRUPPUR', 'TN', 'Tiruppur'), city('TN-RANIPET', 'TN', 'Ranipet'), city('TN-NAGERCOIL', 'TN', 'Nagercoil'), city('TN-THANJAVUR', 'TN', 'Thanjavur'),
  // Telangana
  city('TG-HYDERABAD', 'TG', 'Hyderabad'), city('TG-SECUNDERABAD', 'TG', 'Secunderabad'), city('TG-WARANGAL', 'TG', 'Warangal'), city('TG-NIZAMABAD', 'TG', 'Nizamabad'), city('TG-KARIMNAGAR', 'TG', 'Karimnagar'), city('TG-RAMAGUNDAM', 'TG', 'Ramagundam'), city('TG-KHAMMAM', 'TG', 'Khammam'), city('TG-MAHBUBNAGAR', 'TG', 'Mahabubnagar'),
  // Kerala
  city('KL-TRIVANDRUM', 'KL', 'Thiruvananthapuram'), city('KL-KOCHI', 'KL', 'Kochi'), city('KL-KOZHIKODE', 'KL', 'Kozhikode'), city('KL-THRISSUR', 'KL', 'Thrissur'), city('KL-KOLLAM', 'KL', 'Kollam'), city('KL-ALAPPUZHA', 'KL', 'Alappuzha'), city('KL-PALAKKAD', 'KL', 'Palakkad'), city('KL-KANNUR', 'KL', 'Kannur'), city('KL-KASARAGOD', 'KL', 'Kasaragod'), city('KL-IDUKKI', 'KL', 'Idukki'),
  // Gujarat
  city('GJ-AHMEDABAD', 'GJ', 'Ahmedabad'), city('GJ-SURAT', 'GJ', 'Surat'), city('GJ-VADODARA', 'GJ', 'Vadodara'), city('GJ-RAJKOT', 'GJ', 'Rajkot'), city('GJ-BHAVNAGAR', 'GJ', 'Bhavnagar'), city('GJ-JAMNAGAR', 'GJ', 'Jamnagar'), city('GJ-JUNAGADH', 'GJ', 'Junagadh'), city('GJ-GANDHINAGAR', 'GJ', 'Gandhinagar'), city('GJ-ANAND', 'GJ', 'Anand'), city('GJ-NAVSARI', 'GJ', 'Navsari'), city('GJ-MORBI', 'GJ', 'Morbi'), city('GJ-NADIAD', 'GJ', 'Nadiad'), city('GJ-BHARUCH', 'GJ', 'Bharuch'), city('GJ-PORBANDAR', 'GJ', 'Porbandar'), city('GJ-GANDHIDHAM', 'GJ', 'Gandhidham'),
  // Rajasthan
  city('RJ-JAIPUR', 'RJ', 'Jaipur'), city('RJ-JODHPUR', 'RJ', 'Jodhpur'), city('RJ-UDAIPUR', 'RJ', 'Udaipur'), city('RJ-KOTA', 'RJ', 'Kota'), city('RJ-BIKANER', 'RJ', 'Bikaner'), city('RJ-AJMER', 'RJ', 'Ajmer'), city('RJ-BHILWARA', 'RJ', 'Bhilwara'), city('RJ-ALWAR', 'RJ', 'Alwar'), city('RJ-BHARATPUR', 'RJ', 'Bharatpur'), city('RJ-SIKAR', 'RJ', 'Sikar'), city('RJ-PALI', 'RJ', 'Pali'), city('RJ-SRI GANGANAGAR', 'RJ', 'Sri Ganganagar'), city('RJ-TONK', 'RJ', 'Tonk'), city('RJ-JHUNJHUNU', 'RJ', 'Jhunjhunu'), city('RJ-HANUMANGARH', 'RJ', 'Hanumangarh'),
  // Uttar Pradesh
  city('UP-LUCKNOW', 'UP', 'Lucknow'), city('UP-KANPUR', 'UP', 'Kanpur'), city('UP-AGRA', 'UP', 'Agra'), city('UP-NOIDA', 'UP', 'Noida'), city('UP-GHAZIABAD', 'UP', 'Ghaziabad'), city('UP-VARANASI', 'UP', 'Varanasi'), city('UP-MEERUT', 'UP', 'Meerut'), city('UP-ALLAHABAD', 'UP', 'Prayagraj'), city('UP-BAREILLY', 'UP', 'Bareilly'), city('UP-ALIGARH', 'UP', 'Aligarh'), city('UP-MORADABAD', 'UP', 'Moradabad'), city('UP-SAHARANPUR', 'UP', 'Saharanpur'), city('UP-GORAKHPUR', 'UP', 'Gorakhpur'), city('UP-FIROZABAD', 'UP', 'Firozabad'), city('UP-JHANSI', 'UP', 'Jhansi'), city('UP-MUZAFFARNAGAR', 'UP', 'Muzaffarnagar'), city('UP-MATHURA', 'UP', 'Mathura'), city('UP-RAMPUR', 'UP', 'Rampur'), city('UP-SHAHJAHANPUR', 'UP', 'Shahjahanpur'), city('UP-FARRUKHABAD', 'UP', 'Farrukhabad'),
  // West Bengal
  city('WB-KOLKATA', 'WB', 'Kolkata'), city('WB-HOWRAH', 'WB', 'Howrah'), city('WB-DURGAPUR', 'WB', 'Durgapur'), city('WB-ASANSOL', 'WB', 'Asansol'), city('WB-SILIGURI', 'WB', 'Siliguri'), city('WB-BARDHAMAN', 'WB', 'Bardhaman'), city('WB-MALDA', 'WB', 'Malda'), city('WB-BAHARAMPUR', 'WB', 'Berhampore'), city('WB-HALDIYA', 'WB', 'Haldia'), city('WB-RANAGHAT', 'WB', 'Ranaghat'), city('WB-JALPAIGURI', 'WB', 'Jalpaiguri'), city('WB-KHARAGPUR', 'WB', 'Kharagpur'), city('WB-NAIHATI', 'WB', 'Naihati'), city('WB-SERAMPORE', 'WB', 'Serampore'), city('WB-BONGAON', 'WB', 'Bongaon'),
  // Punjab
  city('PB-CHANDIGARH', 'PB', 'Chandigarh'), city('PB-LUDHIANA', 'PB', 'Ludhiana'), city('PB-AMRITSAR', 'PB', 'Amritsar'), city('PB-JALANDHAR', 'PB', 'Jalandhar'), city('PB-PATIALA', 'PB', 'Patiala'), city('PB-BATHINDA', 'PB', 'Bathinda'), city('PB-MOHALI', 'PB', 'Mohali'), city('PB-HOSHIARPUR', 'PB', 'Hoshiarpur'), city('PB-BARNALA', 'PB', 'Barnala'), city('PB-MUKTSAR', 'PB', 'Muktsar'), city('PB-MALERKOTLA', 'PB', 'Malerkotla'), city('PB-PATHANKOT', 'PB', 'Pathankot'), city('PB-MANSA', 'PB', 'Mansa'), city('PB-FEROZPUR', 'PB', 'Firozpur'), city('PB-MALOUT', 'PB', 'Malout'),
  // Haryana
  city('HR-GURUGRAM', 'HR', 'Gurugram'), city('HR-FARIDABAD', 'HR', 'Faridabad'), city('HR-PANIPAT', 'HR', 'Panipat'), city('HR-ROHTAK', 'HR', 'Rohtak'), city('HR-HISAR', 'HR', 'Hisar'), city('HR-KARNAL', 'HR', 'Karnal'), city('HR-SONIPAT', 'HR', 'Sonipat'), city('HR-PANCHKULA', 'HR', 'Panchkula'), city('HR-BHIWANI', 'HR', 'Bhiwani'), city('HR-AMBALA', 'HR', 'Ambala'), city('HR-YAMUNANAGAR', 'HR', 'Yamunanagar'), city('HR-BAHADURGARH', 'HR', 'Bahadurgarh'), city('HR-JIND', 'HR', 'Jind'), city('HR-KURUKSHETRA', 'HR', 'Kurukshetra'), city('HR-SIRSA', 'HR', 'Sirsa'), city('HR-REWARI', 'HR', 'Rewari'), city('HR-PALWAL', 'HR', 'Palwal'), city('HR-NUH', 'HR', 'Nuh'), city('HR-MAHENDRAGARH', 'HR', 'Mahendragarh'), city('HR-FATEHABAD', 'HR', 'Fatehabad'),
  // Madhya Pradesh
  city('MP-BHOPAL', 'MP', 'Bhopal'), city('MP-INDORE', 'MP', 'Indore'), city('MP-JABALPUR', 'MP', 'Jabalpur'), city('MP-GWALIOR', 'MP', 'Gwalior'), city('MP-UJJAIN', 'MP', 'Ujjain'), city('MP-SAGAR', 'MP', 'Sagar'), city('MP-DEWAS', 'MP', 'Dewas'), city('MP-SATNA', 'MP', 'Satna'), city('MP-RATLAM', 'MP', 'Ratlam'), city('MP-REWA', 'MP', 'Rewa'), city('MP-MURENA', 'MP', 'Morena'), city('MP-SINGRAULI', 'MP', 'Singrauli'), city('MP-BURHANPUR', 'MP', 'Burhanpur'), city('MP-KHANDWA', 'MP', 'Khandwa'), city('MP-BHIND', 'MP', 'Bhind'),
  // Andhra Pradesh
  city('AP-VISAKHAPATNAM', 'AP', 'Visakhapatnam'), city('AP-VIJAYAWADA', 'AP', 'Vijayawada'), city('AP-GUNTUR', 'AP', 'Guntur'), city('AP-NELLORE', 'AP', 'Nellore'), city('AP-KURNOOL', 'AP', 'Kurnool'), city('AP-KAKINADA', 'AP', 'Kakinada'), city('AP-KADAPA', 'AP', 'Kadapa'), city('AP-RAJAMAHENDRAVARAM', 'AP', 'Rajamahendravaram'), city('AP-TIRUPATI', 'AP', 'Tirupati'), city('AP-ANANTAPUR', 'AP', 'Anantapur'), city('AP-ELURU', 'AP', 'Eluru'), city('AP-ONGole', 'AP', 'Ongole'), city('AP-CHITTOR', 'AP', 'Chittoor'), city('AP-NANDYAL', 'AP', 'Nandyal'), city('AP-MACHILIPATNAM', 'AP', 'Machilipatnam'),
  // Goa
  city('GA-PANJIM', 'GA', 'Panaji'), city('GA-MARGAO', 'GA', 'Margao'), city('GA-VASCO', 'GA', 'Vasco da Gama'), city('GA-MAPUSA', 'GA', 'Mapusa'), city('GA-PONDA', 'GA', 'Ponda'), city('GA-BICHOLIM', 'GA', 'Bicholim'), city('GA-CUNCOLIM', 'GA', 'Cuncolim'), city('GA-CURCHOREM', 'GA', 'Curchorem'), city('GA-SANQUELIM', 'GA', 'Sanquelim'), city('GA-QUEPEM', 'GA', 'Quepem'),
  // Chandigarh
  city('CH-CHANDIGARH', 'CH', 'Chandigarh'),
  // Assam
  city('AS-GUWAHATI', 'AS', 'Guwahati'), city('AS-SILCHAR', 'AS', 'Silchar'), city('AS-DIBRUGARH', 'AS', 'Dibrugarh'), city('AS-JORHAT', 'AS', 'Jorhat'), city('AS-NAGAON', 'AS', 'Nagaon'), city('AS-TEZPUR', 'AS', 'Tezpur'), city('AS-BONGAIGAON', 'AS', 'Bongaigaon'), city('AS-DHUBRI', 'AS', 'Dhubri'), city('AS-DIPHU', 'AS', 'Diphu'), city('AS-NALBARI', 'AS', 'Nalbari'), city('AS-GOLAGHAT', 'AS', 'Golaghat'), city('AS-BARPETA', 'AS', 'Barpeta'), city('AS-SIVASAGAR', 'AS', 'Sivasagar'), city('AS-KARIMGANJ', 'AS', 'Karimganj'),   // Bihar
  city('BR-PATNA', 'BR', 'Patna'), city('BR-GAYA', 'BR', 'Gaya'), city('BR-BHAGALPUR', 'BR', 'Bhagalpur'), city('BR-MUZAFFARPUR', 'BR', 'Muzaffarpur'), city('BR-PURNIA', 'BR', 'Purnia'), city('BR-DARBHANGA', 'BR', 'Darbhanga'), city('BR-BEGUSARAI', 'BR', 'Begusarai'), city('BR-KATIHAR', 'BR', 'Katihar'), city('BR-MUNGER', 'BR', 'Munger'), city('BR-ARRAH', 'BR', 'Arrah'), city('BR-SAHARSA', 'BR', 'Saharsa'), city('BR-SIWAN', 'BR', 'Siwan'), city('BR-SAMASTIPUR', 'BR', 'Samastipur'), city('BR-HAJIPUR', 'BR', 'Hajipur'), city('BR-DEOGHAR', 'BR', 'Dehri'),
  // Chhattisgarh
  city('CT-RAIPUR', 'CT', 'Raipur'), city('CT-BILASPUR', 'CT', 'Bilaspur'), city('CT-DURG', 'CT', 'Durg'), city('CT-BHILAI', 'CT', 'Bhilai'), city('CT-KORBA', 'CT', 'Korba'), city('CT-RAIGARH', 'CT', 'Raigarh'), city('CT-JAGDALPUR', 'CT', 'Jagdalpur'), city('CT-AMBIKAPUR', 'CT', 'Ambikapur'), city('CT-DHAMTARI', 'CT', 'Dhamtari'), city('CT-DURG2', 'CT', 'Rajnandgaon'), city('CT-MAHASAMUND', 'CT', 'Mahasamund'), city('CT-KANKER', 'CT', 'Kanker'), city('CT-BASTAR', 'CT', 'Bastar'), city('CT-KORIYA', 'CT', 'Koriya'), city('CT-SURGUJA', 'CT', 'Surguja'),
  // Himachal Pradesh
  city('HP-SHIMLA', 'HP', 'Shimla'), city('HP-DHARAMSALA', 'HP', 'Dharamshala'), city('HP-SOLAN', 'HP', 'Solan'), city('HP-MANDI', 'HP', 'Mandi'), city('HP-PALAMPUR', 'HP', 'Palampur'), city('HP-BADDI', 'HP', 'Baddi'), city('HP-NAHAN', 'HP', 'Nahan'), city('HP-KULLU', 'HP', 'Kullu'), city('HP-MANALI', 'HP', 'Manali'), city('HP-CHAMBA', 'HP', 'Chamba'), city('HP-NADAUN', 'HP', 'Nadaun'), city('HP-AMB', 'HP', 'Amb'), city('HP-ROHRU', 'HP', 'Rohru'), city('HP-SUNDARNAGAR', 'HP', 'Sundarnagar'), city('HP-UNA', 'HP', 'Una'),
  // Jharkhand
  city('JH-RANCHI', 'JH', 'Ranchi'), city('JH-JAMSHEDPUR', 'JH', 'Jamshedpur'), city('JH-DHANBAD', 'JH', 'Dhanbad'), city('JH-BOKARO', 'JH', 'Bokaro'), city('JH-DEOGHAR', 'JH', 'Deoghar'), city('JH-HAZARIBAGH', 'JH', 'Hazaribagh'), city('JH-GIRIDIH', 'JH', 'Giridih'), city('JH-RAMGARH', 'JH', 'Ramgarh'), city('JH-PHUSRO', 'JH', 'Phusro'), city('JH-CHAS', 'JH', 'Chas'), city('JH-MEDININAGAR', 'JH', 'Medininagar'), city('JH-SAHEBGANJ', 'JH', 'Sahebganj'), city('JH-CHAKRADHARPUR', 'JH', 'Chakradharpur'), city('JH-DUMKA', 'JH', 'Dumka'), city('JH-GHATSILA', 'JH', 'Ghatshila'),
  // Odisha
  city('OR-BHUBANESWAR', 'OR', 'Bhubaneswar'), city('OR-CUTTACK', 'OR', 'Cuttack'), city('OR-ROURKELA', 'OR', 'Rourkela'), city('OR-BERHAMPUR', 'OR', 'Berhampur'), city('OR-SAMBALPUR', 'OR', 'Sambalpur'), city('OR-PURI', 'OR', 'Puri'), city('OR-BALASORE', 'OR', 'Balasore'), city('OR-BARIPADA', 'OR', 'Baripada'), city('OR-JHARSUGUDA', 'OR', 'Jharsuguda'), city('OR-BARGARH', 'OR', 'Bargarh'), city('OR-JEYPORE', 'OR', 'Jeypore'), city('OR-BHADRAK', 'OR', 'Bhadrak'), city('OR-BALANGIR', 'OR', 'Balangir'), city('OR-ANGUL', 'OR', 'Angul'), city('OR-DHENKANAL', 'OR', 'Dhenkanal'),
  // Uttarakhand
  city('UT-DEHRADUN', 'UT', 'Dehradun'), city('UT-HARIDWAR', 'UT', 'Haridwar'), city('UT-RISHIKESH', 'UT', 'Rishikesh'), city('UT-HALDWANI', 'UT', 'Haldwani'), city('UT-ROORKEE', 'UT', 'Roorkee'), city('UT-KASHIPUR', 'UT', 'Kashipur'), city('UT-RUDRAPUR', 'UT', 'Rudrapur'), city('UT-PITHORAGARH', 'UT', 'Pithoragarh'), city('UT-RAMNAGAR', 'UT', 'Ramnagar'), city('UT-MUSSOORIE', 'UT', 'Mussoorie'), city('UT-NAINITAL', 'UT', 'Nainital'), city('UT-ALMORA', 'UT', 'Almora'), city('UT-PAURI', 'UT', 'Pauri'), city('UT-TEHRI', 'UT', 'Tehri'), city('UT-CHAMOLI', 'UT', 'Chamoli'),
  // Sikkim
  city('SK-GANGTOK', 'SK', 'Gangtok'), city('SK-NAMCHI', 'SK', 'Namchi'), city('SK-GEYZING', 'SK', 'Geyzing'), city('SK-RANGPO', 'SK', 'Rangpo'), city('SK-MELLI', 'SK', 'Melli'), city('SK-JORTHANG', 'SK', 'Jorethang'), city('SK-RAVANGLA', 'SK', 'Ravangla'), city('SK-YUKSOM', 'SK', 'Yuksom'), city('SK-SINGTAM', 'SK', 'Singtam'), city('SK-RONGPO', 'SK', 'Rongli'),
  // NE and smaller states (representative cities)
  city('AN-PORT BLAIR', 'AN', 'Port Blair'), city('AN-DIGLIPUR', 'AN', 'Diglipur'), city('AN-RANGAT', 'AN', 'Rangat'), city('AR-ITANAGAR', 'AR', 'Itanagar'), city('AR-NAHARLAGUN', 'AR', 'Naharlagun'), city('AR-PASIGHAT', 'AR', 'Pasighat'), city('MN-IMPHAL', 'MN', 'Imphal'), city('MN-THOUBAL', 'MN', 'Thoubal'), city('ML-SHILLONG', 'ML', 'Shillong'), city('ML-TURA', 'ML', 'Tura'), city('MZ-AIZAWL', 'MZ', 'Aizawl'), city('MZ-LUNGLEI', 'MZ', 'Lunglei'), city('NL-KOHIMA', 'NL', 'Kohima'), city('NL-DIMAPUR', 'NL', 'Dimapur'), city('TR-AGARTALA', 'TR', 'Agartala'), city('TR-UDHAYPUR', 'TR', 'Udaipur'), city('DN-SILVASSA', 'DN', 'Silvassa'), city('DN-DAMAN', 'DN', 'Daman'), city('LD-KAVARATTI', 'LD', 'Kavaratti'), city('JK-SRINAGAR', 'JK', 'Srinagar'), city('JK-JAMMU', 'JK', 'Jammu'), city('LA-LEH', 'LA', 'Leh'), city('LA-KARGIL', 'LA', 'Kargil'), city('PY-PUDUCHERRY', 'PY', 'Puducherry'), city('PY-KARAIKAL', 'PY', 'Karaikal'), city('PY-YANAM', 'PY', 'Yanam'), city('PY-MAHÉ', 'PY', 'Mahé')
];

// US major cities (sample per state)
const usCities = [
  city('US-CA-LA', 'CA', 'Los Angeles'), city('US-CA-SF', 'CA', 'San Francisco'), city('US-CA-SD', 'CA', 'San Diego'), city('US-CA-SJ', 'CA', 'San Jose'), city('US-NY-NYC', 'NY', 'New York City'), city('US-NY-BUF', 'NY', 'Buffalo'), city('US-NY-ROCH', 'NY', 'Rochester'), city('US-TX-HOU', 'TX', 'Houston'), city('US-TX-DAL', 'TX', 'Dallas'), city('US-TX-AUS', 'TX', 'Austin'), city('US-TX-SAN', 'TX', 'San Antonio'), city('US-FL-MIA', 'FL', 'Miami'), city('US-FL-ORL', 'FL', 'Orlando'), city('US-FL-TPA', 'FL', 'Tampa'), city('US-IL-CHI', 'IL', 'Chicago'), city('US-WA-SEA', 'WA', 'Seattle'), city('US-DC-DC', 'DC', 'Washington'), city('US-MA-BOS', 'MA', 'Boston'), city('US-GA-ATL', 'GA', 'Atlanta'), city('US-NV-LV', 'NV', 'Las Vegas'), city('US-AZ-PHX', 'AZ', 'Phoenix'), city('US-CO-DEN', 'CO', 'Denver'), city('US-PA-PHI', 'PA', 'Philadelphia'), city('US-MI-DET', 'MI', 'Detroit'), city('US-MN-MSP', 'MN', 'Minneapolis'), city('US-OH-CLE', 'OH', 'Cleveland'), city('US-NC-CLT', 'NC', 'Charlotte'), city('US-OR-PDX', 'OR', 'Portland')
];

// UK major cities
const ukCities = [
  city('GB-ENG-LON', 'ENG', 'London'), city('GB-ENG-BIR', 'ENG', 'Birmingham'), city('GB-ENG-MAN', 'ENG', 'Manchester'), city('GB-ENG-LEE', 'ENG', 'Leeds'), city('GB-ENG-LIV', 'ENG', 'Liverpool'), city('GB-ENG-SHE', 'ENG', 'Sheffield'), city('GB-ENG-BRI', 'ENG', 'Bristol'), city('GB-ENG-NEW', 'ENG', 'Newcastle upon Tyne'), city('GB-SCT-GLA', 'SCT', 'Glasgow'), city('GB-SCT-EDI', 'SCT', 'Edinburgh'), city('GB-SCT-ABE', 'SCT', 'Aberdeen'), city('GB-WLS-CAR', 'WLS', 'Cardiff'), city('GB-WLS-SWA', 'WLS', 'Swansea'), city('GB-NIR-BEL', 'NIR', 'Belfast'), city('GB-NIR-DER', 'NIR', 'Derry')
];

const cities = [...indiaCities, ...usCities, ...ukCities];

const out = {
  countries,
  states,
  cities
};

const outPath = path.join(__dirname, '../data/locations.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote', outPath, '- countries:', countries.length, 'states:', states.length, 'cities:', cities.length);
