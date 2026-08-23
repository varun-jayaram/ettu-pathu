/**
 * Pay-cycle periods.
 *
 * The household is paid between the 25th and 27th, so calendar months were the
 * wrong unit: the last days of each month were funded by the next salary, and
 * the budget reset five days after payday.
 *
 * A period runs from an anchor day (default the 26th) to the day before the
 * next one. That keeps EXACTLY ONE period per calendar month, so
 * month-over-month comparison still works. A literal rolling 30 days would
 * drift ~5 days a year and eventually put two period starts in one month.
 *
 * When an actual salary is logged near a boundary, the boundary SNAPS to it —
 * so the cycle follows reality when you bother to record it, and falls back to
 * the anchor when you don't.
 *
 * All arithmetic is on Y/M/D integers rather than Date objects, because Date
 * silently applies a timezone and can shift a date across a day boundary.
 */

export type ISODate = string // YYYY-MM-DD

export type Period = {
  from: ISODate
  to: ISODate
  /** Named for the month the period ENDS in — 26 Aug–25 Sep is "September". */
  label: string
  /** First of the month this period is named for: "2026-09-01". The key a
   *  monthly budget is stored under. */
  month: ISODate
  /** True when a real payday moved a boundary off the anchor day. */
  snapped: boolean
  /** True when someone set this month's start date by hand. */
  overridden: boolean
  daysTotal: number
  daysElapsed: number
  daysLeft: number
}

/** Manual cycle starts, keyed by the month the cycle is named for. */
export type PeriodStarts = Record<ISODate, ISODate>

export type PeriodOptions = {
  anchorDay?: number
  salaryDates?: ISODate[]
  windowDays?: number
  /** `{ '2026-09-01': '2026-08-24' }` — September starts on 24 Aug. */
  starts?: PeriodStarts
}

/**
 * The longest a cycle may run. Longer than a calendar month on purpose: a
 * payday that slips can stretch a cycle past 31 days without anything being
 * wrong, and refusing that would block a real situation. Past 35 it is a
 * mis-keyed date, not a late salary.
 */
export const MAX_CYCLE_DAYS = 35

const pad = (n: number) => String(n).padStart(2, '0')

