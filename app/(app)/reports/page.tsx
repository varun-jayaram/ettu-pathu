import Link from 'next/link'
import {
  getCurrentPeriod,
  getExpenses,
  getIncome,
  getRecentPeriods,
  getWallets,
} from '@/lib/queries'
import { formatEur, sumCents } from '@/lib/money'
import { CycleColumns, GroupBars, VizStyles } from '@/components/charts'

/**
 * Reports. Everything is scoped to the pay cycle, and every euro that leaves
 * counts — savings included. Spending is split by whether a recurring rule
 * created the row, not by any label on the category's group.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string }>
}) {
  const params = await searchParams
  const [period, periods, wallets] = await Promise.all([
    getCurrentPeriod(),
    getRecentPeriods(6),
    getWallets(),
  ])

  const span = { from: periods[0].from, to: period.to }
  const [allExpenses, allIncome] = await Promise.all([
    getExpenses({ ...span, walletId: params.wallet, limit: 2000 }),
    getIncome({ ...span, limit: 500 }),
  ])

  const inCycle = allExpenses.filter(
    (e) => e.spent_on >= period.from && e.spent_on <= period.to,
  )
  const spend = inCycle
  const recurring = inCycle.filter((e) => e.recurring_rule_id)

  const spendCents = sumCents(spend)
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
  const groupRows = [...byGroup.entries()]
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.cents - a.cents)

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
  const cycles = periods.map((cycle) => ({
    label: cycle.label,
    inCents: sumCents(
      allIncome.filter((i) => i.received_on >= cycle.from && i.received_on <= cycle.to),
    ),
    outCents: sumCents(
      allExpenses.filter(
        (e) => e.spent_on >= cycle.from && e.spent_on <= cycle.to,
      ),
    ),
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
        <Link
          href="/reports"
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
            href={`/reports?wallet=${wallet.id}`}
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
          {params.wallet ? 'Spent this cycle' : 'Left this cycle'}
        </p>
        <p
          className={`mt-1 text-5xl font-semibold tabular-nums ${
            !params.wallet && netCents < 0 ? 'text-red-600' : ''
          }`}
        >
          {formatEur(params.wallet ? spendCents : netCents)}
        </p>
        {!params.wallet && (
          <p className="mt-1 text-sm text-neutral-500">
            {formatEur(incomeCents)} in · {formatEur(spendCents)} out
            {recurringCents > 0 && ` · ${formatEur(recurringCents)} of it recurring`}
          </p>
        )}
        {!params.wallet && netCents < 0 && (
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
        Every euro that leaves counts here, savings included. Income is shared;
        personal wallet spending is not, so &quot;All&quot; shows only wallets you
        belong to.
      </p>
    </>
  )
}
