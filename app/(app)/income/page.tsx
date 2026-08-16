import { deleteIncome, setAnchorDay } from '../actions'
import { getCurrentPeriod, getIncome, getSettings } from '@/lib/queries'
import { formatEur, sumCents } from '@/lib/money'
import { todayIso } from '@/lib/period'
import { IncomeForm } from '@/components/income-form'
import { ConfirmDelete } from '@/components/confirm-delete'

/**
 * Income — the "eight annas" half of the proverb, and the thing that defines
 * the pay cycle. Shared between both people by design; only spending is
 * private.
 */
export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>
}) {
  const params = await searchParams
  const period = await getCurrentPeriod()

  const [settings, periodIncome, recentIncome] = await Promise.all([
    getSettings(),
    getIncome({ from: period.from, to: period.to }),
    getIncome({ limit: 30 }),
  ])

  const periodTotal = sumCents(periodIncome)
  const anchorDay = Number(settings.pay_anchor_day ?? 26)

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Income</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {period.label} cycle · {formatDate(period.from)} – {formatDate(period.to)}
        {period.snapped && ' · following your actual payday'}
      </p>

      {params.added && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Income saved.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-xs text-neutral-500">Received this cycle</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {formatEur(periodTotal)}
        </p>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Log income</h2>
        <div className="mt-3">
          <IncomeForm today={todayIso()} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Recent</h2>
        {recentIncome.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing logged yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
            {recentIncome.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium capitalize">
                    {row.source}
                    {row.source === 'salary' && (
                      <span
                        title="Sets the pay-cycle start"
                        className="ml-1.5 text-xs text-neutral-500"
                      >
                        ⚓
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {formatDate(row.received_on)}
                    {row.note ? ` · ${row.note}` : ''}
                  </p>
                </div>
                <span className="tabular-nums text-sm font-medium">
                  {formatEur(Math.round(Number(row.amount) * 100))}
                </span>
                <ConfirmDelete
                  action={deleteIncome}
                  id={row.id}
                  title={row.source}
                  detail={`${formatDate(row.received_on)}${
                    row.note ? ` · ${row.note}` : ''
                  }`}
                  amount={formatEur(Math.round(Number(row.amount) * 100))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Pay cycle</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Cycles run from this day of the month to the day before the next. When you
          log a salary within {settings.pay_anchor_window_days ?? 7} days of it, the
          cycle follows the real payday instead.
        </p>
        <form action={setAnchorDay} className="mt-3 flex gap-2">
          <input
            name="anchor_day"
            type="number"
            min={1}
            max={31}
            defaultValue={anchorDay}
            className="w-20 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Save
          </button>
        </form>
      </section>
    </>
  )
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
