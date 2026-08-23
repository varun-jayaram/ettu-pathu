import { deleteIncome, setPeriodStart, updateIncome } from '../actions'
import { getActivePeriod, getIncome, getSettings } from '@/lib/queries'
import { formatEur, sumCents } from '@/lib/money'
import { MAX_CYCLE_DAYS, monthLabel, shiftMonthKey } from '@/lib/period'
import { IncomeForm } from '@/components/income-form'
import { ConfirmDelete } from '@/components/confirm-delete'
import { EditDialog, Field, fieldClass } from '@/components/edit-dialog'

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
  const period = await getActivePeriod()

  const [settings, periodIncome, recentIncome] = await Promise.all([
    getSettings(),
    getIncome({ from: period.from, to: period.to }),
    getIncome({ limit: 30 }),
  ])

  const periodTotal = sumCents(periodIncome)
  const anchorDay = Number(settings.pay_anchor_day ?? 26)

  // Mirrors the CHECK constraint in 0015: the cycle named for a month must
  // start between the first of the previous month and the first of that one,
  // which is what keeps it ending inside its own month.
  const nextMonth = shiftMonthKey(period.month, 1)
  const earliestStart = shiftMonthKey(period.month, -1)
  const latestStart = period.month

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
          <IncomeForm />
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
                <EditDialog action={updateIncome} id={row.id} title="Edit income">
                  <Field label="Amount">
                    <input
                      name="amount"
                      inputMode="decimal"
                      type="text"
                      required
                      defaultValue={Number(row.amount).toFixed(2)}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Source">
                    <select name="source" defaultValue={row.source} className={fieldClass}>
                      {['salary','bonus','freelance','interest','gift','refund','other'].map((s) => (
                        <option key={s} value={s} className="capitalize">
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Received on">
                    <input
                      name="received_on"
                      type="date"
                      required
                      defaultValue={row.received_on}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Note">
                    <input
                      name="note"
                      type="text"
                      defaultValue={row.note ?? ''}
                      className={fieldClass}
                    />
                  </Field>
                </EditDialog>
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

      {/* This lives on Income, not Plan, because income is what defines the
          cycle — see the docstring above. It used to be a "Pay cycle" box
          asking for a day-of-the-month anchor, which set every cycle at once
          and could not express "September started late". You now set the month
          in front of you. */}
      <section className="mt-10 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Income cycle</h2>
        <p className="mt-1 text-xs text-neutral-500">
          {period.label} runs {formatDate(period.from)} – {formatDate(period.to)} ·{' '}
          {period.daysTotal} days
          {period.overridden
            ? ' · set by hand'
            : period.snapped
              ? ' · following your actual payday'
              : ` · from the ${anchorDay}${ordinal(anchorDay)}`}
        </p>

        {/* Only the START. The end is always the day before the next cycle, so
            a gap or an overlap cannot be expressed at all. */}
        <form action={setPeriodStart} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="period_month" value={period.month} />
          <input
            name="starts_on"
            type="date"
            defaultValue={period.overridden ? period.from : ''}
            min={earliestStart}
            max={latestStart}
            className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            {period.overridden ? 'Update' : 'Set start'}
          </button>
          {period.overridden && (
            <button
              type="submit"
              name="starts_on"
              value=""
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700"
            >
              Reset
            </button>
          )}
        </form>

        <p className="mt-2 text-xs text-neutral-500">
          Ends the day before {monthLabel(nextMonth)} starts. Must begin between{' '}
          {formatDate(earliestStart)} and {formatDate(latestStart)} so the cycle
          ends inside {period.label}, and no cycle may run past {MAX_CYCLE_DAYS}{' '}
          days. Change month in the header to set a different one.
        </p>
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

/** "26th", "1st", "22nd" — only used to describe the fallback anchor day. */
function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th'
  return { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th'
}
