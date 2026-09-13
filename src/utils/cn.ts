/** Minimal className joiner (no external dependency). */
export function cn(...classes: Array<string | false | null | undefined | 0>): string {
  return classes.filter(Boolean).join(' ')
}
