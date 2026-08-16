import { setBudget, toggleRecurringRule } from '../actions'
import {
  getBudgets,
  getCategoryGroups,
  getCurrentPeriod,
  getExpenses,
  getRecurringRules,
  getWallets,
} from '@/lib/queries'
import { formatEur, sumCents } from '@/lib/money'
import { BudgetBar } from '@/components/budget-bar'
import { RecurringForm } from '@/components/recurring-form'

/**
 * Budgets: per wallet, at group level, one pay cycle, no rollover.
 *
 * The period is the pay cycle (anchor day, snapped to real paydays), not the
 * calendar month — the household is paid around the 26th, so a calendar budget
 * reset five days after payday. See lib/period.ts.
 *
 * Only `variable` groups appear. Committed is contractual — a budget on rent is
 * theatre — and `transfer` is excluded from spend entirely, so neither can be
 * budgeted. See PROJECT.md § Budgets.
 */
export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string }>
}) {
  const params = await searchParams
  const period = await getCurrentPeriod()
  const { from, to } = period

  const [wallets, groups, budgets, expenses, rules] = await Promise.all([
    getWallets(),
    getCategoryGroups(),
    getBudgets(),
    getExpenses({ from, to, limit: 1000 }),
    getRecurringRules(),
  ])

  const selected = wallets.find((w) => w.id === params.wallet) ?? wallets[0]
  const variableGroups = groups.filter((g) => g.kind === 'variable')

  const walletExpenses = expenses.filter((e) => e.wallets.id === selected?.id)
  const walletRules = rules.filter((r) => r.wallet_id === selected?.id)

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Budgets</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {period.label} cycle · {period.daysLeft} days left, nothing carries over
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {wallets.map((wallet) => (
          <a
            key={wallet.id}
            href={`/budgets?wallet=${wallet.id}`}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              wallet.id === selected?.id
                ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {wallet.name}
          </a>
        ))}
      </div>

      {/* Answer "where is rent?" here, where the question is actually asked —
          it used to be a footnote at the bottom that nobody reads. */}
      {(() => {
        const committedGroups = groups.filter((g) => g.kind === 'committed')
        const committedActual = sumCents(
          walletExpenses.filter((e) =>
            committedGroups.some((g) => g.id === e.categories.category_groups.id),
          ),
        )
        const committedExpected = sumCents(
          rules.filter(
            (r) =>
              r.active &&
              r.wallet_id === selected?.id &&
              r.categories.category_groups.kind === 'committed',
          ),
        )

        return (
          <section className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium">Committed — not budgeted</h2>
              <span className="tabular-nums text-sm font-semibold">
                {formatEur(committedActual)}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Rent, insurance, Rundfunkbeitrag, subscriptions. These are
              contractual — you can&apos;t choose to spend less, so a budget bar
              would be theatre. They&apos;re your monthly <em>floor</em> instead.
            </p>
            {committedExpected > 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                Expected from recurring rules:{' '}
                <span className="tabular-nums font-medium">
                  {formatEur(committedExpected)}
                </span>
                {committedActual !== committedExpected && (
                  <>
                    {' · '}
                    <span
                      className={
                        committedActual > committedExpected ? 'text-amber-600' : ''
                      }
                    >
                      {committedActual > committedExpected ? 'over' : 'under'} by{' '}
                      {formatEur(Math.abs(committedActual - committedExpected))}
                    </span>
                  </>
                )}
              </p>
            )}

            {/* Recurring rules live here rather than on their own tab: they ARE
                the committed floor, so planning them anywhere else split one
                job across two screens. */}
            <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Recurring — fills itself in each month
              </h3>

              {walletRules.length === 0 ? (
                <p className="mt-2 text-xs text-neutral-500">
                  Nothing recurring in this wallet yet. Add rent, Strom, internet,
                  insurance, Rundfunkbeitrag, subscriptions or your donation below
                  and the floor stops needing to be retyped.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
                  {walletRules.map((rule) => (
                    <li key={rule.id} className="flex items-center gap-3 py-2.5">
                      <span aria-hidden>{rule.categories.icon ?? '↻'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{rule.categories.name}</p>
                        <p className="truncate text-xs text-neutral-500">
                          day {rule.day_of_month}
                          {rule.active ? '' : ' · stopped'}
                          {rule.note ? ` · ${rule.note}` : ''}
                        </p>
                      </div>
                      <span className="tabular-nums text-sm font-medium">
                        {formatEur(Math.round(Number(rule.amount) * 100))}
                      </span>
                      <form action={toggleRecurringRule}>
                        <input type="hidden" name="id" value={rule.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(rule.active)}
                        />
                        <button
                          type="submit"
                          className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700"
                        >
                          {rule.active ? 'Stop' : 'Resume'}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-neutral-500">
                  Add a recurring expense
                </summary>
                <div className="mt-3">
                  <RecurringForm wallets={wallets} groups={groups} />
                </div>
              </details>
            </div>
          </section>
        )
      })()}

      <h2 className="mt-8 text-sm font-medium">Budgeted — variable spending</h2>
      <p className="mt-1 text-xs text-neutral-500">
        The spend you can actually move. Savings and investments are transfers, so
        they never consume a budget.
      </p>

      <div className="mt-4 space-y-8">
        {variableGroups.map((group) => {
          const groupSpend = sumCents(
            walletExpenses.filter((e) => e.categories.category_groups.id === group.id),
          )
          const groupBudget = budgets.find(
            (b) => b.wallet_id === selected?.id && b.group_id === group.id,
          )
          const groupBudgetCents = groupBudget ? Math.round(Number(groupBudget.amount) * 100) : 0

          return (
            <section key={group.id}>
              {groupBudgetCents > 0 ? (
                <BudgetBar
                  label={group.name}
                  spentCents={groupSpend}
                  budgetCents={groupBudgetCents}
                />
              ) : (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{group.name}</span>
                  <span className="tabular-nums text-xs text-neutral-500">
                    {formatEur(groupSpend)} spent · no budget
                  </span>
                </div>
              )}

              <form action={setBudget} className="mt-2 flex gap-2">
                <input type="hidden" name="wallet_id" value={selected?.id ?? ''} />
                <input type="hidden" name="group_id" value={group.id} />
                <input
                  name="amount"
                  inputMode="decimal"
                  type="text"
                  placeholder="Set a monthly budget…"
                  defaultValue={groupBudget ? Number(groupBudget.amount).toFixed(2) : ''}
                  className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
                >
                  Save
                </button>
              </form>

              {/* Category sub-limits: tripwires inside the group, never a
                  second definition of "over". */}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-neutral-500">
                  Category sub-limits (warn only)
                </summary>
                <div className="mt-3 space-y-3">
                  {group.categories.map((category) => {
                    const catSpend = sumCents(
                      walletExpenses.filter((e) => e.categories.id === category.id),
                    )
                    const catBudget = budgets.find(
                      (b) => b.wallet_id === selected?.id && b.category_id === category.id,
                    )
                    const catCents = catBudget ? Math.round(Number(catBudget.amount) * 100) : 0

                    return (
                      <div key={category.id}>
                        {catCents > 0 && (
                          <BudgetBar
                            label={category.name}
                            spentCents={catSpend}
                            budgetCents={catCents}
                            advisory
                          />
                        )}
                        <form action={setBudget} className="mt-1 flex gap-2 pl-4">
                          <input type="hidden" name="wallet_id" value={selected?.id ?? ''} />
                          <input type="hidden" name="category_id" value={category.id} />
                          <span className="flex-1 self-center truncate text-xs text-neutral-500">
                            {category.icon} {category.name}
                          </span>
                          <input
                            name="amount"
                            inputMode="decimal"
                            type="text"
                            placeholder="—"
                            defaultValue={catBudget ? Number(catBudget.amount).toFixed(2) : ''}
                            className="w-24 rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-xs dark:border-neutral-700"
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700"
                          >
                            Set
                          </button>
                        </form>
                      </div>
                    )
                  })}
                </div>
              </details>
            </section>
          )
        })}
      </div>

      <p className="mt-10 text-xs text-neutral-500">
        Clear a budget by emptying the box and saving.
      </p>
    </>
  )
}
