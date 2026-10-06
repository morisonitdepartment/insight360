import type { ClientProfile } from './types'

/**
 * Hermanos Burgers — Malta.
 *
 * A single-brand burger group running two formats: full restaurants and smaller
 * Express counters. That shape is deliberate: with one brand, the demo's
 * comparisons run on region and format rather than on a brand league table,
 * which is what a franchise operator actually wants to see — are my sites
 * holding the same standard as each other?
 *
 * ABOUT THE LOCATIONS
 * The five sites the company advertises publicly (St Julian's, Paola, Mellieħa,
 * Birkirkara, Marsaskala) are included so the demo is recognisable. Everything
 * attached to them — scores, findings, failures, corrective actions — is
 * generated, and the sites beyond those five are illustrative franchise
 * locations, not real ones. Nothing here is a statement about how any real
 * branch performs.
 */
export const hermanos: ClientProfile = {
  id: 'hermanos',

  brand: {
    name: 'Hermanos Burgers',
    shortName: 'Hermanos',
    logoFile: 'brands/hermanos/logo.jpg',
    logoAlt: 'Hermanos Burgers',
    descriptor: 'Burger restaurants and Express counters across Malta',
    estate: 'burger restaurants and Express counters',
  },

  // Matches the seeded dataset: 18 outlets x 4 visits a year, 54 completed by
  // the storyline date. Verified against the dashboard, not guessed.
  snapshot: {
    outlets: 18,
    plannedVisits: 72,
    completedVisits: 54,
    visitsPerOutlet: 4,
    trend: [81.2, 82.4, 80.9, 83.6, 82.1, 83.0, 84.2, 85.1, 84.4, 83.1, 82.8, 83.6],
  },

  org: {
    engagementName: 'Brand Standards Programme 2026/27',
    engagementStart: '2026-01-05',
    engagementEnd: '2026-12-31',
    timezone: 'Europe/Malta (CET)',
    currency: 'EUR',
    locale: 'en-MT',
  },

  portfolio: {
    brands: [
      {
        id: 'br-01',
        name: 'Hermanos Burgers',
        segment: 'F&B',
        subcategory: 'Casual Dining',
        locations: [
          // Publicly advertised sites.
          "St Julian's",
          'Paola',
          'Mellieħa',
          'Birkirkara',
          'Marsaskala',
          // Illustrative franchise network.
          'Sliema',
          'Valletta',
          'Mosta',
          'Naxxar',
          'Rabat',
          'Żabbar',
          'Victoria (Gozo)',
          { name: 'Qormi', subcategory: 'Fast Casual' },
          { name: 'Msida', subcategory: 'Fast Casual' },
          { name: 'Buġibba', subcategory: 'Fast Casual' },
          { name: 'Gżira', subcategory: 'Fast Casual' },
          { name: 'The Point, Sliema', subcategory: 'Food Court' },
          { name: 'Pavi, Qormi', subcategory: 'Food Court' },
        ],
      },
    ],

    // Malta's own regional grouping, as an operator would report it.
    regionByLocation: {
      'Mellieħa': 'Northern',
      'Buġibba': 'Northern',
      'Naxxar': 'Northern',
      'Mosta': 'Northern',
      "St Julian's": 'Northern Harbour',
      'Sliema': 'Northern Harbour',
      'The Point, Sliema': 'Northern Harbour',
      'Gżira': 'Northern Harbour',
      'Msida': 'Northern Harbour',
      'Birkirkara': 'Northern Harbour',
      'Qormi': 'Southern Harbour',
      'Pavi, Qormi': 'Southern Harbour',
      'Valletta': 'Southern Harbour',
      'Paola': 'Southern Harbour',
      'Żabbar': 'Southern Harbour',
      'Marsaskala': 'South Eastern',
      'Rabat': 'Western',
      'Victoria (Gozo)': 'Gozo',
    },

    // Rough relative geography of the Maltese islands, 0–100 on each axis.
    mapByLocation: {
      'Victoria (Gozo)': [10, 10],
      'Mellieħa': [30, 17],
      'Buġibba': [36, 24],
      'Naxxar': [46, 33],
      'Mosta': [42, 35],
      'Rabat': [33, 46],
      'Birkirkara': [48, 45],
      "St Julian's": [58, 37],
      'Sliema': [61, 41],
      'The Point, Sliema': [63, 42],
      'Gżira': [57, 44],
      'Msida': [53, 46],
      'Valletta': [59, 50],
      'Qormi': [47, 51],
      'Pavi, Qormi': [45, 52],
      'Paola': [55, 57],
      'Żabbar': [63, 58],
      'Marsaskala': [69, 61],
    },

    // Marsaskala carries the storyline: a critical hygiene failure, escalation,
    // corrective action, and a verified recovery at the follow-up visit.
    storylineKey: 'br-01:Marsaskala',
  },

  people: {
    managers: [
      'Matthew Camilleri', 'Sarah Borg', 'Luke Farrugia', 'Nicole Vella', 'Andrea Zammit', 'Daniel Mifsud',
      'Elena Grech', 'Jean-Paul Attard', 'Maria Spiteri', 'Kurt Micallef', 'Rachel Cassar', 'Stefan Azzopardi',
      'Claire Bonnici', 'Gabriel Sciberras', 'Martina Pace', 'Julian Caruana', 'Rebecca Galea', 'Chris Muscat',
      'Francesca Debono', 'Adrian Scicluna', 'Katya Abela', 'Mario Tabone', 'Nadia Said', 'Owen Bugeja',
      'Lara Cutajar', 'Simon Gatt',
    ],
    shoppers: [
      { name: 'Maria Borg', gender: 'Female', nationality: 'Maltese', languages: ['Maltese', 'English'] },
      { name: 'James Whitfield', gender: 'Male', nationality: 'British', languages: ['English'] },
      { name: 'Elena Vella', gender: 'Female', nationality: 'Maltese', languages: ['Maltese', 'English', 'Italian'] },
      { name: 'Luca Rossi', gender: 'Male', nationality: 'Italian', languages: ['Italian', 'English'] },
      { name: 'Isabella Cruz', gender: 'Female', nationality: 'Filipino', languages: ['English', 'Tagalog'] },
      { name: 'Matteo Farrugia', gender: 'Male', nationality: 'Maltese', languages: ['Maltese', 'English'] },
      { name: 'Chloe Martin', gender: 'Female', nationality: 'French', languages: ['French', 'English'] },
      { name: 'Andrea Zammit', gender: 'Male', nationality: 'Maltese', languages: ['Maltese', 'English'] },
      { name: 'Sofia Grech', gender: 'Female', nationality: 'Maltese', languages: ['Maltese', 'English', 'Italian'] },
      { name: 'David Chen', gender: 'Male', nationality: 'Canadian', languages: ['English', 'Mandarin'] },
      { name: 'Nicole Micallef', gender: 'Female', nationality: 'Maltese', languages: ['Maltese', 'English'] },
      { name: 'Thomas Becker', gender: 'Male', nationality: 'German', languages: ['German', 'English'] },
      { name: 'Rachel Spiteri', gender: 'Female', nationality: 'Maltese', languages: ['Maltese', 'English'] },
      { name: 'Arjun Pillai', gender: 'Male', nationality: 'Indian', languages: ['English', 'Hindi'] },
      { name: 'Emily Johnson', gender: 'Female', nationality: 'American', languages: ['English', 'Spanish'] },
      { name: 'Kurt Azzopardi', gender: 'Male', nationality: 'Maltese', languages: ['Maltese', 'English'] },
      { name: 'Giulia Conti', gender: 'Female', nationality: 'Italian', languages: ['Italian', 'English'] },
      { name: 'Mark Caruana', gender: 'Male', nationality: 'Maltese', languages: ['Maltese', 'English'] },
      { name: 'Olivia Brown', gender: 'Female', nationality: 'Australian', languages: ['English'] },
      { name: 'Paul Sciberras', gender: 'Male', nationality: 'Maltese', languages: ['Maltese', 'English'] },
      { name: 'Martina Galea', gender: 'Female', nationality: 'Maltese', languages: ['Maltese', 'English'] },
      { name: 'Lucas Ferreira', gender: 'Male', nationality: 'Brazilian', languages: ['Portuguese', 'English'] },
      { name: 'Hannah Mifsud', gender: 'Female', nationality: 'Maltese', languages: ['Maltese', 'English'] },
      { name: 'Ben Mitchell', gender: 'Male', nationality: 'South African', languages: ['English', 'Afrikaans'] },
    ],
  },
}
