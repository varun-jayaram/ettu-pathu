import Link from 'next/link'
import {
  getBudgets,
  getCategoryGroups,
  getCurrentPeriod,
  getExpenses,
  getHouseholdTotals,
  getIncome,
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

  const period = await getCurrentPeriod()
  const { from, to } = period

  const [wallets, expenses, budgets, groups, income, totals] = await Promise.all([
    getWallets(),
    getExpenses({ from, to, limit: 500 }),
    getBudgets(),
    getCategoryGroups(),
    getIncome({ from, to }),
    getHouseholdTotals(from, to),
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
        {shortDate(from)} – {shortDate(to)} · {period.daysLeft} days left
        {period.snapped && ' · from your actual payday'}
      </p>

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
          href="/reports?view=expenses"
          className="rounded-xl border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
        >
          <p className="text-xs text-neutral-500">Expenses</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatEur(expensesCents)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">money spent →</p>
        </Link>
        <Link
          href="/reports?view=savings"
          className="rounded-xl border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
        >
          <p className="text-xs text-neutral-500">Savings</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatEur(savingsCents)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">money kept →</p>
        </Link>
      </div>

      {/* Grouped by how they are doing, so "where am I over?" is answered
          without reading every bar. Category sub-limits stay on Plan — they
          warn rather than define "over". */}
      {(() => {
        const bars = budgets
          .filter((b) => b.scope === 'group')
          .map((budget) => {
            const group = groups.find((g) => g.id === budget.group_id)
            const wallet = wallets.find((w) => w.id === budget.wallet_id)
            if (!group || !wallet) return null
            const spentCents = sumCents(
              expenses.filter(
                (e) =>
                  e.wallets.id === wallet.id &&
                  e.categories.category_groups.id === group.id,
              ),
            )
            const budgetCents = toCents(budget.amount)
            return {
              key: budget.id,
              label: `${group.name} · ${wallet.name}`,
              spentCents,
              budgetCents,
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
              {budgeted > 0 && (
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
