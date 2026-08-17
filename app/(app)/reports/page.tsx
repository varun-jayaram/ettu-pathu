import Link from 'next/link'
import {
  getCurrentPeriod,
  getExpenses,
  getHouseholdTotals,
  getIncome,
  getRecentPeriods,
  getWallets,
} from '@/lib/queries'
import { formatEur, sumCents, toCents } from '@/lib/money'
import { CycleColumns, GroupBars, VizStyles } from '@/components/charts'

/**
 * Reports. Everything is scoped to the pay cycle, and every euro that leaves
 * counts — savings included. Spending is split by whether a recurring rule
 * created the row, not by any label on the category's group.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string; view?: 'expenses' | 'savings' }>
}) {
  const params = await searchParams
  const [period, periods, wallets] = await Promise.all([
    getCurrentPeriod(),
    getRecentPeriods(6),
    getWallets(),
  ])

  const span = { from: periods[0].from, to: period.to }
  const [allExpenses, allIncome, totals, cycleTotals] = await Promise.all([
    getExpenses({ ...span, walletId: params.wallet, limit: 2000 }),
    getIncome({ ...span, limit: 500 }),
    getHouseholdTotals(period.from, period.to),
    Promise.all(periods.map((c) => getHouseholdTotals(c.from, c.to))),
  ])

  // Wallets this user cannot read row-by-row. They appear as a single lump so
  // the chart totals match Home, without leaking a category. See PROJECT.md.
  const hiddenWallets = totals.filter(
    (t) => !wallets.some((w) => w.id === t.wallet_id) && toCents(t.spent) > 0,
  )

  // `view` narrows to money spent vs money kept. Savings still counts in every
  // total — this only chooses what the breakdowns are about.
  const view = params.view
  const matchesView = (e: { categories: { is_savings: boolean } }) =>
    view === 'savings' ? e.categories.is_savings
    : view === 'expenses' ? !e.categories.is_savings
    : true

  const inCycle = allExpenses.filter(
    (e) => e.spent_on >= period.from && e.spent_on <= period.to && matchesView(e),
  )
  const spend = inCycle
  const recurring = inCycle.filter((e) => e.recurring_rule_id)

  // Household figure when unfiltered; only what is visible when a wallet or
  // view filter is applied, since those are explicitly narrower questions.
  const visibleCents = sumCents(spend)
  const hiddenCents = hiddenWallets.reduce((t, w) => t + toCents(w.spent), 0)
  const spendCents =
    params.wallet || view ? visibleCents : visibleCents + hiddenCents
  const incomeCents = sumCents(
    allIncome.filter((i) => i.received_on >= period.from && i.received_on <= period.to),
  )
  const netCents = incomeCents - spendCents
  const recurringCents = sumCents(recurring)

  // --- Where it went, by group -----------------------------------------------
  const byGroup = new Map<string, { label: string; cents: number }>()
  for (const expense of spend) {
    const group = expense.categories.category_groups
    const entry = byGroup.get(group.id) ?? { label: group.name, cents: 0 }
    entry.cents += Math.round(Number(expense.amount) * 100)
    byGroup.set(group.id, entry)
  }
  const groupRows = [
    ...[...byGroup.entries()].map(([id, value]) => ({ id, ...value })),
    // One lump row per wallet whose detail is private to the other person.
    ...(params.wallet || view
      ? []
      : hiddenWallets.map((w) => ({
          id: w.wallet_id,
          label: `${w.wallet_name} (personal)`,
          cents: toCents(w.spent),
        }))),
  ].sort((a, b) => b.cents - a.cents)

  // --- Top categories --------------------------------------------------------
  const byCategory = new Map<string, { label: string; cents: number; hint: string }>()
  for (const expense of spend) {
    const category = expense.categories
    const entry = byCategory.get(category.id) ?? {
      label: `${category.icon ?? ''} ${category.name}`.trim(),
      cents: 0,
      hint: category.category_groups.name,
    }
    entry.cents += Math.round(Number(expense.amount) * 100)
    byCategory.set(category.id, entry)
  }
  const categoryRows = [...byCategory.entries()]
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 8)

  // --- Trend across cycles ---------------------------------------------------
  const cycles = periods.map((cycle, index) => ({
    label: cycle.label,
    inCents: sumCents(
      allIncome.filter((i) => i.received_on >= cycle.from && i.received_on <= cycle.to),
    ),
    // Household-wide, so the trend matches Home rather than one person's view.
    outCents:
      params.wallet || view
        ? sumCents(
            allExpenses.filter(
              (e) => e.spent_on >= cycle.from && e.spent_on <= cycle.to,
            ),
          )
        : cycleTotals[index].reduce((t, w) => t + toCents(w.spent), 0),
  }))

  const dailyRate = period.daysElapsed > 0 ? spendCents / period.daysElapsed : 0
  const projected = Math.round(dailyRate * period.daysTotal)

  return (
    <>
      <VizStyles />

      <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {period.label} cycle · {period.daysElapsed} of {period.daysTotal} days
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {([
          ['', 'Everything'],
          ['expenses', 'Expenses'],
          ['savings', 'Savings'],
        ] as const).map(([value, label]) => {
          const query = new URLSearchParams()
          if (params.wallet) query.set('wallet', params.wallet)
          if (value) query.set('view', value)
          const active = (params.view ?? '') === value
          return (
            <Link
              key={label}
              href={`/reports${query.toString() ? `?${query}` : ''}`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                active
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                  : 'border-neutral-300 dark:border-neutral-700'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href={params.view ? `/reports?view=${params.view}` : '/reports'}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            !params.wallet
              ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
              : 'border-neutral-300 dark:border-neutral-700'
          }`}
        >
          All
        </Link>
        {wallets.map((wallet) => (
          <Link
            key={wallet.id}
            href={`/reports?wallet=${wallet.id}${params.view ? `&view=${params.view}` : ''}`}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              params.wallet === wallet.id
                ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {wallet.name}
          </Link>
        ))}
      </div>

      {/* Hero: the one number the page leads with. */}
      <section className="mt-6">
        <p className="text-xs text-neutral-500">
          {view === 'savings'
            ? 'Saved this cycle'
            : params.wallet || view === 'expenses'
              ? 'Spent this cycle'
              : 'Left this cycle'}
        </p>
        <p
          className={`mt-1 text-5xl font-semibold tabular-nums ${
            !params.wallet && netCents < 0 ? 'text-red-600' : ''
          }`}
        >
          {formatEur(params.wallet || view ? spendCents : netCents)}
        </p>
        {!params.wallet && !view && (
          <p className="mt-1 text-sm text-neutral-500">
            {formatEur(incomeCents)} in · {formatEur(spendCents)} out
            {recurringCents > 0 && ` · ${formatEur(recurringCents)} of it recurring`}
          </p>
        )}
        {!params.wallet && !view && netCents < 0 && (
          <p className="mt-1 text-sm text-red-600">
            வரவு எட்டணா, செலவு பத்தணா — out is ahead of in this cycle.
          </p>
        )}
      </section>

      {spendCents > 0 && period.daysElapsed < period.daysTotal && (
        <p className="mt-4 rounded-xl border border-neutral-200 p-3 text-sm text-neutral-500 dark:border-neutral-800">
          At this rate you&apos;ll finish the cycle around{' '}
          <span className="font-medium tabular-nums">{formatEur(projected)}</span> of
          total spend.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Where it went</h2>
        <GroupBars rows={groupRows} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Top categories</h2>
        <GroupBars rows={categoryRows} />
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">In and out, last {cycles.length} cycles</h2>
        <CycleColumns cycles={cycles} />

        {/* Table view: the numbers are never colour-only. */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
                <th className="py-2 font-medium">Cycle</th>
                <th className="py-2 text-right font-medium">In</th>
                <th className="py-2 text-right font-medium">Out</th>
                <th className="py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => {
                const net = cycle.inCents - cycle.outCents
                return (
                  <tr
                    key={cycle.label}
                    className="border-b border-neutral-100 dark:border-neutral-900"
                  >
                    <td className="py-2">{cycle.label}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatEur(cycle.inCents)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatEur(cycle.outCents)}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        net < 0 ? 'text-red-600' : ''
                      }`}
                    >
                      {formatEur(net)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 text-xs text-neutral-500">
        Every euro that leaves counts here, savings included. Income is shared.
        A personal wallet you are not in appears as a single total — never its
        categories, notes or individual amounts.
      </p>
    </>
  )
}
