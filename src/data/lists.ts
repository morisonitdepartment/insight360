import type { Segment, Subcategory } from '@/types'

export interface BrandDef {
  id: string
  name: string
  segment: Segment
  subcategory: Subcategory
  locations: string[]
}

/** Fictional brands and locations for "Demo Hospitality & Entertainment Group". */
export const BRAND_DEFS: BrandDef[] = [
  { id: 'br-01', name: 'Harbour Kitchen', segment: 'F&B', subcategory: 'Fine Dining', locations: ['The Pearl', 'West Bay', 'Lusail Marina'] },
  { id: 'br-02', name: 'Olive & Ember', segment: 'F&B', subcategory: 'Fine Dining', locations: ['Msheireb', 'Katara'] },
  { id: 'br-03', name: 'The Terrace Café', segment: 'F&B', subcategory: 'Café', locations: ['Corniche', 'Education City', 'Al Sadd', 'Festival Mall'] },
  { id: 'br-04', name: 'Urban Fork', segment: 'F&B', subcategory: 'Casual Dining', locations: ['Lusail Boulevard', 'Al Wakrah', 'Villaggio Mall', 'Al Khor'] },
  { id: 'br-05', name: 'Palm Kitchen', segment: 'F&B', subcategory: 'Casual Dining', locations: ['Souq District', 'Bin Mahmoud', 'Al Rayyan'] },
  { id: 'br-06', name: 'Cedar Table', segment: 'F&B', subcategory: 'Casual Dining', locations: ['West Bay', 'The Pearl'] },
  { id: 'br-07', name: 'Saffron Lane', segment: 'F&B', subcategory: 'Fast Casual', locations: ['City Centre Mall', 'Mall of Qatar', 'Al Gharrafa', 'Old Airport'] },
  { id: 'br-08', name: 'Marina Grill', segment: 'F&B', subcategory: 'Casual Dining', locations: ['Lusail Marina', 'Al Wakrah Corniche'] },
  { id: 'br-09', name: 'The Courtyard', segment: 'F&B', subcategory: 'Food Court', locations: ['Mall of Qatar', 'Doha Festival City', 'Place Vendôme'] },
  { id: 'br-10', name: 'Brew District', segment: 'F&B', subcategory: 'Café', locations: ['Msheireb', 'Lusail Boulevard', 'Al Dafna'] },
  { id: 'br-11', name: 'Adventure Zone', segment: 'Entertainment', subcategory: 'Indoor Entertainment', locations: ['Mall of Qatar', 'Doha Festival City', 'Al Wakrah'] },
  { id: 'br-12', name: 'Pixel Arena', segment: 'Entertainment', subcategory: 'Indoor Entertainment', locations: ['Lusail Boulevard', 'City Centre Mall'] },
  { id: 'br-13', name: 'Skyline Cinema', segment: 'Entertainment', subcategory: 'Cinema', locations: ['The Pearl', 'Villaggio Mall', 'Place Vendôme'] },
  { id: 'br-14', name: 'Wonder Park', segment: 'Entertainment', subcategory: 'Attraction', locations: ['Lusail', 'Al Khor'] },
  { id: 'br-15', name: 'Velocity Karting', segment: 'Entertainment', subcategory: 'Recreation', locations: ['Lusail', 'Industrial Area'] },
  { id: 'br-16', name: 'PlaySphere', segment: 'Entertainment', subcategory: 'Family Entertainment', locations: ['Doha Festival City', 'Al Rayyan'] },
  { id: 'br-17', name: 'Quest Rooms', segment: 'Entertainment', subcategory: 'Indoor Entertainment', locations: ['Msheireb', 'The Pearl'] },
  { id: 'br-18', name: 'Jump District', segment: 'Entertainment', subcategory: 'Recreation', locations: ['Al Gharrafa', 'Al Wakrah'] },
  { id: 'br-19', name: 'Galaxy Bowling', segment: 'Entertainment', subcategory: 'Recreation', locations: ['Al Sadd'] },
  { id: 'br-20', name: 'Family Fun Hub', segment: 'Entertainment', subcategory: 'Family Entertainment', locations: ['Doha Festival City'] },
]

