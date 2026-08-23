import { formatEur } from '@/lib/money'
import { budgetState } from '@/lib/queries'

/**
 * Progress against a budget.
 *
 * Every bar is the real thing since 0014 — there is one budget level, so there
 * is no advisory variant that has to avoid saying "over". See PROJECT.md.
 *
 * `floorCents` is the category's RECURRING commitment: money that will leave
 * this month whether or not anything else is spent. It is drawn as a marked
 * floor rather than folded into "spent", because until the rule fires it has
 * not been spent — but it is also not available.
 *
 * Without it the bar could say "100,00 € left" on a Transport budget of 100,00
 * carrying a 126,00 Deutschlandticket, which is not merely optimistic but
 * impossible: the budget was already unmeetable when it was typed.
 */
export function BudgetBar({
  label,
  spentCents,
  budgetCents,
  floorCents = 0,
}: {
  label: string
  spentCents: number
  budgetCents: number
  /** Recurring commitment for this category — the minimum that will go out. */
  floorCents?: number
}) {
  const state = budgetState(spentCents, budgetCents)
  const percent = budgetCents > 0 ? (spentCents / budgetCents) * 100 : 0
  const remaining = budgetCents - spentCents

  // A budget below its own recurring floor can never be met. Worth saying
  // outright rather than letting the bar imply headroom that does not exist.
  const impossible = floorCents > 0 && floorCents > budgetCents
  const floorPercent =
    budgetCents > 0 ? Math.min((floorCents / budgetCents) * 100, 100) : 0

  // What is left once the committed part is accounted for, not just what has
  // actually been charged so far.
  const uncommitted = budgetCents - Math.max(spentCents, floorCents)

  const fill = {
    normal: 'bg-neutral-800 dark:bg-neutral-200',
    approaching: 'bg-amber-500',
    over: 'bg-red-600',
  }[state]

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="shrink-0 tabular-nums text-xs text-neutral-500">
          {formatEur(spentCents)} / {formatEur(budgetCents)}
        </span>
      </div>

      <div
        className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          floorCents > 0
            ? `${label}, including ${formatEur(floorCents)} recurring`
            : label
        }
      >
        {/* The committed stretch, behind the spend fill. */}
        {floorCents > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-neutral-300 dark:bg-neutral-700"
            style={{ width: `${floorPercent}%` }}
          />
        )}
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${fill}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
        {/* Where the recurring floor sits. Sits on top of the fill so it stays
            visible once spending passes it. */}
        {floorCents > 0 && !impossible && (
          <div
            className="absolute inset-y-0 w-px bg-neutral-900 dark:bg-white"
            style={{ left: `${floorPercent}%` }}
          />
        )}
      </div>

      <p className="mt-1 text-xs text-neutral-500">
        {impossible ? (
          <span className="text-red-600">
            ↻ {formatEur(floorCents)} recurs every month — more than this budget.
            Minimum is {formatEur(floorCents)}.
          </span>
        ) : state === 'over' ? (
          <span className="text-red-600">over by {formatEur(-remaining)}</span>
        ) : (
          <>
            {floorCents > 0 ? (
              <>
                {formatEur(uncommitted)} left after ↻ {formatEur(floorCents)}{' '}
                recurring
              </>
            ) : (
              <>{formatEur(remaining)} left</>
            )}
            {state === 'approaching' && (
              <span className="text-amber-600"> · getting close</span>
            )}
          </>
        )}
      </p>
    </div>
  )
}
