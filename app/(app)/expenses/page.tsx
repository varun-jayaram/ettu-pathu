import { deleteExpense, updateExpense } from '../actions'
import {
  getActivePeriod,
  getCategories,
  getExpenses,
  getNetWorthItems,
  getWallets,
  type ExpenseRow,
} from '@/lib/queries'
import { formatEur, sumCents, toCents } from '@/lib/money'
import { ConfirmDelete } from '@/components/confirm-delete'
import { EditDialog, Field, fieldClass } from '@/components/edit-dialog'
import { TOWARDS_WHAT_LABEL, TowardsWhat } from '@/components/towards-what'

/**
 * The searchable log. Filters are plain GET parameters so a filtered view is a
 * real URL you can bookmark, share between the two of you, or reload.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string; q?: string; added?: string }>
}) {
  const params = await searchParams
  const period = await getActivePeriod()

  /**
   * The log follows the header's month like every other tab — EXCEPT while
   * searching. "Where did that petrol charge go?" is a question about all of
   * history, and scoping it to the month on screen would answer "nowhere" for
   * anything outside it, which reads as data loss rather than as a filter.
   *
   */
  const searching = Boolean(params.q)

  const [wallets, categories, allNetWorthItems, expenses] = await Promise.all([
    getWallets(),
    getCategories(),
    getNetWorthItems(),
    getExpenses({
      walletId: params.wallet,
      search: params.q,
      ...(searching ? {} : { from: period.from, to: period.to }),
      limit: 200,
    }),
  ])

  // Archived entries are not something to pay into, so they are not offered —
  // but an expense already tagged to one keeps its tag, which is why the row
  // below falls back to the full list when it needs a name.
  const netWorthItems = allNetWorthItems.filter((item) => item.active)

  const spendCents = sumCents(expenses)
  const recurringCents = sumCents(expenses.filter((e) => e.recurring_rule_id))

  const byDate = expenses.reduce<Record<string, ExpenseRow[]>>((groups, expense) => {
    ;(groups[expense.spent_on] ??= []).push(expense)
    return groups
  }, {})

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Expenses</h1>
        <span className="text-sm text-neutral-500">{expenses.length} shown</span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        {searching ? (
          <>Searching every cycle, not just {period.label}</>
        ) : (
          <>
            {period.label} · {period.from} – {period.to}
          </>
        )}
      </p>

      {params.added && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Expense saved.
        </p>
      )}

      <form className="mt-4 flex gap-2">
        <select
          name="wallet"
          defaultValue={params.wallet ?? ''}
          className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        >
          <option value="">All wallets</option>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>
              {wallet.name}
            </option>
          ))}
        </select>
        <input
          name="q"
          type="search"
          placeholder="Search notes…"
          defaultValue={params.q ?? ''}
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
        <button
          type="submit"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
        >
          Filter
        </button>
      </form>

      <div className="mt-4 flex gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div>
          <p className="text-xs text-neutral-500">Total</p>
          <p className="text-lg font-semibold tabular-nums">{formatEur(spendCents)}</p>
        </div>
        {recurringCents > 0 && (
          <div>
            <p className="text-xs text-neutral-500">of which recurring</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-500">
              {formatEur(recurringCents)}
            </p>
          </div>
        )}
      </div>

      {expenses.length === 0 ? (
        <p className="mt-8 text-center text-sm text-neutral-500">
          Nothing here yet. Add your first expense.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {Object.entries(byDate).map(([date, rows]) => {
            const dayCents = sumCents(rows)
            const dayRecurringCents = sumCents(
              rows.filter((e) => e.recurring_rule_id),
            )

            return (
              <section key={date}>
                <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </h2>
                <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
                  {rows.map((expense) => (
                    <li key={expense.id} className="flex items-center gap-3 py-3">
                      <span aria-hidden className="text-lg">
                        {expense.categories.icon ?? '•'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {expense.categories.name}
                          {expense.recurring_rule_id && (
                            <span
                              title="Generated from a recurring rule"
                              className="ml-1.5 text-xs text-neutral-500"
                            >
                              ↻
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-neutral-500">
                          {expense.wallets.name}
                          {expense.note ? ` · ${expense.note}` : ''}
                          {/* What this payment moved. Shown on the row, not
                              only inside the dialog, so an untagged loan
                              payment is visible without opening anything. */}
                          {expense.net_worth_item_id && (
                            <span className="text-neutral-400">
                              {' '}
                              · →{' '}
                              {allNetWorthItems.find(
                                (item) => item.id === expense.net_worth_item_id,
                              )?.name ?? 'a closed entry'}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="tabular-nums text-sm font-medium">
                        {formatEur(toCents(expense.amount))}
                      </span>
                      <EditDialog
                        action={updateExpense}
                        id={expense.id}
                        title="Edit expense"
                      >
                        <Field label="Amount">
                          <input
                            name="amount"
                            inputMode="decimal"
                            type="text"
                            required
                            defaultValue={Number(expense.amount).toFixed(2)}
                            className={fieldClass}
                          />
                        </Field>
                        <Field label="Category">
                          <select
                            name="category_id"
                            required
                            defaultValue={expense.categories.id}
                            className={fieldClass}
                          >
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.icon ? `${category.icon} ` : ''}
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Wallet">
                          <select
                            name="wallet_id"
                            required
                            defaultValue={expense.wallets.id}
                            className={fieldClass}
                          >
                            {wallets.map((wallet) => (
                              <option key={wallet.id} value={wallet.id}>
                                {wallet.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Date">
                          <input
                            name="spent_on"
                            type="date"
                            required
                            defaultValue={expense.spent_on}
                            className={fieldClass}
                          />
                        </Field>
                        <Field label="Note">
                          <input
                            name="note"
                            type="text"
                            defaultValue={expense.note ?? ''}
                            className={fieldClass}
                          />
                        </Field>
                        {/* The field that makes a balance move. It lives here
                            rather than on the loan itself: the payment is the
                            thing that knows what it paid. */}
                        {netWorthItems.length > 0 && (
                          <Field label={TOWARDS_WHAT_LABEL}>
                            <TowardsWhat
                              items={netWorthItems}
                              defaultValue={expense.net_worth_item_id}
                              className={fieldClass}
                            />
                            <span className="mt-1 block text-xs text-neutral-500">
                              Optional. Net worth offers it as a payment to
                              apply to that balance — nothing moves until you
                              press Apply there.
                            </span>
                          </Field>
                        )}
                      </EditDialog>
                      <ConfirmDelete
                        action={deleteExpense}
                        id={expense.id}
                        title={expense.categories.name}
                        detail={`${expense.wallets.name}${
                          expense.note ? ` · ${expense.note}` : ''
                        }`}
                        amount={formatEur(toCents(expense.amount))}
                      />
                    </li>
                  ))}
                </ul>

                {/* The day's total, UNDER its rows rather than beside the date:
                    a sum belongs at the foot of the column it sums, and reading
                    it there is what makes "what did today cost?" answerable
                    without adding the lines up yourself.

                    Recurring is split out for the same reason the page header
                    splits it — the 1st of the month is not a day you overspent,
                    it is the day the rent left, and one big number with no
                    explanation reads as the former. */}
                <div className="mt-1 flex items-baseline justify-end gap-3 border-t border-neutral-200 pt-2 dark:border-neutral-800">
                  <span className="text-xs text-neutral-500">
                    {rows.length} {rows.length === 1 ? 'expense' : 'expenses'}
                    {dayRecurringCents > 0 && (
                      <> · ↻ {formatEur(dayRecurringCents)} recurring</>
                    )}
                  </span>
                  <span className="tabular-nums text-sm font-medium">
                    {formatEur(dayCents)}
                  </span>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
