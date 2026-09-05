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
 *
 * `budgetSet = false` is a category nobody has budgeted this month. Plan draws
 * one of these for EVERY category rather than hiding the unbudgeted ones, and
 * reads the missing number as the only plan that does exist:
 *
 *   - a recurring floor, if the category has rules — that money IS planned,
 *     it just wasn't planned with a budget, so the floor is the implied one
 *   - otherwise zero, so anything spent there is beyond the plan
 *
 * Exceeding an implied budget goes AMBER, not red. Red is for missing a target
 * you actually set; there is no promise to break here, and a page of red bars
 * for every category the household has never budgeted just teaches you to
 * ignore the colour.
 */
export function BudgetBar({
  label,
  spentCents,
  budgetCents,
  floorCents = 0,
  budgetSet = true,
}: {
  label: string
  spentCents: number
  budgetCents: number
  /** Recurring commitment for this category — the minimum that will go out. */
  floorCents?: number
  /** False when no budget exists for this month; the bar is drawn against
   *  whatever plan does exist — the recurring floor, or 0,00 €. */
  budgetSet?: boolean
}) {
  // With no budget, the recurring floor stands in as the implied one. It is
  // zero for a category with no rules either, which is the "not in plan" case.
  const impliedCents = budgetSet ? budgetCents : floorCents
  const beyondPlan = !budgetSet && spentCents > impliedCents

  const state = budgetSet ? budgetState(spentCents, budgetCents) : 'normal'
  const percent =
    impliedCents > 0
      ? (spentCents / impliedCents) * 100
      : spentCents > 0
        ? 100
        : 0
  const remaining = budgetCents - spentCents

  // A budget below its own recurring floor can never be met. Worth saying
  // outright rather than letting the bar imply headroom that does not exist.
  // Only for a budget somebody typed — an unset one says its own version.
  const impossible = budgetSet && floorCents > 0 && floorCents > budgetCents
  const floorPercent =
    budgetCents > 0 ? Math.min((floorCents / budgetCents) * 100, 100) : 0
  // The floor marker locates the committed part WITHIN a budget. With no
  // budget the floor is the whole bar, so there is nothing to locate.
  const showFloor = budgetSet && floorCents > 0

  const fill = beyondPlan
    ? 'bg-amber-500'
    : {
        normal: 'bg-neutral-800 dark:bg-neutral-200',
        approaching: 'bg-amber-500',
        over: 'bg-red-600',
      }[state]

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="shrink-0 tabular-nums text-xs text-neutral-500">
          {formatEur(spentCents)} / {formatEur(impliedCents)}
          {!budgetSet && <span className="ml-1">assumed</span>}
        </span>
      </div>

      <div
        className={`relative mt-1.5 h-2 w-full overflow-hidden rounded-full ${
          // Dashed-looking hollow track for an assumed budget, so a bar you set
          // and a bar the page inferred are told apart without reading them.
          budgetSet
            ? 'bg-neutral-200 dark:bg-neutral-800'
            : 'border border-dashed border-neutral-300 dark:border-neutral-700'
        }`}
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          !budgetSet
            ? floorCents > 0
              ? `${label}, no budget set — measured against ${formatEur(floorCents)} recurring`
              : `${label}, not in the plan — counted as zero`
            : floorCents > 0
              ? `${label}, including ${formatEur(floorCents)} recurring`
              : label
        }
      >
        {/* The committed stretch, behind the spend fill. */}
        {showFloor && (
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
        {showFloor && !impossible && (
          <div
            className="absolute inset-y-0 w-px bg-neutral-900 dark:bg-white"
            style={{ left: `${floorPercent}%` }}
          />
        )}
      </div>

      <p className="mt-1 text-xs text-neutral-500">
        {!budgetSet ? (
          floorCents > 0 ? (
            <>
              No budget — ↻ {formatEur(floorCents)} recurring is the whole plan
              here
              {beyondPlan && (
                <span className="text-amber-600">
                  {' '}
                  · {formatEur(spentCents - floorCents)} beyond it
                </span>
              )}
            </>
          ) : (
            <>
              Not in the plan — counted as {formatEur(0)}
              {spentCents > 0 && (
                <span className="text-amber-600">
                  , so all {formatEur(spentCents)} is unplanned
                </span>
              )}
            </>
          )
        ) : impossible ? (
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
                {formatEur(uncommittedCents(budgetCents, spentCents, floorCents))}{' '}
                left after ↻ {formatEur(floorCents)} recurring
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

/** What is left once the committed part is accounted for, not just what has
 *  actually been charged so far. */
function uncommittedCents(
  budgetCents: number,
  spentCents: number,
  floorCents: number,
) {
  return budgetCents - Math.max(spentCents, floorCents)
}
