import { useContext } from 'react'
import { DataContext } from '@/contexts/DataContext'

/**
 * The organisation logo uploaded in Settings, or null to use the built-in one.
 * Safe before sign-in (no dataset yet) and outside the data provider.
 */
export function useOrganizationLogo(): string | null {
  const ctx = useContext(DataContext)
  return ctx?.data?.organization.logo || null
}