export const REGION_BY_LOCATION: Record<string, string> = {
  'The Pearl': 'West Bay & Pearl',
  'West Bay': 'West Bay & Pearl',
  'Al Dafna': 'West Bay & Pearl',
  'Corniche': 'Central Doha',
  'Msheireb': 'Central Doha',
  'Souq District': 'Central Doha',
  'Bin Mahmoud': 'Central Doha',
  'Al Sadd': 'Central Doha',
  'Old Airport': 'Central Doha',
  'Lusail Marina': 'Lusail',
  'Lusail Boulevard': 'Lusail',
  'Lusail': 'Lusail',
  'Katara': 'Lusail',
  'Al Khor': 'North',
  'Al Gharrafa': 'North',
  'Education City': 'North',
  'Al Rayyan': 'Al Rayyan',
  'Mall of Qatar': 'North',
  'Al Wakrah': 'South',
  'Al Wakrah Corniche': 'South',
  'Industrial Area': 'South',
  'Villaggio Mall': 'Al Rayyan',
  'City Centre Mall': 'West Bay & Pearl',
  'Festival Mall': 'Central Doha',
  'Doha Festival City': 'North',
  'Place Vendôme': 'Lusail',
}

/** Approximate 0-100 grid positions for the map-style location card */
export const MAP_BY_LOCATION: Record<string, [number, number]> = {
  'The Pearl': [72, 30],
  'West Bay': [66, 40],
  'Al Dafna': [63, 43],
  'Corniche': [58, 52],
  'Msheireb': [52, 58],
  'Souq District': [54, 60],
  'Bin Mahmoud': [48, 57],
  'Al Sadd': [44, 60],
  'Old Airport': [56, 70],
  'Lusail Marina': [70, 18],
  'Lusail Boulevard': [64, 16],
  'Lusail': [62, 12],
  'Katara': [68, 26],
  'Al Khor': [45, 4],
  'Al Gharrafa': [34, 42],
  'Education City': [30, 48],
  'Al Rayyan': [26, 58],
  'Mall of Qatar': [22, 52],
  'Al Wakrah': [62, 88],
  'Al Wakrah Corniche': [66, 90],
  'Industrial Area': [40, 82],
  'Villaggio Mall': [34, 62],
  'City Centre Mall': [64, 38],
  'Festival Mall': [50, 62],
  'Doha Festival City': [46, 24],
  'Place Vendôme': [60, 20],
}

export const MANAGER_NAMES = [
  'Khalid Al-Mansoori', 'Fatima Al-Kuwari', 'Rajesh Menon', 'Maria Santos', 'Ahmed Hassan', 'Layla Haddad',
  'Daniel Okoro', 'Priya Nair', 'Omar Saleh', 'Sophie Laurent', 'Yusuf Karim', 'Nadia Rahman',
  'Marco Bellini', 'Aisha Al-Thani', 'Tariq Mahmoud', 'Elena Petrova', 'Joseph Mathew', 'Hana Yamamoto',
  'Samir Fares', 'Grace Adeyemi', 'Bilal Sheikh', 'Anna Kowalski', 'Faisal Al-Dosari', 'Reem Abdullah',
  'Carlos Mendes', 'Zainab Hussain',
]

