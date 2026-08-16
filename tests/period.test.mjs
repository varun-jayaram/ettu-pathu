import { getPeriod } from '../lib/period.ts'

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

console.log(failed ? `\n${failed} FAILED` : '\nAll period cases correct.')
process.exit(failed ? 1 : 0)
