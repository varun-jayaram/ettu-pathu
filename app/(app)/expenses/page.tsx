import { deleteExpense, updateExpense } from '../actions'
import { getCategoryGroups, getExpenses, getWallets, type ExpenseRow } from '@/lib/queries'
import { formatEur, isSpend, sumCents, toCents } from '@/lib/money'
import { ConfirmDelete } from '@/components/confirm-delete'
import { EditDialog, Field, fieldClass } from '@/components/edit-dialog'

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
  const [wallets, groups, expenses] = await Promise.all([
    getWallets(),
    getCategoryGroups(),
    getExpenses({ walletId: params.wallet, search: params.q, limit: 200 }),
  ])

  // Transfers are money moved, not money burnt — kept out of the total but
  // still shown in the list. See PROJECT.md § Categories.
  const spendCents = sumCents(
    expenses.filter((e) => isSpend(e.categories.category_groups.kind)),
  )
  const transferCents = sumCents(
    expenses.filter((e) => !isSpend(e.categories.category_groups.kind)),
  )

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
          <p className="text-xs text-neutral-500">Spend</p>
          <p className="text-lg font-semibold tabular-nums">{formatEur(spendCents)}</p>
        </div>
        {transferCents > 0 && (
          <div>
            <p className="text-xs text-neutral-500">Transfers (excluded)</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-500">
              {formatEur(transferCents)}
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
          {Object.entries(byDate).map(([date, rows]) => (
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
                      </p>
                    </div>
                    <span
                      className={`tabular-nums text-sm font-medium ${
                        isSpend(expense.categories.category_groups.kind)
                          ? ''
                          : 'text-neutral-500'
                      }`}
                    >
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
                          {groups.map((group) => (
                            <optgroup key={group.id} label={group.name}>
                              {group.categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.icon ? `${category.icon} ` : ''}
                                  {category.name}
                                </option>
                              ))}
                            </optgroup>
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
            </section>
          ))}
        </div>
      )}
    </>
  )
}