export const SHOPPER_NAMES: { name: string; gender: 'Female' | 'Male'; nationality: string; languages: string[] }[] = [
  { name: 'Sara Al-Naimi', gender: 'Female', nationality: 'Qatari', languages: ['Arabic', 'English'] },
  { name: 'James Whitfield', gender: 'Male', nationality: 'British', languages: ['English'] },
  { name: 'Amira Khalil', gender: 'Female', nationality: 'Lebanese', languages: ['Arabic', 'English', 'French'] },
  { name: 'Arjun Pillai', gender: 'Male', nationality: 'Indian', languages: ['English', 'Hindi', 'Malayalam'] },
  { name: 'Isabella Cruz', gender: 'Female', nationality: 'Filipino', languages: ['English', 'Tagalog'] },
  { name: 'Mohammed Farouk', gender: 'Male', nationality: 'Egyptian', languages: ['Arabic', 'English'] },
  { name: 'Chloe Martin', gender: 'Female', nationality: 'French', languages: ['French', 'English'] },
  { name: 'Hassan Al-Emadi', gender: 'Male', nationality: 'Qatari', languages: ['Arabic', 'English'] },
  { name: 'Nour Haddad', gender: 'Female', nationality: 'Jordanian', languages: ['Arabic', 'English'] },
  { name: 'David Chen', gender: 'Male', nationality: 'Canadian', languages: ['English', 'Mandarin'] },
  { name: 'Leila Rahimi', gender: 'Female', nationality: 'Iranian', languages: ['Farsi', 'English'] },
  { name: 'Thomas Becker', gender: 'Male', nationality: 'German', languages: ['German', 'English'] },
  { name: 'Aisha Mohammed', gender: 'Female', nationality: 'Sudanese', languages: ['Arabic', 'English'] },
  { name: 'Ravi Shankar', gender: 'Male', nationality: 'Indian', languages: ['English', 'Tamil', 'Hindi'] },
  { name: 'Emily Johnson', gender: 'Female', nationality: 'American', languages: ['English', 'Spanish'] },
  { name: 'Karim Benali', gender: 'Male', nationality: 'Moroccan', languages: ['Arabic', 'French', 'English'] },
  { name: 'Mei Tanaka', gender: 'Female', nationality: 'Japanese', languages: ['Japanese', 'English'] },
  { name: 'Ali Reza', gender: 'Male', nationality: 'Pakistani', languages: ['Urdu', 'English'] },
  { name: 'Olivia Brown', gender: 'Female', nationality: 'Australian', languages: ['English'] },
  { name: 'Samuel Adebayo', gender: 'Male', nationality: 'Nigerian', languages: ['English', 'Yoruba'] },
  { name: 'Yasmin Al-Sayed', gender: 'Female', nationality: 'Egyptian', languages: ['Arabic', 'English'] },
  { name: 'Lucas Ferreira', gender: 'Male', nationality: 'Brazilian', languages: ['Portuguese', 'English'] },
  { name: 'Hanan Qasim', gender: 'Female', nationality: 'Syrian', languages: ['Arabic', 'English'] },
  { name: 'Ben Mitchell', gender: 'Male', nationality: 'South African', languages: ['English', 'Afrikaans'] },
]

export const POSITIVE_OBSERVATIONS = [
  'Guest was greeted warmly within 20 seconds and escorted to the table.',
  'Staff demonstrated excellent menu knowledge and made confident recommendations.',
  'Table was spotless on arrival; cutlery and glassware correctly set.',
  'Order was delivered accurately and within the service standard.',
  'The team resolved a minor request immediately and with genuine courtesy.',
  'Safety briefing was thorough, clear and delivered with enthusiasm.',
  'Queue was actively managed with regular updates to waiting guests.',
  'Washrooms were clean, stocked and checked according to the visible schedule.',
  'Billing was accurate and the receipt was offered without prompting.',
  'Departure farewell was personal and the guest was invited to return.',
  'Digital booking confirmation arrived within one minute of purchase.',
  'Uniforms were complete and name badges clearly visible on all staff.',
]

export const IMPROVEMENT_OBSERVATIONS = [
  'Waiting time to receive the order exceeded the 15-minute standard.',
  'No upselling or cross-selling attempt was made during the order.',
  'Current promotions were not mentioned at any point of the journey.',
  'Table surface showed visible residue and was not wiped before seating.',
  'Washroom lacked hand soap and the floor was wet without signage.',
  'Staff did not establish eye contact during the initial greeting.',
  'Name badge missing on two of three staff members observed.',
  'Queue at the counter was not acknowledged; no wait-time communication.',
  'Menu board displayed outdated pricing for two items.',
  'Music volume made conversation difficult at the table.',
  'Equipment showed visible wear that should be scheduled for maintenance.',
  'Social-media enquiry was answered after 3 hours, outside the 2-hour standard.',
]

export const NARRATIVE_OPENERS = [
  'I arrived as a walk-in guest during the evening peak and followed the standard dine-in scenario.',
  'Visited as a family of three on a weekend afternoon following the family scenario briefing.',
  'Conducted the assessment as a solo professional during the weekday lunch period.',
  'Arrived as a tourist couple in the early evening and requested recommendations from staff.',
  'Booked online in advance and arrived ten minutes before the reservation time.',
  'Joined the queue at the ticketing counter during the mid-afternoon peak.',
]

export const ROOT_CAUSES = [
  'Insufficient staffing during peak period; shift roster not aligned with footfall.',
  'New team members not yet completed brand-standard induction.',
  'Cleaning checklist not enforced by shift supervisor.',
  'Sales-behaviour training not refreshed in the last two quarters.',
  'Preventive-maintenance schedule missed due to vendor delay.',
  'SOP document outdated following menu change.',
  'Safety briefing script not displayed at the activity entrance.',
  'Supervisor absence during the observed shift; no delegation in place.',
]

export const IPS = ['10.20.4.15', '10.20.4.22', '10.20.7.101', '172.16.8.44', '192.168.12.7', '10.20.9.63', '172.16.3.18']
