import { formatEur } from '@/lib/money'
import { budgetState } from '@/lib/queries'

/**
 * Progress against a budget.
 *
 * `advisory` renders a category sub-limit, which only ever WARNS — it never
 * says "over", because the group budget alone defines that. See
 * PROJECT.md § Budgets.
 */
export function BudgetBar({
  label,
  spentCents,
  budgetCents,
  advisory = false,
}: {
  label: string
  spentCents: number
  budgetCents: number
  advisory?: boolean
}) {
  const state = budgetState(spentCents, budgetCents)
  const percent = budgetCents > 0 ? (spentCents / budgetCents) * 100 : 0
  const remaining = budgetCents - spentCents

  const fill = {
    normal: 'bg-neutral-800 dark:bg-neutral-200',
    approaching: 'bg-amber-500',
    over: 'bg-red-600',
  }[state]

  return (
    <div className={advisory ? 'pl-4' : ''}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`truncate ${advisory ? 'text-xs text-neutral-500' : 'text-sm font-medium'}`}>
          {advisory && '↳ '}
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-xs text-neutral-500">
          {formatEur(spentCents)} / {formatEur(budgetCents)}
        </span>
      </div>

      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full ${fill}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      <p className="mt-1 text-xs text-neutral-500">
        {state === 'over' ? (
          <span className={advisory ? 'text-amber-600' : 'text-red-600'}>
            {advisory
              ? `over its sub-limit by ${formatEur(-remaining)}`
              : `over by ${formatEur(-remaining)}`}
          </span>
        ) : (
          <>
            {formatEur(remaining)} left
            {state === 'approaching' && (
              <span className="text-amber-600"> · getting close</span>
            )}
          </>
        )}
      </p>
    </div>
  )
}
