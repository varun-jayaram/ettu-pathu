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
  /** True when a real payday moved a boundary off the anchor day. */
  snapped: boolean
  daysTotal: number
  daysElapsed: number
  daysLeft: number
}

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

export function getPeriod(
  today: ISODate,
  options: {
    anchorDay?: number
    salaryDates?: ISODate[]
    windowDays?: number
  } = {},
): Period {
  const anchorDay = options.anchorDay ?? 26
  const salaryDates = options.salaryDates ?? []
  const windowDays = options.windowDays ?? 7

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
  const boundaries: { date: ISODate; snapped: boolean }[] = []

  for (let offset = -2; offset <= 2; offset++) {
    const [by, bm] = shiftMonth(y, m, offset)
    const anchor = anchorIn(by, bm, anchorDay)
    const actual = snapTo(anchor, salaryDates, windowDays)
    boundaries.push({ date: actual ?? anchor, snapped: Boolean(actual) })
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

  const from = unique[startIndex].date
  const nextFrom = unique[startIndex + 1]?.date ?? addDays(from, 30)
  const snapped =
    unique[startIndex].snapped || Boolean(unique[startIndex + 1]?.snapped)

  const to = addDays(nextFrom, -1)

  const [ey, em] = parseIso(to)
  const label = new Date(Date.UTC(ey, em - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const daysTotal = diffDays(from, to) + 1
  const daysElapsed = Math.min(diffDays(from, today) + 1, daysTotal)

  return {
    from,
    to,
    label,
    snapped,
    daysTotal,
    daysElapsed,
    daysLeft: Math.max(daysTotal - daysElapsed, 0),
  }
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
