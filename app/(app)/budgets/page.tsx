import {
  deleteBudget,
  deleteRecurringRule,
  setBudget,
  setPeriodStart,
  toggleCategorySavings,
  toggleRecurringRule,
  updateRecurringRule,
} from '../actions'
import {
  getBudgets,
  getCategories,
  getCurrentPeriod,
  getExpenses,
  getPeriodForMonthKey,
  getRecurringRules,
  getWallets,
} from '@/lib/queries'
import { formatEur, sumCents, toCents } from '@/lib/money'
import { BudgetBar } from '@/components/budget-bar'
import { RecurringForm } from '@/components/recurring-form'
import { ConfirmDelete } from '@/components/confirm-delete'
import { EditDialog, Field, fieldClass } from '@/components/edit-dialog'
import {
  MAX_CYCLE_DAYS,
  monthLabel,
  nextOccurrence,
  shiftMonthKey,
  todayIso,
} from '@/lib/period'

/**
 * Plan — the two ways money is committed ahead of time.
 *
 *   RECURRING  it goes out every month regardless. Entered once, filled in
 *              automatically.
 *   BUDGET     a target you might miss — groceries, petrol, eating out.
 *
 * Both attach to a CATEGORY, and only to a category: 0014 flattened the
 * taxonomy so there is no second level to ask about. Any category may carry
 * either, both, or neither. The two remain independent — a recurring amount
 * counts towards its category's budget like any other spending.
 *
 * The period is the pay cycle, not the calendar month — the household is paid
 * around the 26th, so a calendar reset landed five days after payday. Since
 * 0015 you can step to any month and set its budgets before it arrives; the
 * cycle named for a month is the one that ENDS in it.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string; month?: string }>
}) {
  const params = await searchParams
  const live = await getCurrentPeriod()

  // ?month= wins, so September is reachable in August. Anything unparseable
  // falls back to the live cycle rather than erroring.
  const month = /^\d{4}-\d{2}-01$/.test(params.month ?? '')
    ? params.month!
    : live.month
  const period = month === live.month ? live : await getPeriodForMonthKey(month)
  const { from, to } = period
  const isLive = month === live.month

  // A month starts with NO budgets and full recurring — 0017. Recurring
  // carries itself; a budget is a decision about one month, and pre-filling it
  // from last month asserts a decision nobody made.
  const [wallets, categories, budgets, expenses, rules] = await Promise.all([
    getWallets(),
    getCategories(),
    getBudgets(month),
    getExpenses({ from, to, limit: 1000 }),
    getRecurringRules(),
  ])

  const previousMonth = shiftMonthKey(month, -1)
  const nextMonth = shiftMonthKey(month, 1)
  const walletParam = params.wallet ? `&wallet=${params.wallet}` : ''
  // The latest a cycle named for this month may start without ending after the
  // month is over. Mirrors the CHECK constraint in 0015.
  const latestStart = month
  const earliestStart = shiftMonthKey(month, -1)

  // Default to Joint: it holds the shared costs and is the only wallet that
  // offers recurring rules.
  const selected =
    wallets.find((w) => w.id === params.wallet) ??
    wallets.find((w) => w.kind === 'joint') ??
    wallets[0]

  const walletExpenses = expenses.filter((e) => e.wallets.id === selected?.id)
  const walletRules = rules.filter((r) => r.wallet_id === selected?.id)
  const showRecurring = selected?.kind === 'joint'
  // A personal wallet gets ONE number for the whole wallet. Per-category
  // budgets are for the joint wallet, where shared costs genuinely need
  // breaking down.
  const isPersonal = selected?.kind === 'personal'
  const walletBudget = budgets.find(
    (b) => b.wallet_id === selected?.id && b.scope === 'wallet',
  )
  const walletBudgetCents = walletBudget ? toCents(walletBudget.amount) : 0
  const walletSpentCents = sumCents(walletExpenses)
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

      {/* Month stepper. Budgets belong to a month, so which month you are
          editing has to be the most obvious thing on the page. */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <a
          href={`/budgets?month=${previousMonth}${walletParam}`}
          aria-label={`Go to ${monthLabel(previousMonth)}`}
          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700"
        >
          ←
        </a>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium">{period.label}</p>
          <p className="truncate text-xs text-neutral-500">
            {period.from} – {period.to} · {period.daysTotal} days
          </p>
        </div>
        <a
          href={`/budgets?month=${nextMonth}${walletParam}`}
          aria-label={`Go to ${monthLabel(nextMonth)}`}
          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700"
        >
          →
        </a>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        {isLive ? (
          <>
            Live cycle · {period.daysLeft} days left, nothing carries over
            {period.snapped && ' · start moved to your actual payday'}
            {period.overridden && ' · start set by hand'}
          </>
        ) : (
          <>
            {period.from > today ? 'Not started yet' : 'Past cycle'} · set its
            budgets here and they apply when it comes round.{' '}
            <a href={`/budgets${params.wallet ? `?wallet=${params.wallet}` : ''}`} className="underline">
              Back to {live.label}
            </a>
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {wallets.map((wallet) => (
          <a
            key={wallet.id}
            href={`/budgets?wallet=${wallet.id}&month=${month}`}
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

      {/* Only the START is editable. The end is always the day before the next
          cycle begins, so a gap or an overlap cannot be expressed. */}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-neutral-500">
          Adjust when {period.label} starts
        </summary>
        <form action={setPeriodStart} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="period_month" value={month} />
          <input
            name="starts_on"
            type="date"
            defaultValue={period.overridden ? period.from : ''}
            min={earliestStart}
            max={latestStart}
            className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            {period.overridden ? 'Update' : 'Set'}
          </button>
          {period.overridden && (
            <button
              type="submit"
              name="starts_on"
              value=""
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700"
            >
              Use the 26th again
            </button>
          )}
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          Ends {period.to}, the day before {monthLabel(nextMonth)} starts.{' '}
          {period.label} must start between {earliestStart} and {latestStart} so
          it ends within the month, and no cycle may run past {MAX_CYCLE_DAYS}{' '}
          days.
        </p>
      </details>

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
                      day {rule.day_of_month}
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
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.icon ? `${category.icon} ` : ''}
                            {category.name}
                          </option>
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
              <RecurringForm categories={categories} walletId={selected!.id} />
            </div>
          </details>
        </section>
      )}

      {/* ------------------------------- BUDGETS ------------------------- */}
      {isPersonal ? (
        <>
          <h2 className="mt-8 text-sm font-medium">Budget</h2>
          <p className="mt-1 text-xs text-neutral-500">
            One number for the whole wallet — your spending money this cycle. No
            categories to keep up to date.
          </p>

          <div className="mt-4">
            {walletBudgetCents > 0 ? (
              <BudgetBar
                label={`${selected?.name}'s budget`}
                spentCents={walletSpentCents}
                budgetCents={walletBudgetCents}
              />
            ) : (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{selected?.name}</span>
                <span className="tabular-nums text-xs text-neutral-500">
                  {formatEur(walletSpentCents)} spent · no budget
                </span>
              </div>
            )}

            <div className="mt-2 flex items-center gap-2">
              <form action={setBudget} className="flex min-w-0 flex-1 gap-2">
                <input type="hidden" name="wallet_id" value={selected?.id ?? ''} />
                <input type="hidden" name="period_month" value={month} />
                <input
                  name="amount"
                  inputMode="decimal"
                  type="text"
                  placeholder="Set a monthly budget…"
                  defaultValue={
                    walletBudget ? Number(walletBudget.amount).toFixed(2) : ''
                  }
                  className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
                >
                  Save
                </button>
              </form>
              {walletBudget && (
                <ConfirmDelete
                  action={deleteBudget}
                  id={walletBudget.id}
                  title={`${selected?.name}'s budget`}
                  detail="removes the budget, not the spending"
                  amount={formatEur(walletBudgetCents)}
                />
              )}
            </div>

            <p className="mt-3 text-xs text-neutral-500">
              The other person sees this total and how far through it you are —
              never what you spent it on.
            </p>
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-8 text-sm font-medium">Budgets</h2>
          <p className="mt-1 text-xs text-neutral-500">
            What you&apos;d ideally spend, knowing you might not — groceries,
            petrol, eating out, films. One number per category, and only the
            categories you actually want to watch. Leave the rest blank.
          </p>
          {/* Each month is set deliberately — nothing is copied from last
              month, so an empty list means "not decided yet", never "zero". */}
          <p className="mt-1 text-xs text-neutral-500">
            Set for {period.label} only. Recurring above already repeats every
            month on its own; budgets don&apos;t, so each month starts blank.
          </p>

          <div className="mt-4 space-y-5">
            {categories.map((category) => {
              const catSpend = sumCents(
                walletExpenses.filter((e) => e.categories.id === category.id),
              )
              const catBudget = budgets.find(
                (b) => b.wallet_id === selected?.id && b.category_id === category.id,
              )
              const catCents = catBudget ? toCents(catBudget.amount) : 0
              // Rules on this category are why money lands here whether or not
              // a budget exists — worth saying, since it explains a bar that
              // fills itself in. SUMMED, not the first match: Insurance and
              // Internet & mobile each carry three separate rules.
              const catRules = activeRules.filter(
                (r) => r.categories.id === category.id,
              )
              const catRecurringCents = sumCents(catRules)

              return (
                <section key={category.id}>
                  {catCents > 0 ? (
                    <BudgetBar
                      label={`${category.icon ?? ''} ${category.name}`.trim()}
                      spentCents={catSpend}
                      budgetCents={catCents}
                    />
                  ) : (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">
                        {category.icon} {category.name}
                      </span>
                      <span className="tabular-nums text-xs text-neutral-500">
                        {formatEur(catSpend)} spent · no budget
                      </span>
                    </div>
                  )}

                  {catRules.length > 0 && (
                    <p className="mt-1 text-xs text-neutral-500">
                      ↻ {formatEur(catRecurringCents)} of this is recurring
                      {catRules.length > 1 && ` · ${catRules.length} rules`}
                    </p>
                  )}

                  {/* ConfirmDelete renders its own <form>, so it must be a
                      SIBLING of this one. Nested forms are invalid HTML: the
                      parser closes the outer form at the inner one, orphaning
                      this Save button so it silently stops submitting. */}
                  <div className="mt-2 flex items-center gap-2">
                    <form action={setBudget} className="flex min-w-0 flex-1 gap-2">
                      <input type="hidden" name="wallet_id" value={selected?.id ?? ''} />
                <input type="hidden" name="period_month" value={month} />
                      <input type="hidden" name="category_id" value={category.id} />
                      <input
                        name="amount"
                        inputMode="decimal"
                        type="text"
                        placeholder="Set a monthly budget…"
                        defaultValue={
                          catBudget ? Number(catBudget.amount).toFixed(2) : ''
                        }
                        className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
                      >
                        Save
                      </button>
                    </form>
                    {catBudget && (
                      <ConfirmDelete
                        action={deleteBudget}
                        id={catBudget.id}
                        title={`${category.name} budget`}
                        detail={`${selected?.name} · removes the budget, not the spending`}
                        amount={formatEur(catCents)}
                      />
                    )}
                  </div>

                  {/* Which Home box this category lands in. Purely a display
                      split — savings still counts as spending. */}
                  <form action={toggleCategorySavings} className="mt-1">
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
                </section>
              )
            })}
          </div>

        </>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        Recurring and budgets are independent — a category can have both, and a
        recurring amount counts towards its category&apos;s budget like any other
        spending. Clear a budget with the × beside it; deleting a budget never
        touches the expenses it was measuring.
      </p>
    </>
  )
}
