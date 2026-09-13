import type { Role } from '@/types'

/**
 * Demo-mode credentials. These exist ONLY for the seeded demonstration dataset and are
 * never used in live mode, where Supabase Auth owns credentials.
 */
export interface DemoAccount {
  email: string
  password: string
  role: Role
  userId: string
  label: string
  description: string
}

export const DEMO_PASSWORD = 'Demo@123'

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'admin@insight360.demo',
    password: DEMO_PASSWORD,
    role: 'super_admin',
    userId: 'usr-001',
    label: 'Super Admin',
    description: 'Full platform administration',
  },
  {
    email: 'clientadmin@insight360.demo',
    password: DEMO_PASSWORD,
    role: 'client_admin',
    userId: 'usr-002',
    label: 'Client Admin',
    description: 'Portfolio-wide client visibility',
  },
  {
    email: 'manager@insight360.demo',
    password: DEMO_PASSWORD,
    role: 'ops_manager',
    userId: 'usr-003',
    label: 'Operations Manager',
    description: 'Assigned outlets only',
  },
  {
    email: 'shopper@insight360.demo',
    password: DEMO_PASSWORD,
    role: 'shopper',
    userId: 'usr-004',
    label: 'Mystery Shopper',
    description: 'Assigned visits & questionnaire',
  },
  {
    email: 'analyst@insight360.demo',
    password: DEMO_PASSWORD,
    role: 'analyst',
    userId: 'usr-005',
    label: 'Analyst',
    description: 'Analytics, benchmarking, exports',
  },
  {
    email: 'executive@insight360.demo',
    password: DEMO_PASSWORD,
    role: 'executive',
    userId: 'usr-006',
    label: 'Executive',
    description: 'Read-only executive view',
  },
]
