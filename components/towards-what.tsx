import type { NetWorthItem } from '@/lib/queries'

/**
 * "Towards what" — which loan or investment a payment moves.
 *
 * The one field that makes a balance move, so it appears everywhere a payment
 * is created or corrected: Add, the Log's edit dialog, and a recurring rule
 * (where it is set once and stamped onto every row the rule generates). Four
 * copies of a <select> would drift; this is the one.
 *
 * No 'use client' — it is markup with no behaviour, so it renders inside the
 * server-rendered edit dialogs and the client forms alike.
 *
 * ALWAYS OPTIONAL, and blank by default. Most spending moves no balance, and a
 * required field here would make people pick something wrong to get past it.
 * Untagged is a real answer and is never reported as a problem.
 *
 * Tagging does not move a balance by itself: it makes the payment PENDING, and
 * Net worth offers an Apply button. See 0021.
 */
export function TowardsWhat({
  items,
  defaultValue,
  id,
  className,
}: {
  /** Active entries only — an archived loan is not something to pay into. */
  items: NetWorthItem[]
  defaultValue?: string | null
  id?: string
  className?: string
}) {
  if (items.length === 0) return null

  const loans = items.filter((item) => item.kind === 'loan')
  const investments = items.filter((item) => item.kind === 'investment')

  return (
    <select
      id={id}
      name="net_worth_item_id"
      defaultValue={defaultValue ?? ''}
      className={className}
    >
      <option value="">Nothing — not a loan or investment payment</option>
      {loans.length > 0 && (
        <optgroup label="Loans">
          {loans.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </optgroup>
      )}
      {investments.length > 0 && (
        <optgroup label="Investments">
          {investments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

/** The label everywhere it appears, so the wording cannot drift either. */
export const TOWARDS_WHAT_LABEL = 'Towards what'
