import Link from 'next/link'
import {
  currentMonthRange,
  getExpenses,
  getWallets,
  materializeRecurring,
} from '@/lib/queries'
import { formatEur, isSpend, sumCents, toCents } from '@/lib/money'

/**
 * This month at a glance. The full dashboard — budget bars, group breakdown,
 * trends — is step 9; this is the honest minimum that makes the app useful the
 * day expenses start going in.
 */
export default async function HomePage() {
  // Fill in any due rent/subscriptions before reading totals, so the numbers
  // are correct at the moment you look at them. Idempotent.
  await materializeRecurring()

  const { from, to } = currentMonthRange()
  const [wallets, expenses] = await Promise.all([
    getWallets(),
    getExpenses({ from, to, limit: 500 }),
  ])

  const spend = expenses.filter((e) => isSpend(e.categories.category_groups.kind))
  const committedCents = sumCents(
    spend.filter((e) => e.categories.category_groups.kind === 'committed'),
  )
  const variableCents = sumCents(
    spend.filter((e) => e.categories.category_groups.kind === 'variable'),
  )

  const monthName = new Date(`${from}T00:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">{monthName}</h1>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-neutral-500">Committed</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatEur(committedCents)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">your monthly floor</p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-neutral-500">Variable</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatEur(variableCents)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">the spend you can move</p>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-medium">By wallet</h2>
      <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
        {wallets.map((wallet) => {
          const walletSpend = sumCents(spend.filter((e) => e.wallets.id === wallet.id))
          return (
            <li key={wallet.id} className="flex items-center justify-between py-3">
              <span className="text-sm">
                {wallet.name}
                <span className="ml-2 text-xs text-neutral-500">
                  {wallet.kind === 'personal' ? 'private' : 'shared'}
                </span>
              </span>
              <span className="tabular-nums text-sm font-medium">
                {formatEur(walletSpend)}
              </span>
            </li>
          )
        })}
      </ul>

      <h2 className="mt-8 text-sm font-medium">Recent</h2>
      {expenses.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Nothing logged this month yet.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
          {expenses.slice(0, 5).map((expense) => (
            <li key={expense.id} className="flex items-center gap-3 py-3">
              <span aria-hidden>{expense.categories.icon ?? '•'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{expense.categories.name}</p>
                <p className="truncate text-xs text-neutral-500">
                  {expense.wallets.name}
                  {expense.note ? ` · ${expense.note}` : ''}
                </p>
              </div>
              <span className="tabular-nums text-sm">
                {formatEur(toCents(expense.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/expenses"
        className="mt-4 inline-block text-sm text-neutral-500 hover:underline"
      >
        See all expenses →
      </Link>
    </>
  )
}
