import {
  deleteBudget,
  deleteRecurringRule,
  setBudget,
  toggleCategorySavings,
  toggleRecurringRule,
  updateRecurringRule,
} from '../actions'
import {
  getBudgets,
  getCategoryGroups,
  getCurrentPeriod,
  getExpenses,
  getRecurringRules,
  getWallets,
} from '@/lib/queries'
import { formatEur, sumCents, toCents } from '@/lib/money'
import { BudgetBar } from '@/components/budget-bar'
import { RecurringForm } from '@/components/recurring-form'
import { ConfirmDelete } from '@/components/confirm-delete'
import { EditDialog, Field, fieldClass } from '@/components/edit-dialog'
import { nextOccurrence, todayIso } from '@/lib/period'

/**
 * Plan — the two ways money is committed ahead of time.
 *
 *   RECURRING  it goes out every month regardless. Entered once, filled in
 *              automatically. ANY category can be recurring.
 *   BUDGET     a target you might miss — groceries, petrol, eating out. ANY
 *              group or category can carry one.
 *
 * The two are independent: a category may have both, either, or neither, and
 * nothing is implied by which group it sits in. Groups are folders, not
 * meanings. See PROJECT.md.
 *
 * The period is the pay cycle, not the calendar month — the household is paid
 * around the 26th, so a calendar reset landed five days after payday.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string }>
}) {
  const params = await searchParams
  const period = await getCurrentPeriod()
  const { from, to } = period

  const [wallets, groups, budgets, expenses, rules] = await Promise.all([
    getWallets(),
    getCategoryGroups(),
    getBudgets(),
    getExpenses({ from, to, limit: 1000 }),
    getRecurringRules(),
  ])

  // Default to Joint: it holds the shared costs and is the only wallet that
  // offers recurring rules.
  const selected =
    wallets.find((w) => w.id === params.wallet) ??
    wallets.find((w) => w.kind === 'joint') ??
    wallets[0]

  const walletExpenses = expenses.filter((e) => e.wallets.id === selected?.id)
  const walletRules = rules.filter((r) => r.wallet_id === selected?.id)
  const showRecurring = selected?.kind === 'joint'
  const activeRules = walletRules.filter((r) => r.active)
  const recurringMonthly = sumCents(activeRules)

  // What those rules have actually produced this cycle. These differ whenever a
  // rule is not due yet — a rule dated day 1 but started on the 16th first
  // fires next month — and the gap was confusing without being shown.
  const recurringLanded = sumCents(
    walletExpenses.filter((e) => e.recurring_rule_id),
  )
  const notYetDue = recurringMonthly - recurringLanded
  const today = todayIso()

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Plan</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {period.label} cycle · {period.daysLeft} days left, nothing carries over
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {wallets.map((wallet) => (
          <a
            key={wallet.id}
            href={`/budgets?wallet=${wallet.id}`}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              wallet.id === selected?.id
                ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {wallet.name}
          </a>
        ))}
      </div>

      {/* ------------------------------ RECURRING ------------------------ */}
      {showRecurring && (
        <section className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">Recurring</h2>
            <span className="tabular-nums text-sm font-semibold">
              {formatEur(recurringMonthly)}
              <span className="ml-1 font-normal text-neutral-500">/ month</span>
            </span>
          </div>
          {notYetDue !== 0 && (
            <p className="mt-1 text-xs text-neutral-500">
              {formatEur(recurringLanded)} of it has landed this cycle ·{' '}
              <span className="text-amber-600">
                {formatEur(notYetDue)} not due yet
              </span>
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-500">
            Goes out every month whatever you do — rent, insurance, loans,
            subscriptions, tickets, donations, savings. Entered once, then filled
            in automatically. Any category can be recurring.
          </p>

          {walletRules.length === 0 ? (
            <p className="mt-3 text-xs text-neutral-500">
              Nothing recurring yet. Add the first one below.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
              {walletRules.map((rule) => (
                <li key={rule.id} className="flex items-center gap-2 py-2.5">
                  <span aria-hidden>{rule.categories.icon ?? '↻'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {rule.categories.name}
                      {!rule.active && (
                        <span className="ml-1.5 text-xs text-neutral-500">stopped</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      day {rule.day_of_month} · {rule.categories.category_groups.name}
                      {rule.note ? ` · ${rule.note}` : ''}
                    </p>
                    {rule.active &&
                      !walletExpenses.some((e) => e.recurring_rule_id === rule.id) && (
                        <p className="truncate text-xs text-amber-600">
                          not due this cycle · next{' '}
                          {new Date(
                            `${nextOccurrence(rule.day_of_month, rule.start_date, today)}T00:00:00Z`,
                          ).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            timeZone: 'UTC',
                          })}
                        </p>
                      )}
                  </div>
                  <span className="tabular-nums text-sm font-medium">
                    {formatEur(toCents(rule.amount))}
                  </span>

                  <EditDialog
                    action={updateRecurringRule}
                    id={rule.id}
                    title="Edit recurring expense"
                  >
                    <Field label="Amount">
                      <input
                        name="amount"
                        inputMode="decimal"
                        type="text"
                        required
                        defaultValue={Number(rule.amount).toFixed(2)}
                        className={fieldClass}
                      />
                    </Field>
                    <Field label="Category">
                      <select
                        name="category_id"
                        required
                        defaultValue={rule.categories.id}
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
                    <Field label="Day of month">
                      <input
                        name="day_of_month"
                        type="number"
                        min={1}
                        max={31}
                        required
                        defaultValue={rule.day_of_month}
                        className={fieldClass}
                      />
                    </Field>
                    <Field label="Starting from">
                      <input
                        name="start_date"
                        type="date"
                        required
                        defaultValue={rule.start_date}
                        className={fieldClass}
                      />
                      <span className="mt-1 block text-xs text-neutral-500">
                        Occurrences before this date are skipped. Move it earlier
                        to backfill a month that was missed.
                      </span>
                    </Field>
                    <Field label="Note">
                      <input
                        name="note"
                        type="text"
                        defaultValue={rule.note ?? ''}
                        className={fieldClass}
                      />
                    </Field>
                  </EditDialog>

                  <form action={toggleRecurringRule}>
                    <input type="hidden" name="id" value={rule.id} />
                    <input type="hidden" name="active" value={String(rule.active)} />
                    <button
                      type="submit"
                      className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700"
                    >
                      {rule.active ? 'Stop' : 'Resume'}
                    </button>
                  </form>

                  <ConfirmDelete
                    action={deleteRecurringRule}
                    id={rule.id}
                    title={rule.categories.name}
                    detail={`Recurring, day ${rule.day_of_month} — expenses already created are kept`}
                    amount={formatEur(toCents(rule.amount))}
                  />
                </li>
              ))}
            </ul>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-neutral-500">
              Add a recurring expense
            </summary>
            <div className="mt-3">
              <RecurringForm groups={groups} walletId={selected!.id} />
            </div>
          </details>
        </section>
      )}

      {/* ------------------------------- BUDGETS ------------------------- */}
      <h2 className="mt-8 text-sm font-medium">Budgets</h2>
      <p className="mt-1 text-xs text-neutral-500">
        What you&apos;d ideally spend, knowing you might not — groceries, petrol,
        eating out, films. Set one on a whole group, on a single category, or
        both. Leave a group blank if it doesn&apos;t need one.
      </p>

      <div className="mt-4 space-y-8">
        {groups.map((group) => {
          const groupSpend = sumCents(
            walletExpenses.filter((e) => e.categories.category_groups.id === group.id),
          )
          const groupBudget = budgets.find(
            (b) => b.wallet_id === selected?.id && b.group_id === group.id,
          )
          const groupBudgetCents = groupBudget ? toCents(groupBudget.amount) : 0

          return (
            <section key={group.id}>
              {groupBudgetCents > 0 ? (
                <BudgetBar
                  label={group.name}
                  spentCents={groupSpend}
                  budgetCents={groupBudgetCents}
                />
              ) : (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{group.name}</span>
                  <span className="tabular-nums text-xs text-neutral-500">
                    {formatEur(groupSpend)} spent · no budget
                  </span>
                </div>
              )}

              {/* ConfirmDelete renders its own <form>, so it must be a SIBLING
                  of this one. Nested forms are invalid HTML: the parser closes
                  the outer form at the inner one, orphaning this Save button so
                  it silently stops submitting. */}
              <div className="mt-2 flex items-center gap-2">
                <form action={setBudget} className="flex min-w-0 flex-1 gap-2">
                  <input type="hidden" name="wallet_id" value={selected?.id ?? ''} />
                  <input type="hidden" name="group_id" value={group.id} />
                  <input
                    name="amount"
                    inputMode="decimal"
                    type="text"
                    placeholder="Set a monthly budget…"
                    defaultValue={groupBudget ? Number(groupBudget.amount).toFixed(2) : ''}
                    className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
                  >
                    Save
                  </button>
                </form>
                {groupBudget && (
                  <ConfirmDelete
                    action={deleteBudget}
                    id={groupBudget.id}
                    title={`${group.name} budget`}
                    detail={`${selected?.name} · removes the budget, not the spending`}
                    amount={formatEur(groupBudgetCents)}
                  />
                )}
              </div>

              {/* Sub-limits are tripwires inside the group, never a second
                  definition of "over". */}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-neutral-500">
                  Per-category limits (warn only)
                </summary>
                <div className="mt-3 space-y-3">
                  {group.categories.map((category) => {
                    const catSpend = sumCents(
                      walletExpenses.filter((e) => e.categories.id === category.id),
                    )
                    const catBudget = budgets.find(
                      (b) =>
                        b.wallet_id === selected?.id && b.category_id === category.id,
                    )
                    const catCents = catBudget ? toCents(catBudget.amount) : 0

                    return (
                      <div key={category.id}>
                        {catCents > 0 && (
                          <BudgetBar
                            label={category.name}
                            spentCents={catSpend}
                            budgetCents={catCents}
                            advisory
                          />
                        )}
                        <div className="mt-1 flex items-center gap-2 pl-4">
                          <form action={setBudget} className="flex min-w-0 flex-1 gap-2">
                            <input
                              type="hidden"
                              name="wallet_id"
                              value={selected?.id ?? ''}
                            />
                            <input
                              type="hidden"
                              name="category_id"
                              value={category.id}
                            />
                            <span className="flex-1 self-center truncate text-xs text-neutral-500">
                              {category.icon} {category.name}
                            </span>
                            <input
                              name="amount"
                              inputMode="decimal"
                              type="text"
                              placeholder="—"
                              defaultValue={
                                catBudget ? Number(catBudget.amount).toFixed(2) : ''
                              }
                              className="w-24 rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-xs dark:border-neutral-700"
                            />
                            <button
                              type="submit"
                              className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700"
                            >
                              Set
                            </button>
                          </form>
                          {catBudget && (
                            <ConfirmDelete
                              action={deleteBudget}
                              id={catBudget.id}
                              title={`${category.name} limit`}
                              detail={`${selected?.name} · removes the limit, not the spending`}
                              amount={formatEur(catCents)}
                            />
                          )}
                        </div>
                        {/* Which Home box this category lands in. Purely a
                            display split — savings still counts as spending. */}
                        <form action={toggleCategorySavings} className="mt-1 pl-4">
                          <input type="hidden" name="id" value={category.id} />
                          <input
                            type="hidden"
                            name="is_savings"
                            value={String(category.is_savings)}
                          />
                          <button
                            type="submit"
                            className={`text-xs ${
                              category.is_savings
                                ? 'text-neutral-900 dark:text-white'
                                : 'text-neutral-400'
                            }`}
                          >
                            {category.is_savings ? '☑' : '☐'} counts as savings
                          </button>
                        </form>
                      </div>
                    )
                  })}
                </div>
              </details>
            </section>
          )
        })}
      </div>

      <p className="mt-10 text-xs text-neutral-500">
        Recurring and budgets are independent — a category can have both, and a
        recurring amount counts towards its category&apos;s budget like any other
        spending. Clear a budget with the × beside it; deleting a budget never
        touches the expenses it was measuring.
      </p>
    </>
  )
}
