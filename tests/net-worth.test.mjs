import {
  appliedBalanceCents,
  netCents,
  paidOffCents,
  pendingCents,
  progressPercent,
} from '../lib/net-worth.ts'

let failed = 0
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`}`)
  if (!ok) failed++
}

const CAR = 'car'
const FUND = 'fund'
const pay = (cents, item, applied = false) => {
  return { cents, net_worth_item_id: item, applied }
}

// --- Net worth is the typed balances, nothing else ------------------------
eq('a loan counts against you', netCents('loan', 800000), -800000)
eq('an investment counts for you', netCents('investment', 540000), 540000)
eq('a paid-off loan weighs nothing', netCents('loan', 0), 0)

// --- Progress needs a principal to mean anything --------------------------
eq('a loan with a principal shows how much is behind you',
  paidOffCents(1200000, 800000), 400000)
eq('a loan with no principal has no progress to show', paidOffCents(null, 800000), null)
eq('paid off is never negative', paidOffCents(1200000, 1400000), 0)
eq('no target means no bar, not an empty one', progressPercent(540000, null), null)
eq('progress is a percentage of the total', progressPercent(300000, 1200000), 25)
eq('progress never exceeds the bar', progressPercent(1400000, 1200000), 100)

// --- Pending is what has been tagged but not yet applied ------------------
{
  const payments = [
    pay(30000, CAR),
    pay(100000, CAR),
    pay(25000, FUND),
    pay(4520, null), // untagged: never anybody's
  ]
  eq('pending is every unapplied payment naming the entry',
    [pendingCents(CAR, payments), pendingCents(FUND, payments)], [130000, 25000])
  eq('an untagged payment is pending for nobody', pendingCents(null, payments), 0)
}

// --- Applied payments drop out, which is what stops double-counting -------
{
  const payments = [pay(30000, CAR, true), pay(100000, CAR)]
  eq('an applied payment is no longer pending', pendingCents(CAR, payments), 100000)

  const allApplied = [pay(30000, CAR, true), pay(100000, CAR, true)]
  eq('pressing Apply twice has nothing left to do',
    pendingCents(CAR, allApplied), 0)
  eq('so the second press cannot move the balance',
    appliedBalanceCents('loan', 640050, pendingCents(CAR, allApplied)), 640050)
}

// --- Applying moves the balance the right way -----------------------------
eq('a loan falls by what was applied',
  appliedBalanceCents('loan', 770050, 130000), 640050)
eq('an investment rises by it',
  appliedBalanceCents('investment', 540000, 25000), 565000)
eq('applying more than was owed goes negative rather than clamping',
  appliedBalanceCents('loan', 50000, 130000), -80000)
eq('nothing pending changes nothing',
  appliedBalanceCents('loan', 770050, 0), 770050)

console.log(failed === 0 ? '\nAll net-worth tests passed.' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
