import Link from 'next/link'
import {
  getActivePeriod,
  getBudgets,
  getExpenses,
  getHouseholdTotals,
  getIncome,
  getRecentPeriods,
  getRecurringRules,
  getWallets,
} from '@/lib/queries'
import { addDays } from '@/lib/period'
import { formatEur, sumCents, toCents } from '@/lib/money'
import {
  CumulativeLine,
  CycleColumns,
  GroupBars,
  VizStyles,
  type BarItem,
  type BarRow,
} from '@/components/charts'

/**
 * Reports. Everything is scoped to the pay cycle, and every euro that leaves
 * counts — savings included. Spending is split by whether a recurring rule
 * created the row, which is a fact about the data rather than a label.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string; view?: 'expenses' | 'savings' }>
}) {
  const params = await searchParams
  const period = await getActivePeriod()
  const [periods, wallets] = await Promise.all([
    // The trend ends on the month being viewed, not on today — otherwise
    // stepping forward would leave the chart behind the headline numbers.
    getRecentPeriods(6, period.isLive ? null : period.month),
    getWallets(),
  ])

  const span = { from: periods[0].from, to: period.to }
  const [allExpenses, allIncome, totals, budgets, rules, cycleTotals] =
    await Promise.all([
    getExpenses({ ...span, walletId: params.wallet, limit: 2000 }),
    getIncome({ ...span, limit: 500 }),
    getHouseholdTotals(period.from, period.to, period.month),
    // Only to draw a reference line on a category's chart — what the spending
    // was supposed to stay under, or the recurring floor when nobody set one.
    getBudgets(period.month),
    getRecurringRules(),
    // Each cycle's budget total must come from that cycle's own month, or a
    // trend line would compare this month's spend against every month's budgets
    // added together.
    Promise.all(periods.map((c) => getHouseholdTotals(c.from, c.to, c.month))),
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

  // --- Where it went, by category --------------------------------------------
  // Once was two charts, "by group" above "top categories". With one level in
  // the taxonomy they would be the same chart twice, so this is the only one.
  const shortDate = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })

  // --- Day by day ------------------------------------------------------------
  /**
   * Every date in the cycle, including the ones nothing was spent on. A series
   * built only from the days that have expenses would space them evenly and
   * silently rewrite the calendar — four shops in one week and one in the next
   * would look like five evenly-paced weeks.
   */
  const cycleDays = Array.from({ length: period.daysTotal }, (_, i) =>
    addDays(period.from, i),
  )
  const dailySeries = (rows: typeof spend) => {
    const byDay = new Map<string, number>()
    for (const expense of rows) {
      byDay.set(
        expense.spent_on,
        (byDay.get(expense.spent_on) ?? 0) + toCents(expense.amount),
      )
    }
    return cycleDays.map((date) => ({ date, cents: byDay.get(date) ?? 0 }))
  }

  /**
   * What a category's line is measured against: the budget if one was set,
   * else the recurring floor, else nothing. Same order Plan uses — a category
   * with rules and no budget is still planned, just not with a budget.
   *
   * Summed across wallets unless one is selected, because the bar above it is
   * a household figure. In practice that is the joint wallet's number: a
   * personal wallet takes a single wallet-scope budget, never a per-category
   * one.
   */
  const categoryReference = (categoryId: string) => {
    const budgetCents = budgets
      .filter(
        (b) =>
          b.category_id === categoryId &&
          (!params.wallet || b.wallet_id === params.wallet),
      )
      .reduce((total, b) => total + toCents(b.amount), 0)
    if (budgetCents > 0) {
      return { cents: budgetCents, label: 'budget' }
    }
    const floorCents = sumCents(
      rules.filter(
        (r) =>
          r.active &&
          r.categories.id === categoryId &&
          (!params.wallet || r.wallet_id === params.wallet),
      ),
    )
    return floorCents > 0
      ? { cents: floorCents, label: '↻ recurring' }
      : { cents: 0, label: undefined }
  }

  const byCategory = new Map<
    string,
    { label: string; cents: number; items: BarItem[]; rows: typeof spend }
  >()
  for (const expense of spend) {
    const category = expense.categories
    const entry = byCategory.get(category.id) ?? {
      label: `${category.icon ?? ''} ${category.name}`.trim(),
      cents: 0,
      items: [],
      rows: [] as typeof spend,
    }
    entry.cents += Math.round(Number(expense.amount) * 100)
    entry.rows.push(expense)
    // The rows that make up the bar, so a total can be checked rather than
    // taken on trust. Newest first, matching the Log.
    entry.items.push({
      id: expense.id,
      label: `${shortDate(expense.spent_on)}${expense.note ? ` · ${expense.note}` : ''}`,
      sublabel: `${expense.wallets.name}${expense.recurring_rule_id ? ' · ↻' : ''}`,
      cents: Math.round(Number(expense.amount) * 100),
    })
    byCategory.set(category.id, entry)
  }
  const categoryRows: BarRow[] = [
    // `items` are already newest-first: getExpenses orders by spent_on desc,
    // and they were pushed in that order. Re-sorting here by the row id would
    // order by UUID, which is no order at all.
    ...[...byCategory.entries()].map(([id, { rows, ...value }]) => {
      const reference = categoryReference(id)
      return {
        id,
        ...value,
        chart: (
          <CumulativeLine
            label={value.label}
            days={dailySeries(rows)}
            daysElapsed={period.daysElapsed}
            referenceCents={reference.cents}
            referenceLabel={reference.label}
          />
        ),
      }
    }),
    // One lump row per wallet whose detail is private to the other person.
    // Without these the bars would not add up to the household total.
    //
    // NO `items`, deliberately — that is what makes the row non-expandable.
    // There is nothing to expand even in principle: this figure came from the
    // aggregate-only totals function, which never returns rows. See PROJECT.md.
    ...(params.wallet || view
      ? []
      : hiddenWallets.map((w) => ({
          id: w.wallet_id,
          label: `${w.wallet_name} (personal)`,
          cents: toCents(w.spent),
          hint: 'private · total only',
        }))),
  ].sort((a, b) => b.cents - a.cents)

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

      {/* The super graph. Sits where "at this rate you'll finish around X"
          used to: the same question, answered by a slope you can extend
          yourself instead of a projected number stated to the cent.

          The line can only be drawn from rows this user may READ, so when a
          private wallet is contributing to the headline total the two
          genuinely differ. Said out loud rather than quietly reconciled — the
          aggregate function returns totals with no dates, by design, so there
          is no way to draw that money and there never will be. */}
      {visibleCents > 0 && (
        <section className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">
              {view === 'savings' ? 'Saved so far' : 'Spent so far'}
            </h2>
            <span className="text-xs text-neutral-500">running total</span>
          </div>
          <div className="mt-2">
            <CumulativeLine
              label={view === 'savings' ? 'Saved this cycle' : 'Spent this cycle'}
              days={dailySeries(spend)}
              daysElapsed={period.daysElapsed}
              referenceCents={!params.wallet && !view ? incomeCents : 0}
              referenceLabel="income"
              note={
                !params.wallet && !view && hiddenCents > 0
                  ? `Excludes ${formatEur(hiddenCents)} from a private wallet — a total without dates, so it cannot be drawn.`
                  : undefined
              }
            />
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Where it went</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Tap a bar to see the expenses that add up to it.
        </p>
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
