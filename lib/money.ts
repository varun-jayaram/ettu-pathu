/**
 * Money handling. Read PROJECT.md § Money before changing any of this.
 *
 * Postgres stores amounts as numeric(12,2) and PostgREST returns them as
 * STRINGS ("0.10") so nothing is lost in transit. The moment a total is
 * accumulated with JavaScript floats that exactness is gone:
 *
 *   0.10 + 0.10 + 0.10 === 0.30000000000000004
 *
 * So every total in this app is summed in integer cents and converted back
 * only for display.
 */

/** "12.34" | 12.34 -> 1234 */
export function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100)
}

/** Sum any rows carrying an `amount`, in cents. Never returns a float. */
export function sumCents<T extends { amount: string | number }>(rows: T[]): number {
  return rows.reduce((total, row) => total + toCents(row.amount), 0)
}

/** 1234 -> "12,34 €" — German formatting, since that is where they live. */
export function formatEur(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

