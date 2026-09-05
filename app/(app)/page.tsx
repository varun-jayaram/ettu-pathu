import Link from 'next/link'
import {
  getActivePeriod,
  getBudgets,
  getCategories,
  getExpenses,
  getHouseholdTotals,
  getIncome,
  getRecurringRules,
  getWallets,
  materializeRecurring,
} from '@/lib/queries'
import { formatEur, sumCents, toCents } from '@/lib/money'
import { BudgetBar } from '@/components/budget-bar'
import { budgetState } from '@/lib/queries'

/**
 * This cycle at a glance.
 *
 * Spending is split into RECURRING and EVERYTHING ELSE — derived from whether
 * a recurring rule created the row, not from a label on the category's group.
 * That is the whole point of the model: a cost is fixed because it recurs.
 *
 * Every euro that leaves counts as spending, savings included.
 */
export default async function HomePage() {
  // Fill in anything due before reading totals, so the numbers are correct at
  // the moment you look at them. Idempotent.
  await materializeRecurring()

  // The header's month, or the live cycle when none is picked. Every tab reads
  // the same thing, so Home and Plan can never disagree about which month you
  // are looking at.
  const period = await getActivePeriod()
  const { from, to } = period

  const [wallets, expenses, budgets, categories, income, totals, rules] =
    await Promise.all([
      getWallets(),
      getExpenses({ from, to, limit: 500 }),
      getBudgets(period.month),
      getCategories(),
      getIncome({ from, to }),
      getHouseholdTotals(from, to, period.month),
      // Only so each bar can show its recurring floor. Home draws the same
      // BudgetBar as Plan and would otherwise claim headroom that is already
      // committed.
      getRecurringRules(),
    ])

  /**
   * Totals are HOUSEHOLD-wide and come from the aggregate-only Postgres
   * function, not from `expenses` — RLS hides the other person's personal rows,
   * so summing what this user can read would silently understate the household
   * and make the two phones disagree. Detail below still comes from `expenses`,
   * which is correct: you may see the total, not the transactions.
   *
   * Savings still counts in Out and in Left — putting money aside is not the
   * same as still having it — but gets its own box.
   */
  const spentCents = totals.reduce((t, w) => t + toCents(w.spent), 0)
  const savingsCents = totals.reduce((t, w) => t + toCents(w.saved), 0)
  const expensesCents = spentCents - savingsCents

  const incomeCents = sumCents(income)
  const leftCents = incomeCents - spentCents

  /**
   * What this month is expected to cost — the two committed things added up.
   *
   * Recurring and budgets OVERLAP, and adding them naively double-counts. A
   * budget already contains its category's recurring floor: the Transport
   * budget covers the Deutschlandticket, it is not on top of it. So the
   * recurring that sits inside a budgeted category is subtracted back out.
   *
   * Budget totals come from the aggregate function rather than `budgets`, so a
   * personal wallet's budget counts even though its rows are invisible here —
   * the same reason spend does. Recurring comes from the rules this user can
   * read, which is every rule in practice: only the joint wallet has them.
   */
  const recurringCents = sumCents(rules.filter((r) => r.active))
  const budgetedCents = totals.reduce((t, w) => t + toCents(w.budgeted), 0)
  const overlapCents = sumCents(
    rules.filter(
      (r) =>
        r.active &&
        budgets.some(
          (b) => b.wallet_id === r.wallet_id && b.category_id === r.categories.id,
        ),
    ),
  )
  const expectedCents = recurringCents + budgetedCents - overlapCents

  /**
   * NOT IN PLAN — spending in a category with neither a budget nor an active
   * recurring rule. Those are the two ways money is committed (PROJECT.md), so
   * a category with neither was never accounted for at all, and its budget
   * reads as 0,00 €: every euro in it is unplanned.
   *
   * A recurring category is NOT unplanned, however unbudgeted — rent goes out
   * every month by design. Counting it here would have made the biggest line
   * in the household the biggest surprise, and the number useless.
   *
   * JOINT wallets only. A personal wallet takes one wallet-scope budget by
   * design, so every one of its categories has no category budget and all of
   * them would land here. And per-category detail comes from `expenses`, which
   * RLS already limits to rows this user may read — the other person's
   * personal spending is not in it and must not be.
   */
  const unplanned = wallets
    .filter((w) => w.kind === 'joint')
    .flatMap((wallet) =>
      categories
        .filter(
          (category) =>
            !budgets.some(
              (b) => b.wallet_id === wallet.id && b.category_id === category.id,
            ) &&
            !rules.some(
              (r) =>
                r.active &&
                r.wallet_id === wallet.id &&
                r.categories.id === category.id,
            ),
        )
        .map((category) => ({
          key: `${wallet.id}:${category.id}`,
          category,
          wallet,
          cents: sumCents(
            expenses.filter(
              (e) => e.wallets.id === wallet.id && e.categories.id === category.id,
            ),
          ),
        })),
    )
    // Nothing spent is not a gap — an unbudgeted category you never touched is
    // simply one you did not need. Plan lists those; Home is about this cycle.
    .filter((row) => row.cents > 0)
    .sort((a, b) => b.cents - a.cents)

  const unplannedCents = unplanned.reduce((total, row) => total + row.cents, 0)

  const shortDate = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">{period.label}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {shortDate(from)} – {shortDate(to)}
        {/* "2 days left" is meaningless for a cycle that has not started or is
            already over, so it is only shown for the live one. */}
        {period.isLive && ` · ${period.daysLeft} days left`}
        {period.snapped && ' · from your actual payday'}
      </p>
      {!period.isLive && (
        <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-500">
          Not the live cycle — you&apos;re viewing {period.label}. Use{' '}
          <span className="font-medium">Today</span> in the header to go back.
        </p>
      )}

      {/* Income eight, expenses ten — the point of the app, so it leads. */}
      {incomeCents > 0 && (
        <div className="mt-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-neutral-500">In</span>
            <span className="tabular-nums text-sm">{formatEur(incomeCents)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-sm text-neutral-500">Out</span>
            <span className="tabular-nums text-sm">−{formatEur(spentCents)}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-neutral-200 pt-2 dark:border-neutral-800">
            <span className="text-sm font-medium">Left</span>
            <span
              className={`tabular-nums text-lg font-semibold ${
                leftCents < 0 ? 'text-red-600' : ''
              }`}
            >
              {formatEur(leftCents)}
            </span>
          </div>
          {leftCents < 0 && (
            <p className="mt-2 text-xs text-red-600">
              செலவு பத்தணா — spending more than came in this cycle.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href="/reports"
          className="rounded-xl border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
        >
          <p className="text-xs text-neutral-500">Expenses</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatEur(expensesCents)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">money spent →</p>
        </Link>
        <Link
          href="/reports"
          className="rounded-xl border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
        >
          <p className="text-xs text-neutral-500">Savings</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatEur(savingsCents)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">money kept →</p>
        </Link>
      </div>

      {/* What the month is expected to cost, as opposed to what it has cost so
          far. Its own box because it answers a different question: not "how am
          I doing" but "what am I committed to". Links to Plan, which is where
          both halves of it are set. */}
      {expectedCents > 0 && (
        <Link
          href="/budgets"
          className="mt-3 block rounded-xl border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
        >
          <p className="text-xs text-neutral-500">Expected expense</p>

          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm text-neutral-500">↻ Recurring</span>
            <span className="tabular-nums text-sm">{formatEur(recurringCents)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-sm text-neutral-500">Budgets</span>
            <span className="tabular-nums text-sm">{formatEur(budgetedCents)}</span>
          </div>
          {/* Shown rather than silently netted off: otherwise the two lines
              above would visibly fail to add up to the total. */}
          {overlapCents > 0 && (
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-sm text-neutral-500">
                Recurring already inside a budget
              </span>
              <span className="tabular-nums text-sm text-neutral-500">
                −{formatEur(overlapCents)}
              </span>
            </div>
          )}

          <div className="mt-2 flex items-baseline justify-between border-t border-neutral-200 pt-2 dark:border-neutral-800">
            <span className="text-sm font-medium">Expected this month</span>
            <span className="tabular-nums text-lg font-semibold">
              {formatEur(expectedCents)}
            </span>
          </div>

          <p className="mt-1 text-xs text-neutral-500">
            {incomeCents > 0 && (
              <>
                {expectedCents > incomeCents
                  ? `${formatEur(expectedCents - incomeCents)} more than came in · `
                  : `${formatEur(incomeCents - expectedCents)} spare against income · `}
              </>
            )}
            set it on Plan →
          </p>
        </Link>
      )}

      {/* The counterpart to Expected: what happened OUTSIDE the plan. Expected
          only ever adds up what was decided, so without this the categories
          nobody thought about are the ones the dashboard never mentions. Amber,
          not red — no target was missed here, because none was set. */}
      {unplannedCents > 0 && (
        <Link
          href="/budgets"
          className="mt-3 block rounded-xl border border-amber-500/40 p-4 hover:border-amber-500"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium text-amber-600">Not in plan</p>
            <span className="tabular-nums text-lg font-semibold text-amber-600">
              {formatEur(unplannedCents)}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Spent in {unplanned.length}{' '}
            {unplanned.length === 1 ? 'category' : 'categories'} with no budget
            and nothing recurring — counted as {formatEur(0)}, so none of it was
            accounted for.
          </p>

          <ul className="mt-2 space-y-1">
            {unplanned.slice(0, 5).map((row) => (
              <li
                key={row.key}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0 truncate text-sm">
                  {row.category.icon} {row.category.name}
                </span>
                <span className="shrink-0 tabular-nums text-sm">
                  {formatEur(row.cents)}
                </span>
              </li>
            ))}
          </ul>
          {unplanned.length > 5 && (
            <p className="mt-1 text-xs text-neutral-500">
              and {unplanned.length - 5} more
            </p>
          )}

          <p className="mt-2 text-xs text-neutral-500">
            Budget one on Plan, or leave it — this is a number to know, not
            necessarily one to fix →
          </p>
        </Link>
      )}

      {/* Sorted by how they are doing, so "where am I over?" is answered
          without reading every bar. One level only — a category budget is the
          budget, and there is nothing advisory left to explain. */}
      {(() => {
        const bars = budgets
          .filter((b) => b.scope === 'category')
          .map((budget) => {
            const category = categories.find((c) => c.id === budget.category_id)
            const wallet = wallets.find((w) => w.id === budget.wallet_id)
            if (!category || !wallet) return null
            const spentCents = sumCents(
              expenses.filter(
                (e) => e.wallets.id === wallet.id && e.categories.id === category.id,
              ),
            )
            const budgetCents = toCents(budget.amount)
            const floorCents = sumCents(
              rules.filter(
                (r) =>
                  r.active &&
                  r.wallet_id === wallet.id &&
                  r.categories.id === category.id,
              ),
            )
            return {
              key: budget.id,
              label: `${category.icon ?? ''} ${category.name} · ${wallet.name}`.trim(),
              spentCents,
              budgetCents,
              floorCents,
              state: budgetState(spentCents, budgetCents),
            }
          })
          .filter((bar) => bar !== null)

        if (bars.length === 0) {
          return (
            <p className="mt-8 rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
              No budgets set yet.{' '}
              <Link href="/budgets" className="underline">
                Set one
              </Link>{' '}
              — a budget is for what you might overspend: groceries, petrol,
              eating out. Fixed costs belong in Recurring instead.
            </p>
          )
        }

        const sections = [
          { state: 'over' as const, title: 'Over budget', tone: 'text-red-600' },
          { state: 'approaching' as const, title: 'Getting close', tone: 'text-amber-600' },
          { state: 'normal' as const, title: 'Within budget', tone: 'text-neutral-500' },
        ]

        return (
          <>
            <h2 className="mt-8 text-sm font-medium">Budgets</h2>
            <div className="mt-3 space-y-6">
              {sections.map((section) => {
                const rows = bars.filter((bar) => bar.state === section.state)
                if (rows.length === 0) return null
                return (
                  <div key={section.state}>
                    <p className={`text-xs font-medium ${section.tone}`}>
                      {section.title} · {rows.length}
                    </p>
                    <div className="mt-2 space-y-4">
                      {rows.map((bar) => (
                        <BudgetBar
                          key={bar.key}
                          label={bar.label}
                          spentCents={bar.spentCents}
                          budgetCents={bar.budgetCents}
                          floorCents={bar.floorCents}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <Link
              href="/budgets"
              className="mt-3 inline-block text-sm text-neutral-500 hover:underline"
            >
              Manage budgets →
            </Link>
          </>
        )
      })()}

      <h2 className="mt-8 text-sm font-medium">By wallet</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Everyone&apos;s totals. What the other person spent it on stays private.
      </p>
      <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
        {totals.map((wallet) => {
          const mine = wallets.some((w) => w.id === wallet.wallet_id)
          const spent = toCents(wallet.spent)
          const budgeted = toCents(wallet.budgeted)
          return (
            <li key={wallet.wallet_id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  {wallet.wallet_name}
                  <span className="ml-2 text-xs text-neutral-500">
                    {wallet.wallet_kind === 'personal' ? 'private' : 'shared'}
                    {!mine && ' · total only'}
                  </span>
                </span>
                <span className="tabular-nums text-sm font-medium">
                  {formatEur(spent)}
                </span>
              </div>
              {/* PERSONAL wallets only. There, one number genuinely is the
                  whole budget, so spend-vs-budget compares like with like.

                  The joint wallet carries per-category budgets, so this bar
                  measured EVERY joint euro — rent, insurance, car service —
                  against the handful of categories that happen to have one:
                  5.580,45 € / 600,00 €, "over by 4.980,45 €". Permanently red
                  and meaningless. The per-category bars above already answer
                  "where am I over?" honestly. */}
              {wallet.wallet_kind === 'personal' && budgeted > 0 && (
                <div className="mt-2">
                  <BudgetBar
                    label={`${wallet.wallet_name} budget`}
                    spentCents={spent}
                    budgetCents={budgeted}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <h2 className="mt-8 text-sm font-medium">Recent</h2>
      {expenses.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Nothing logged this cycle yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
          {expenses.slice(0, 5).map((expense) => (
            <li key={expense.id} className="flex items-center gap-3 py-3">
              <span aria-hidden>{expense.categories.icon ?? '•'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {expense.categories.name}
                  {expense.recurring_rule_id && (
                    <span title="Recurring" className="ml-1.5 text-xs text-neutral-500">
                      ↻
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {expense.wallets.name}
                  {expense.note ? ` · ${expense.note}` : ''}
                </p>
              </div>
              <span className="tabular-nums text-sm">
                {formatEur(toCents(expense.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/expenses"
        className="mt-4 inline-block text-sm text-neutral-500 hover:underline"
      >
        See all expenses →
      </Link>
    </>
  )
}
