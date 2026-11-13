import { useEffect, useState } from 'react'
import { getRepository } from '@/repositories'
import type { Evidence } from '@/types'

/**
 * The address of the photograph (or video) behind an evidence record, or null
 * while it loads and when there is no file — seeded sample evidence, which keeps
 * its drawn placeholder.
 */
export function useEvidenceUrl(evidence: Pick<Evidence, 'id' | 'fileName'> | null | undefined): string | null {
  const id = evidence?.id
  const fileName = evidence?.fileName
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    if (!id) return
    getRepository()
      .evidenceUrl({ id, fileName: fileName ?? '' })
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch(() => {
        /* no file to show — the placeholder stays */
      })
    return () => {
      alive = false
    }
  }, [id, fileName])
  return url
}
