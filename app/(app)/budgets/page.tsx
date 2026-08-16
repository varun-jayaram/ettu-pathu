import { setBudget } from '../actions'
import {
  currentMonthRange,
  getBudgets,
  getCategoryGroups,
  getExpenses,
  getWallets,
} from '@/lib/queries'
import { formatEur, sumCents } from '@/lib/money'
import { BudgetBar } from '@/components/budget-bar'

/**
 * Budgets: per wallet, at group level, calendar month, no rollover.
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
  const { from, to } = currentMonthRange()

  const [wallets, groups, budgets, expenses] = await Promise.all([
    getWallets(),
    getCategoryGroups(),
    getBudgets(),
    getExpenses({ from, to, limit: 1000 }),
  ])

  const selected = wallets.find((w) => w.id === params.wallet) ?? wallets[0]
  const variableGroups = groups.filter((g) => g.kind === 'variable')

  const monthName = new Date(`${from}T00:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  const walletExpenses = expenses.filter((e) => e.wallets.id === selected?.id)

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Budgets</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {monthName} · resets on the 1st, nothing carries over
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

      <div className="mt-6 space-y-8">
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
        Committed spending isn&apos;t budgeted — it&apos;s contractual, and shown as your
        monthly floor on Home instead. Savings and investments are transfers, so
        they never consume a budget. Clear a budget by emptying the box and saving.
      </p>
    </>
  )
}
