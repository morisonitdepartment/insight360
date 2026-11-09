import type { ClientProfile } from './types'

/**
 * Sterling Catering Services — Qatar.
 *
 * The original demonstration tenant, now assessed by service sequence: three
 * restaurant concepts, each on the sequence template for its service model.
 *
 *   Shebestan Palace  — full-service Persian dining      → FSR_DINE_IN
 *   Bennigan's        — casual dining                    → CASUAL_DINING
 *   Pizza Hut         — quick service, counter order     → QSR_COUNTER_ORDER
 *
 * Evaluation phase: the programme is limited to one trial location per brand —
 * Shebestan Palace – Al Sadd, Bennigan's – Qatar Tennis Federation and
 * Pizza Hut – Doha Festival City. Every person below is fictional, and
 * the client name and marks appear on the demonstration site alone.
 */
export const sterling: ClientProfile = {
  id: 'sterling',

  brand: {
    name: 'Sterling Catering Services',
    shortName: 'Sterling',
    logoFile: 'brands/sterling/logo.png',
    markFile: 'brands/sterling/mark.png',
    logoAlt: 'Sterling Catering Services',
    descriptor: 'Full-service, casual-dining and quick-service restaurants',
    estate: 'full-service, casual-dining and quick-service restaurants',
  },

  // Evaluation phase: the three trial restaurants with no assessments yet. The
  // annual plan is 3 restaurants x 4 visits; none completed. No trend is drawn
  // until there is data behind it.
  demoSeed: 'portfolio',
  snapshot: {
    outlets: 3,
    plannedVisits: 12,
    completedVisits: 0,
    visitsPerOutlet: 4,
    trend: [],
  },

  accent: {
    ramp: {
      50: '#fff4ed', 100: '#ffe4d2', 200: '#ffc5a3', 300: '#ff9e6b', 400: '#fa7f41',
      500: '#f46b25', 600: '#c9500f', 700: '#a33f0c', 800: '#85350d', 900: '#6e2e0f',
    },
    chart: '#f46b25',
    chartLight: '#ff9e6b',
  },

  org: {
    engagementName: 'Mystery Shopping Programme 2025/26',
    engagementStart: '2025-10-01',
    engagementEnd: '2026-11-30',
    timezone: 'Asia/Qatar (GMT+3)',
    currency: 'QAR',
    locale: 'en-QA',
  },

  portfolio: {
    brands: [
      {
        id: 'br-01',
        name: 'Shebestan Palace',
        segment: 'F&B',
        subcategory: 'Fine Dining',
        templateCode: 'SHEBESTAN_FINE_DINING',
        logoFile: 'brands/concepts/shebestan-palace.svg',
        locations: ['Al Sadd'],
      },
      {
        id: 'br-02',
        name: "Bennigan's",
        segment: 'F&B',
        subcategory: 'Casual Dining',
        templateCode: 'CASUAL_DINING',
        logoFile: 'brands/concepts/bennigans.svg',
        locations: ['Qatar Tennis Federation'],
      },
      {
        id: 'br-03',
        name: 'Pizza Hut',
        segment: 'F&B',
        subcategory: 'Fast Casual',
        templateCode: 'QSR_COUNTER_ORDER',
        logoFile: 'brands/concepts/pizza-hut.svg',
        locations: ['Doha Festival City'],
      },
    ],

    regionByLocation: {
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
  'Doha Festival City Mall': 'North',
  'Qatar Tennis Federation': 'West Bay & Pearl',
  'Place Vendôme': 'Lusail',
},

    /** Approximate 0-100 grid positions for the map-style location card. */
    mapByLocation: {
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
  'Doha Festival City Mall': [46, 24],
  'Qatar Tennis Federation': [60, 44],
  'Place Vendôme': [60, 20],
},

    /** Shebestan Palace – Al Sadd: the restaurant that fails, escalates and recovers. */
    storylineKey: 'br-01:Al Sadd',
  },

  people: {
    managers: [
  'Khalid Al-Mansoori', 'Fatima Al-Kuwari', 'Rajesh Menon', 'Maria Santos', 'Ahmed Hassan', 'Layla Haddad',
  'Daniel Okoro', 'Priya Nair', 'Omar Saleh', 'Sophie Laurent', 'Yusuf Karim', 'Nadia Rahman',
  'Marco Bellini', 'Aisha Al-Thani', 'Tariq Mahmoud', 'Elena Petrova', 'Joseph Mathew', 'Hana Yamamoto',
  'Samir Fares', 'Grace Adeyemi', 'Bilal Sheikh', 'Anna Kowalski', 'Faisal Al-Dosari', 'Reem Abdullah',
  'Carlos Mendes', 'Zainab Hussain',
],

    shoppers: [
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
],

    /** Evaluation-phase panel: the three shoppers running the trial visits. */
    // One shopper per concept for the trial, so each learns one service model
    // rather than three: Allaway on the fine-dining sequence, Ahmed on casual
    // dining, Roben on the counter-order sequence.
    trialShoppers: [
      { name: 'Ahmed Ouf', gender: 'Male', nationality: 'Egyptian', languages: ['Arabic', 'English'], assignedBrandId: 'br-02' },
      { name: 'Allaway Rashidi', gender: 'Male', nationality: 'Saudi', languages: ['Arabic', 'English'], assignedBrandId: 'br-01' },
      { name: 'Roben', gender: 'Male', nationality: 'Armenian', languages: ['Armenian', 'English', 'Russian'], assignedBrandId: 'br-03' },
    ],
  },
}
