import { CLIENT } from '@/config/client'
export type { BrandDef, LocationDef, ShopperDef } from '@/config/clients/types'

/**
 * Portfolio and people for the client this build targets.
 *
 * These used to be Qatar-specific literals. They now come from the selected client
 * profile, so a second demonstration is a config file rather than a fork. The export
 * names are unchanged, so the seed generator did not have to be rewritten.
 *
 * The observation and narrative pools below stay shared: they describe mystery-shopping
 * findings, which read the same whichever country the outlets are in.
 */
export const BRAND_DEFS = CLIENT.portfolio.brands
export const REGION_BY_LOCATION: Record<string, string> = CLIENT.portfolio.regionByLocation
/** Approximate 0-100 grid positions for the map-style location card. */
export const MAP_BY_LOCATION: Record<string, [number, number]> = CLIENT.portfolio.mapByLocation
export const MANAGER_NAMES = CLIENT.people.managers
export const SHOPPER_NAMES = CLIENT.people.shoppers

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
