import { addDays, parseIso, type ISODate } from '@/lib/period'

/**
 * Monday–Sunday weeks, for the Meals tab.
 *
 * Independent of the pay cycle on purpose: a cycle starts around the 26th and a
 * week starts on a Monday, and the two never line up. Meals ignores the header
 * month for the same reason Net worth does.
 *
 * Y/M/D integers via lib/period.ts, never a local Date — see that file for why.
 */

/** ISO weekday: Monday 1 … Sunday 7. */
function isoWeekday(value: ISODate): number {
  const [y, m, d] = parseIso(value)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

export function mondayOf(value: ISODate): ISODate {
  return addDays(value, 1 - isoWeekday(value))
}

export function weekDays(monday: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function shiftWeek(monday: ISODate, delta: number): ISODate {
  return addDays(monday, 7 * delta)
}

function shortDate(value: ISODate): string {
  const [y, m, d] = parseIso(value)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/** "27 Oct – 2 Nov". */
export function weekLabel(monday: ISODate): string {
  return `${shortDate(monday)} – ${shortDate(addDays(monday, 6))}`
}

/** "Mon 27 Oct". */
export function dayLabel(value: ISODate): string {
  const [y, m, d] = parseIso(value)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/** A `?week=` value, or null if it is not a real date. Any day snaps to its Monday. */
export function parseWeekParam(value: string | undefined): ISODate | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = parseIso(value)
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null
  return mondayOf(value)
}
