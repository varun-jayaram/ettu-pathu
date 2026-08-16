import { toggleRecurringRule } from '../actions'
import { getCategoryGroups, getRecurringRules, getWallets } from '@/lib/queries'
import { formatEur, sumCents } from '@/lib/money'
import { RecurringForm } from '@/components/recurring-form'

/**
 * Recurring rules — rent, insurance, subscriptions, donations.
 *
 * Entered once, then materialised into real expenses by
 * materialize_recurring() on page load. Lazy rather than cron: nothing to
 * monitor, no scheduler to fail silently, and the numbers are correct at the
 * moment you look at them.
 */
export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>
}) {
  const params = await searchParams
  const [wallets, groups, rules] = await Promise.all([
    getWallets(),
    getCategoryGroups(),
    getRecurringRules(),
  ])

  const active = rules.filter((rule) => rule.active)
  const archived = rules.filter((rule) => !rule.active)
  const monthlyTotal = sumCents(active)
  const committedTotal = sumCents(
    active.filter((rule) => rule.categories.category_groups.kind === 'committed'),
  )

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Recurring</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Entered once, filled in automatically every month.
      </p>

      {params.added && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Rule created — any occurrences already due have been added.
        </p>
      )}

      {active.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-xs text-neutral-500">Committed floor</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatEur(committedTotal)}
            </p>
            <p className="mt-1 text-xs text-neutral-500">what you must earn</p>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-xs text-neutral-500">All recurring</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatEur(monthlyTotal)}
            </p>
            <p className="mt-1 text-xs text-neutral-500">per month</p>
          </div>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Active rules</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            None yet. Add rent, insurance, Rundfunkbeitrag, subscriptions and your
            donation below — then the Committed floor stops needing to be retyped.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
            {active.map((rule) => (
              <li key={rule.id} className="flex items-center gap-3 py-3">
                <span aria-hidden className="text-lg">
                  {rule.categories.icon ?? '↻'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {rule.categories.name}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    day {rule.day_of_month} · {rule.wallets.name}
                    {rule.note ? ` · ${rule.note}` : ''}
                  </p>
                </div>
                <span className="tabular-nums text-sm font-medium">
                  {formatEur(Math.round(Number(rule.amount) * 100))}
                </span>
                <form action={toggleRecurringRule}>
                  <input type="hidden" name="id" value={rule.id} />
                  <input type="hidden" name="active" value="true" />
                  <button
                    type="submit"
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700"
                  >
                    Stop
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Add a recurring expense</h2>
        <div className="mt-3">
          <RecurringForm wallets={wallets} groups={groups} />
        </div>
      </section>

      {archived.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-neutral-500">Stopped</h2>
          <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
            {archived.map((rule) => (
              <li key={rule.id} className="flex items-center gap-3 py-3 text-neutral-500">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{rule.categories.name}</p>
                  <p className="truncate text-xs">
                    day {rule.day_of_month} · {rule.wallets.name}
                  </p>
                </div>
                <span className="tabular-nums text-sm">
                  {formatEur(Math.round(Number(rule.amount) * 100))}
                </span>
                <form action={toggleRecurringRule}>
                  <input type="hidden" name="id" value={rule.id} />
                  <input type="hidden" name="active" value="false" />
                  <button
                    type="submit"
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                  >
                    Resume
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        Stopping a rule never deletes the expenses it already created — history
        stays intact. Generated expenses are marked ↻ in the log and can be edited
        or deleted individually if a month differs.
      </p>
    </>
  )
}
