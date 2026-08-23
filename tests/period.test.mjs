import {
  getPeriod,
  getPeriodForMonth,
  monthLabel,
  nextOccurrence,
  shiftMonthKey,
  startDateProblem,
} from '../lib/period.ts'

let failed = 0
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`}`)
  if (!ok) failed++
}

const range = (p) => [p.from, p.to, p.label]

// --- Before the anchor: you are still in the previous cycle ----------------
eq('16 Aug, anchor 26 -> previous cycle',
  range(getPeriod('2026-08-16', { anchorDay: 26 })),
  ['2026-07-26', '2026-08-25', 'August 2026'])

// --- On the anchor: new cycle starts today --------------------------------
eq('26 Aug -> new cycle, named September',
  range(getPeriod('2026-08-26', { anchorDay: 26 })),
  ['2026-08-26', '2026-09-25', 'September 2026'])

eq('30 Aug -> still the September cycle',
  range(getPeriod('2026-08-30', { anchorDay: 26 })),
  ['2026-08-26', '2026-09-25', 'September 2026'])

// --- Short-month clamping: 31st must not roll into March ------------------
eq('anchor 31, mid-Feb -> clamps to 28 Feb',
  range(getPeriod('2026-02-15', { anchorDay: 31 })),
  ['2026-01-31', '2026-02-27', 'February 2026'])

// --- Snapping to a real payday --------------------------------------------
eq('salary on 27 Aug snaps the boundary',
  range(getPeriod('2026-08-28', { anchorDay: 26, salaryDates: ['2026-08-27'] })),
  ['2026-08-27', '2026-09-25', 'September 2026'])

eq('salary on 24 Aug (early) also snaps',
  range(getPeriod('2026-08-25', { anchorDay: 26, salaryDates: ['2026-08-24'] })),
  ['2026-08-24', '2026-09-25', 'September 2026'])

// --- A stray mid-month payment must NOT move the boundary -----------------
eq('salary on 10 Aug is outside the window, ignored',
  range(getPeriod('2026-08-28', { anchorDay: 26, salaryDates: ['2026-08-10'] })),
  ['2026-08-26', '2026-09-25', 'September 2026'])

const snappedFlag = getPeriod('2026-08-28', { anchorDay: 26, salaryDates: ['2026-08-10'] }).snapped
eq('snapped flag false when nothing snapped', snappedFlag, false)

// --- Both boundaries snap --------------------------------------------------
eq('both ends snap',
  range(getPeriod('2026-09-01', { anchorDay: 26, salaryDates: ['2026-08-27', '2026-09-25'] })),
  ['2026-08-27', '2026-09-24', 'September 2026'])

// --- No drift: 12 consecutive cycles start in 12 distinct months -----------
{
  const starts = []
  for (let m = 1; m <= 12; m++) {
    starts.push(getPeriod(`2026-${String(m).padStart(2, '0')}-27`, { anchorDay: 26 }).from)
  }
  const months = new Set(starts.map((s) => s.slice(0, 7)))
  eq('12 cycles start in 12 distinct months (no drift)', months.size, 12)
}

// --- Day counting ----------------------------------------------------------
{
  const p = getPeriod('2026-08-30', { anchorDay: 26 })
  eq('daysTotal 26 Aug-25 Sep is 31', p.daysTotal, 31)
  eq('daysElapsed on 30 Aug is 5', p.daysElapsed, 5)
  eq('daysLeft is 26', p.daysLeft, 26)
}

// --- Leap year -------------------------------------------------------------
eq('leap year: anchor 29, Feb 2028',
  range(getPeriod('2028-03-01', { anchorDay: 29 })),
  ['2028-02-29', '2028-03-28', 'March 2028'])

// --- nextOccurrence: start_date must beat day_of_month --------------------
eq('day 1 rule starting 16 Aug -> first fires 1 Sep',
  nextOccurrence(1, '2026-08-16', '2026-08-17'), '2026-09-01')
eq('day 1 rule started long ago, today 17 Aug -> 1 Sep',
  nextOccurrence(1, '2026-01-01', '2026-08-17'), '2026-09-01')
eq('day 20 rule, today 17 Aug -> 20 Aug',
  nextOccurrence(20, '2026-01-01', '2026-08-17'), '2026-08-20')
eq('day 20 rule, today IS the 20th -> today',
  nextOccurrence(20, '2026-01-01', '2026-08-20'), '2026-08-20')