export function iso(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`
}

export function parseIso(value: ISODate): [number, number, number] {
  const [y, m, d] = value.split('-').map(Number)
  return [y, m, d]
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** The 31st in February becomes the 28th/29th, never March 3rd. */
export function clampDay(y: number, m: number, day: number): number {
  return Math.min(day, daysInMonth(y, m))
}

export function addDays(value: ISODate, delta: number): ISODate {
  const [y, m, d] = parseIso(value)
  const shifted = new Date(Date.UTC(y, m - 1, d + delta))
  return iso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

export function diffDays(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = parseIso(a)
  const [by, bm, bd] = parseIso(b)
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)
  return Math.round(ms / 86_400_000)
}

function shiftMonth(y: number, m: number, delta: number): [number, number] {
  const total = y * 12 + (m - 1) + delta
  return [Math.floor(total / 12), (total % 12) + 1]
}

/** The anchor date for a given month, clamped to that month's length. */
function anchorIn(y: number, m: number, anchorDay: number): ISODate {
  return iso(y, m, clampDay(y, m, anchorDay))
}

/**
 * Pick the logged payday nearest to `boundary`, within `windowDays`.
 * Anything further away is a stray payment, not this cycle's salary.
 */
function snapTo(
  boundary: ISODate,
  salaryDates: ISODate[],
  windowDays: number,
): ISODate | null {
  let best: ISODate | null = null
  let bestDistance = Infinity

  for (const date of salaryDates) {
    const distance = Math.abs(diffDays(boundary, date))
    if (distance <= windowDays && distance < bestDistance) {
      best = date
      bestDistance = distance
    }
  }
  return best
}

/**
 * The month a cycle STARTING on the anchor in month `m` is named for: the next
 * one, because a period is named for the month it ends in.
 */
function labelMonthFor(y: number, m: number): ISODate {
  const [ny, nm] = shiftMonth(y, m, 1)
  return iso(ny, nm, 1)
}

export function getPeriod(today: ISODate, options: PeriodOptions = {}): Period {
  const anchorDay = options.anchorDay ?? 26
  const salaryDates = options.salaryDates ?? []
  const windowDays = options.windowDays ?? 7
  const starts = options.starts ?? {}

  const [y, m] = parseIso(today)

  /**
   * Build every nearby boundary WITH snapping already applied, then pick the
   * cycle containing `today`.
   *
   * Order matters: an earlier version chose the cycle from the unsnapped
   * anchor first and snapped afterwards, which could move a boundary out from
   * under `today` and return a period that did not contain it. A salary
   * arriving on the 24th with an anchor of the 26th produced
   * "26 Jul – 23 Aug" on the 25th of August.
   */
  const boundaries: {
    date: ISODate
    snapped: boolean
    overridden: boolean
    month: ISODate
  }[] = []

  for (let offset = -2; offset <= 2; offset++) {
    const [by, bm] = shiftMonth(y, m, offset)
    const month = labelMonthFor(by, bm)

    // A hand-set start wins outright: it is the one boundary a human asked
    // for, so neither the anchor nor a logged payday may move it.
    const override = starts[month]
    if (override) {
      boundaries.push({ date: override, snapped: false, overridden: true, month })
      continue
    }

    const anchor = anchorIn(by, bm, anchorDay)
    const actual = snapTo(anchor, salaryDates, windowDays)
    boundaries.push({
      date: actual ?? anchor,
      snapped: Boolean(actual),
      overridden: false,
      month,
    })
  }

  boundaries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  // Two months' anchors can snap onto the same payday; keep one.
  const unique = boundaries.filter(
    (boundary, index) => index === 0 || boundary.date !== boundaries[index - 1].date,
  )

  let startIndex = 0
  for (let i = 0; i < unique.length; i++) {
    if (unique[i].date <= today) startIndex = i
  }

  const current = unique[startIndex]
  const from = current.date
  const nextFrom = unique[startIndex + 1]?.date ?? addDays(from, 30)
  const snapped = current.snapped || Boolean(unique[startIndex + 1]?.snapped)

  const to = addDays(nextFrom, -1)

  return describe(from, to, current.month, today, snapped, current.overridden)
}

/** Assemble a Period from a known window. Shared so every path labels and
 *  counts days identically. */
function describe(
  from: ISODate,
  to: ISODate,
  month: ISODate,
  today: ISODate,
  snapped: boolean,
  overridden: boolean,
): Period {
  const [my, mm] = parseIso(month)
  const label = new Date(Date.UTC(my, mm - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const daysTotal = diffDays(from, to) + 1
  const daysElapsed = Math.max(
    0,
    Math.min(diffDays(from, today) + 1, daysTotal),
  )

  return {
    from,
    to,
    label,
    month,
    snapped,
    overridden,
    daysTotal,
    daysElapsed,
    daysLeft: Math.max(daysTotal - daysElapsed, 0),
  }
}

/**
 * The period for a specific month, whether or not it contains today. This is
 * what the month picker on Plan navigates with: "show me September" must work
 * in August.
 *
 * Derived by asking getPeriod about a day the cycle is guaranteed to contain —
 * the label month's anchor day, which always falls inside the cycle named for
 * it, since that cycle runs from late in the previous month to late in this one.
 */
export function getPeriodForMonth(
  month: ISODate,
  today: ISODate,
  options: PeriodOptions = {},
): Period {
  const [my, mm] = parseIso(month)
  const anchorDay = options.anchorDay ?? 26
  // One day before the next cycle would start: firmly inside this one.
  const probe = addDays(anchorIn(my, mm, anchorDay), -1)
  const period = getPeriod(probe, options)
  return describe(
    period.from,
    period.to,
    month,
    today,
    period.snapped,
    period.overridden,
  )
}

/** Month keys either side of `month`, for the picker. */
export function shiftMonthKey(month: ISODate, delta: number): ISODate {
  const [y, m] = parseIso(month)
  const [ny, nm] = shiftMonth(y, m, delta)
  return iso(ny, nm, 1)
}

export function monthLabel(month: ISODate): string {
  const [y, m] = parseIso(month)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Why a proposed start date for `month` is not allowed, or null if it is.
 *
 * The two rules, in the user's words: the cycle named for a month has to end
 * before that month does, and no cycle may run longer than MAX_CYCLE_DAYS. Both are
 * checked here AND as CHECK constraints in 0015 — this function exists to
 * explain the refusal, not to be the only thing enforcing it.
 */
export function startDateProblem(
  month: ISODate,
  startsOn: ISODate,
  neighbours: { previousStart?: ISODate; nextStart?: ISODate } = {},
): string | null {
  const earliest = shiftMonthKey(month, -1)
  const latest = month

  if (startsOn < earliest) {
    return `Too early — ${monthLabel(month)} cannot start before ${earliest}.`
  }
  if (startsOn > latest) {
    return `Too late — ${monthLabel(month)} must start on or before ${latest}, or it would end after the month is over.`
  }

  const { previousStart, nextStart } = neighbours

  if (previousStart && startsOn <= previousStart) {
    return `Must be after the previous cycle starts (${previousStart}).`
  }
  if (previousStart && diffDays(previousStart, startsOn) > MAX_CYCLE_DAYS) {
    return `That would make the previous cycle ${diffDays(previousStart, startsOn)} days. A cycle cannot exceed ${MAX_CYCLE_DAYS} days.`
  }
  if (nextStart && startsOn >= nextStart) {
    return `Must be before the next cycle starts (${nextStart}).`
  }
  if (nextStart && diffDays(startsOn, nextStart) > MAX_CYCLE_DAYS) {
    return `That would make ${monthLabel(month)} ${diffDays(startsOn, nextStart)} days. A cycle cannot exceed ${MAX_CYCLE_DAYS} days.`
  }

  return null
}

/**
 * The next date a recurring rule will fire, on or after `today`.
 *
 * Respects `start_date` — a rule dated day 1 but starting on the 16th does not
 * fire on the 1st of that month; its first occurrence is the 1st of the next.
 * That is correct, and it is also the source of an apparent discrepancy worth
 * surfacing in the UI rather than making people work out.
 */
export function nextOccurrence(
  dayOfMonth: number,
  startDate: ISODate,
  today: ISODate,
): ISODate {
  const floor = startDate > today ? startDate : today
  const [y, m] = parseIso(floor)

  for (let offset = 0; offset <= 13; offset++) {
    const [oy, om] = shiftMonth(y, m, offset)
    const candidate = iso(oy, om, clampDay(oy, om, dayOfMonth))
    if (candidate >= floor) return candidate
  }
  return floor
}

/** Today as YYYY-MM-DD in the user's local timezone. */
export function todayIso(): ISODate {
  const now = new Date()
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate())
}
