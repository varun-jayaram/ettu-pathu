import { setMonth } from '@/app/(app)/actions'
import { getActivePeriod } from '@/lib/queries'
import { monthLabel, shiftMonthKey } from '@/lib/period'

/**
 * The app-wide month. Lives in the header, so it frames every tab at once
 * rather than being a filter you set on one page and forget on another.
 *
 * It is a MODE, not a page, which is why it is a cookie rather than a URL
 * parameter — see setMonth(). The cost of a mode is that it can be forgotten,
 * so this deliberately does not look neutral when you are off the live cycle:
 * the label goes amber and a "Today" escape appears. A month picker that
 * silently reframes the dashboard is how you read October's numbers and
 * believe they are today's.
 */
export async function MonthPicker() {
  const period = await getActivePeriod()
  const previous = shiftMonthKey(period.month, -1)
  const next = shiftMonthKey(period.month, 1)

  const step =
    'rounded-lg border border-neutral-300 px-2 py-1 text-sm leading-none dark:border-neutral-700'

  return (
    <form
      action={setMonth}
      className="flex shrink-0 items-center gap-1.5"
      aria-label="Month"
    >
      <button
        type="submit"
        name="month"
        value={previous}
        className={step}
        aria-label={`Go to ${monthLabel(previous)}`}
      >
        ←
      </button>

      <span
        className={`whitespace-nowrap text-xs tabular-nums ${
          period.isLive ? 'text-neutral-500' : 'font-medium text-amber-600'
        }`}
      >
        {period.label}
        {!period.isLive && <span className="ml-1" aria-hidden>•</span>}
        <span className="sr-only">
          {period.isLive ? ' (live cycle)' : ' (not the live cycle)'}
        </span>
      </span>

      <button
        type="submit"
        name="month"
        value={next}
        className={step}
        aria-label={`Go to ${monthLabel(next)}`}
      >
        →
      </button>

      {/* Clearing the cookie is what returns every tab to the live cycle. */}
      {!period.isLive && (
        <button
          type="submit"
          name="month"
          value=""
          className="whitespace-nowrap rounded-lg border border-amber-600 px-2 py-1 text-xs leading-none text-amber-600"
        >
          Today
        </button>
      )}
    </form>
  )
}