eq('day 31 rule in February clamps to the 28th',
  nextOccurrence(31, '2026-01-01', '2026-02-01'), '2026-02-28')

// --- month keys ------------------------------------------------------------
// A period is named for the month it ENDS in, so its month key is that month.
eq('month key of the 26 Aug–25 Sep cycle is September',
  getPeriod('2026-08-30', { anchorDay: 26 }).month, '2026-09-01')
eq('month key of the 26 Jul–25 Aug cycle is August',
  getPeriod('2026-08-16', { anchorDay: 26 }).month, '2026-08-01')

eq('shiftMonthKey rolls the year backwards',
  shiftMonthKey('2026-01-01', -1), '2025-12-01')
eq('shiftMonthKey rolls the year forwards',
  shiftMonthKey('2026-12-01', 1), '2027-01-01')
eq('monthLabel', monthLabel('2026-09-01'), 'September 2026')

// --- getPeriodForMonth: reach a month that has not arrived ----------------
// The whole point of the picker: in August, ask for September and October.
eq('September asked for on 23 Aug',
  range(getPeriodForMonth('2026-09-01', '2026-08-23', { anchorDay: 26 })),
  ['2026-08-26', '2026-09-25', 'September 2026'])
eq('October asked for on 23 Aug',
  range(getPeriodForMonth('2026-10-01', '2026-08-23', { anchorDay: 26 })),
  ['2026-09-26', '2026-10-25', 'October 2026'])
eq('a past month is still reachable',
  range(getPeriodForMonth('2026-06-01', '2026-08-23', { anchorDay: 26 })),
  ['2026-05-26', '2026-06-25', 'June 2026'])

// A month that has not started must not report days as already elapsed.
eq('a future cycle has elapsed 0 days',
  getPeriodForMonth('2026-10-01', '2026-08-23', { anchorDay: 26 }).daysElapsed, 0)

// --- hand-set starts override both the anchor and a logged payday ---------
const starts = { '2026-09-01': '2026-08-24' }

eq('override moves the September cycle start',
  range(getPeriod('2026-08-30', { anchorDay: 26, starts })),
  ['2026-08-24', '2026-09-25', 'September 2026'])
eq('override is flagged',
  getPeriod('2026-08-30', { anchorDay: 26, starts }).overridden, true)
eq('override also ends the PREVIOUS cycle a day earlier',
  range(getPeriod('2026-08-16', { anchorDay: 26, starts })),
  ['2026-07-26', '2026-08-23', 'August 2026'])

// A logged payday must not drag a boundary a human set by hand.
eq('override beats a nearby salary date',
  range(getPeriod('2026-08-30', {
    anchorDay: 26,
    starts,
    salaryDates: ['2026-08-27'],
  })),
  ['2026-08-24', '2026-09-25', 'September 2026'])

// --- startDateProblem: the two rules, in the user's words -----------------
eq('24 Aug is a fine start for September',
  startDateProblem('2026-09-01', '2026-08-24'), null)
eq('1 Sep is the last allowed start for September',
  startDateProblem('2026-09-01', '2026-09-01'), null)

const tooLate = startDateProblem('2026-09-01', '2026-09-02')
eq('2 Sep is refused for September', tooLate !== null, true)
eq('…and says why', /must start on or before/.test(tooLate ?? ''), true)

const tooEarly = startDateProblem('2026-09-01', '2026-07-20')
eq('20 Jul is refused for September', tooEarly !== null, true)

// 31-day ceiling, checked against both neighbours.
const longPrevious = startDateProblem('2026-09-01', '2026-09-01', {
  previousStart: '2026-07-20',
})
eq('a 43-day previous cycle is refused', longPrevious !== null, true)
eq('…and names the limit', /cannot exceed 31 days/.test(longPrevious ?? ''), true)

const longThis = startDateProblem('2026-09-01', '2026-08-01', {
  nextStart: '2026-09-26',
})
eq('a 56-day September is refused', longThis !== null, true)

eq('a 31-day cycle is allowed',
  startDateProblem('2026-09-01', '2026-08-26', { nextStart: '2026-09-26' }), null)
eq('starting on or after the next cycle is refused',
  startDateProblem('2026-09-01', '2026-08-26', { nextStart: '2026-08-26' }) !== null,
  true)

console.log(failed ? `\n${failed} FAILED` : '\nAll period cases correct.')
process.exit(failed ? 1 : 0)
