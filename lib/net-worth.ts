/**
 * Net worth arithmetic.
 *
 * STANDALONE ON PURPOSE — no imports, exactly like lib/period.ts. That is what
 * lets tests/net-worth.test.mjs import this file directly under plain `node`,
 * and it is why every function here takes integer CENTS rather than the
 * numeric(12,2) strings PostgREST returns. Conversion happens at the boundary
 * with toCents() from lib/money.ts; nothing in here ever touches a float euro.
 * See PROJECT.md § "Money: the database is exact, JavaScript is not".
 *
 * ---------------------------------------------------------------------------
 * THE BALANCE IS TYPED, NOT DERIVED
 * ---------------------------------------------------------------------------
 * `current_amount` — still owed on a loan, worth now on an investment — is set
 * by the user and is the only number net worth is computed from. This file does
 * not work it out; it adds it up.
 *
 * Two earlier designs derived it (from a category, then from tagged payments)
 * and both failed the same way: the figure was only true if you had fed the
 * machine, so the page spent its time reporting on its own inputs. An
 * investment settles the argument on its own — its value moves with the market,
 * and no sum of contributions can express that.
 *
 * Tagging a payment does not change a balance either — it makes the payment
 * PENDING. The tab adds pending up, offers an Apply button, and only then does
 * the balance move, by the user's own press. `balance_applied_at` on the expense
 * is what stops the same payment being counted twice; see 0021.
 */

export type NetWorthKind = 'loan' | 'investment'

/** One expense, reduced to what net worth cares about. */
export type Payment = {
  cents: number
  /** The loan or investment it was tagged with. Null moves nothing, ever. */
  net_worth_item_id: string | null
  /** Already folded into that entry's balance, so no longer pending. */
  applied: boolean
}

/**
 * Cents tagged to one entry and not yet folded into its balance.
 *
 * Deliberately unbounded by date. A payment tagged in September and never
 * applied is still waiting in October — scoping this to a cycle would make
 * money disappear when the month turned over.
 */
export function pendingCents(itemId: string, payments: Payment[]): number {
  // An untagged payment carries a null id. Without this guard a missing id
  // would match every one of them and invent a balance out of ordinary
  // spending.
  if (!itemId) return 0

  let total = 0
  for (const payment of payments) {
    if (payment.applied) continue
    if (payment.net_worth_item_id !== itemId) continue
    total += payment.cents
  }
  return total
}

/**
 * What the balance becomes once pending is applied: a loan falls, an investment
 * rises.
 *
 * Not clamped at zero. Applying more than was owed leaves a negative balance,
 * which the page reports — swallowing it would hide a wrong tag or a wrong
 * figure behind a tidy number.
 */
export function appliedBalanceCents(
  kind: NetWorthKind,
  currentCents: number,
  pending: number,
): number {
  return kind === 'loan' ? currentCents - pending : currentCents + pending
}

/**
 * One entry's contribution to net worth: a loan is a liability, so it counts
 * against; an investment counts for.
 */
export function netCents(kind: NetWorthKind, currentCents: number): number {
  return kind === 'loan' ? -currentCents : currentCents
}

/**
 * How much of a loan is behind you — what the progress bar fills with.
 *
 * Needs a principal to mean anything; without one there is no progress to show,
 * only a balance, which is why this returns null rather than a misleading zero.
 */
export function paidOffCents(
  totalCents: number | null,
  currentCents: number,
): number | null {
  if (!totalCents || totalCents <= 0) return null
  return Math.max(totalCents - currentCents, 0)
}

/** 0–100, for the progress meter. Null when there is nothing to measure against. */
export function progressPercent(
  valueCents: number,
  totalCents: number | null,
): number | null {
  if (!totalCents || totalCents <= 0) return null
  return Math.min(Math.max((valueCents / totalCents) * 100, 0), 100)
}
