import {
  applyNetWorthPayments,
  deleteNetWorthItem,
  dismissNetWorthPayments,
  setNetWorthBalance,
  toggleNetWorthItem,
  updateNetWorthItem,
} from '../actions'
import {
  getExpenses,
  getNetWorthItems,
  getWallets,
  type NetWorthItem,
} from '@/lib/queries'
import { formatEur, toCents } from '@/lib/money'
import {
  appliedBalanceCents,
  netCents,
  paidOffCents,
  pendingCents,
  type Payment,
} from '@/lib/net-worth'
import { ProgressMeter, VizStyles } from '@/components/charts'
import { NetWorthForm } from '@/components/net-worth-form'
import { ConfirmDelete } from '@/components/confirm-delete'
import { EditDialog, Field, fieldClass } from '@/components/edit-dialog'
import { todayIso } from '@/lib/period'

/**
 * Net worth — the only tab that holds a BALANCE rather than a flow.
 *
 * Every other screen answers "what moved?". This one answers "where does that
 * leave us?": what is still owed, and what the investments are worth.
 *
 * THE BALANCE IS TYPED. Each entry carries `current_amount`, edited in the box
 * beside it, and net worth is simply those numbers added up. This page derives
 * nothing.
 *
 * Two earlier designs did derive it — from an expense's category (0018), then
 * from payments tagged "Towards what" (0019) — and both were replaced for the
 * same reason: the figure was only true once you had fed the machine, so the
 * page spent its time reporting on its own inputs instead of answering the
 * question. An investment settles it on its own: its value moves with the
 * market, and no sum of contributions can say so.
 *
 * TAGGING IS OPTIONAL, AND IT WAITS. A payment may name an entry, and that makes
 * it PENDING: the row offers "1.300,00 € tagged, not yet applied · Apply", and
 * the balance moves only when the user presses it. Nothing changes on its own —
 * what Apply removes is the arithmetic, not the control. An untagged payment is
 * never reported as a problem; it is just a payment somebody did not tag.
 *
 * THE ONLY TAB THAT IGNORES THE HEADER MONTH, and the only one entitled to. A
 * balance is a position, not a flow: what is owed today is owed today, whichever
 * cycle you happen to be looking at. Pending spans every cycle for the same
 * reason — see the fetch below.
 *
 * SHARED, AND THE SAME ON BOTH PHONES. Entries sit in the joint wallet so both
 * people see them, and the payments read are joint-wallet only. See PROJECT.md.
 */
export default async function NetWorthPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>
}) {
  const params = await searchParams

  const [items, wallets] = await Promise.all([getNetWorthItems(), getWallets()])

  const joint = wallets.find((w) => w.kind === 'joint')
  const active = items.filter((item) => item.active)
  const archived = items.filter((item) => !item.active)

  /**
   * Payments waiting to be applied — across ALL cycles, deliberately.
   *
   * This is the one thing on the tab that ignores the header month. A payment
   * tagged in September and never applied is still waiting in October; scoping
   * it to the cycle on screen would make it vanish when the month turned over.
   */
  const pendingRows =
    joint && active.length > 0
      ? await getExpenses({
          walletId: joint.id,
          netWorthTag: 'pending',
          limit: 500,
        })
      : []

  const payments: Payment[] = pendingRows.map((expense) => ({
    // Cents at the boundary, floats never. PROJECT.md § Money.
    cents: toCents(expense.amount),
    net_worth_item_id: expense.net_worth_item_id,
    applied: expense.balance_applied_at !== null,
  }))

  const today = todayIso()

  function resolve(item: NetWorthItem) {
    const current = toCents(item.current_amount)
    const total = item.total_amount === null ? null : toCents(item.total_amount)
    const pending = pendingCents(item.id, payments)
    return {
      item,
      current,
      total,
      monthly: item.monthly_amount === null ? null : toCents(item.monthly_amount),
      paidOff: paidOffCents(total, current),
      pending,
      afterApply: appliedBalanceCents(item.kind, current, pending),
      net: netCents(item.kind, current),
      // A loan that should be finished and is not.
      overdue:
        item.kind === 'loan' &&
        item.ends_on !== null &&
        item.ends_on < today &&
        current > 0,
      // More has been applied than was owed. Reported rather than clamped —
      // it means a wrong tag or a wrong figure, and a tidy zero would hide it.
      overpaid: item.kind === 'loan' && current < 0,
    }
  }

  const loans = active.filter((i) => i.kind === 'loan').map(resolve)
  const investments = active.filter((i) => i.kind === 'investment').map(resolve)

  const owedCents = loans.reduce((total, row) => total + row.current, 0)
  const worthCents = investments.reduce((total, row) => total + row.current, 0)
  const netWorthCents = worthCents - owedCents

  return (
    <>
      <VizStyles />

      <h1 className="text-xl font-semibold tracking-tight">Net worth</h1>
      <p className="mt-1 text-sm text-neutral-500">
        What is owed, and what it is all worth
      </p>

      {params.added && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Saved.
        </p>
      )}

      {/* The one hero figure on the page. */}
      <div className="mt-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-xs text-neutral-500">Net worth</p>
        <p
          className={`mt-1 text-5xl font-semibold tabular-nums ${
            netWorthCents < 0 ? 'text-red-600' : ''
          }`}
        >
          {formatEur(netWorthCents)}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <div>
            <dt className="text-xs text-neutral-500">Investments worth</dt>
            <dd className="mt-0.5 tabular-nums text-lg font-medium">
              {formatEur(worthCents)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Still owed</dt>
            <dd className="mt-0.5 tabular-nums text-lg font-medium">
              {formatEur(owedCents)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-neutral-500">
          These are the figures you set below — update one whenever it changes.
          Shared, so you both see the same numbers.
        </p>
      </div>

      <Section
        title="Loans"
        singular="Loan"
        blurb="edit a figure whenever you pay some off."
        rows={loans}
        kind="loan"
      />

      <Section
        title="Investments"
        singular="Investment"
        blurb="what each is worth today, not what you put in — so a fund that has grown says so."
        rows={investments}
        kind="investment"
      />

      {archived.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm text-neutral-500">
            Archived ({archived.length})
          </summary>
          <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
            {archived.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {item.kind === 'loan' ? 'Loan' : 'Investment'} ·{' '}
                    {formatEur(toCents(item.current_amount))}
                  </p>
                </div>
                <form action={toggleNetWorthItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="active" value="false" />
                  <button
                    type="submit"
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700"
                  >
                    Resume
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            Archived entries keep their figure but are left out of net worth.
          </p>
        </details>
      )}
    </>
  )
}

type Row = {
  item: NetWorthItem
  current: number
  total: number | null
  monthly: number | null
  paidOff: number | null
  pending: number
  afterApply: number
  net: number
  overdue: boolean
  overpaid: boolean
}

/**
 * One section — Loans or Investments. The two differ in wording and in which
 * direction the money counts, not in shape, so they share this.
 */
function Section({
  title,
  singular,
  blurb,
  rows,
  kind,
}: {
  title: string
  singular: string
  blurb: string
  rows: Row[]
  kind: 'loan' | 'investment'
}) {
  const isLoan = kind === 'loan'

  // Summed from the rows below rather than passed in, so the heading can never
  // disagree with what is under it. Same figure as the card at the top, which
  // scrolls away — this is the one you can see while reading the entries.
  const sectionTotal = rows.reduce((total, row) => total + row.current, 0)
  const sectionPending = rows.reduce((total, row) => total + row.pending, 0)

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {rows.length > 0 && (
          <span className="shrink-0 tabular-nums text-sm font-semibold">
            {formatEur(sectionTotal)}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {isLoan ? 'Total still owed' : 'Total worth'} · {blurb}
      </p>
      {sectionPending > 0 && (
        <p className="mt-1 text-xs text-neutral-500">
          {formatEur(sectionPending)} tagged below and not yet applied, so it is
          not in that figure yet — apply it, or say don&rsquo;t apply if the
          figure already covers it.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          {isLoan ? 'No loans.' : 'No investments.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-6">
          {rows.map((row) => (
            <li key={row.item.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">
                  {row.item.name}
                </span>
                <span className="shrink-0 tabular-nums text-sm font-medium">
                  {formatEur(row.current)}
                </span>
              </div>

              {/* The balance, editable in place — the point of the whole tab.
                  A plain form post, so it works with no client JS. */}
              <form
                action={setNetWorthBalance}
                className="mt-2 flex items-center gap-2"
              >
                <input type="hidden" name="id" value={row.item.id} />
                <label
                  className="shrink-0 text-xs text-neutral-500"
                  htmlFor={`balance-${row.item.id}`}
                >
                  {isLoan ? 'Still owed' : 'Worth now'}
                </label>
                <input
                  /**
                   * Keyed on the VALUE, not just the id.
                   *
                   * defaultValue seeds an uncontrolled input once. After Apply
                   * writes a new balance, React reuses the same DOM node and the
                   * box keeps the old figure — so it disagreed with the heading
                   * beside it, and pressing Save would have silently undone the
                   * Apply. Changing the key remounts the input with the new
                   * value.
                   */
                  key={`${row.item.id}-${row.item.current_amount}`}
                  id={`balance-${row.item.id}`}
                  name="current_amount"
                  inputMode="decimal"
                  type="text"
                  defaultValue={Number(row.item.current_amount).toFixed(2)}
                  className="w-32 rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm tabular-nums dark:border-neutral-700"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
                >
                  Save
                </button>
              </form>

              {/* Progress only where a full amount or target was given. */}
              {row.total !== null && (
                <div className="mt-2">
                  <ProgressMeter
                    label={isLoan ? 'Paid off' : 'Towards target'}
                    paidCents={isLoan ? (row.paidOff ?? 0) : row.current}
                    totalCents={row.total}
                    tone={row.overdue ? 'alert' : isLoan ? 'liability' : 'asset'}
                    valueText={
                      isLoan
                        ? `${formatEur(row.paidOff ?? 0)} of ${formatEur(row.total)} paid`
                        : `${formatEur(row.current)} of ${formatEur(row.total)}`
                    }
                  />
                </div>
              )}

              <p className="mt-1.5 text-xs text-neutral-500">
                {[
                  row.monthly !== null && `${formatEur(row.monthly)}/mo`,
                  row.item.ends_on && `ends ${formatDate(row.item.ends_on)}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No monthly payment set'}
              </p>

              {/*
                Payments tagged to this entry, waiting. One press folds them into
                the figure above — which is the same figure you can type, so
                Apply never takes the number away from you, it only saves you the
                arithmetic. Absent when nothing is waiting, rather than showing a
                nagging "0,00 € pending".
              */}
              {row.pending > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-neutral-500">
                    {formatEur(row.pending)} tagged, not yet applied
                  </span>
                  <form action={applyNetWorthPayments}>
                    <input type="hidden" name="id" value={row.item.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium dark:border-neutral-700"
                    >
                      Apply → {formatEur(row.afterApply)}
                    </button>
                  </form>
                  {/* The common case, so it is offered rather than left to be
                      worked around: the figure above may already account for
                      this. Quieter than Apply — it is the "nothing happens"
                      choice, and it must not compete with the one that does. */}
                  <form action={dismissNetWorthPayments}>
                    <input type="hidden" name="id" value={row.item.id} />
                    <button
                      type="submit"
                      title="Leave the figure as it is and stop offering these payments"
                      className="rounded-lg px-2 py-1 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-white"
                    >
                      Don&rsquo;t apply
                    </button>
                  </form>
                </div>
              )}

              {row.overdue && (
                <p className="mt-1 text-xs text-amber-600">
                  Past its end date with {formatEur(row.current)} still showing —
                  set it to 0,00 € if it is paid off.
                </p>
              )}

              {row.overpaid && (
                <p className="mt-1 text-xs text-amber-600">
                  More has been applied than was owed. Set it to 0,00 € if the
                  loan is clear, or correct a payment tagged to it by mistake.
                </p>
              )}

              <div className="mt-2 flex items-center gap-3">
                <EditDialog
                  action={updateNetWorthItem}
                  id={row.item.id}
                  title={`Edit ${row.item.name}`}
                >
                  {/* kind never changes here — a loan does not become an
                      investment — but the action validates it, so it rides
                      along. */}
                  <input type="hidden" name="kind" value={row.item.kind} />
                  <Field label="Name">
                    <input
                      name="name"
                      type="text"
                      required
                      defaultValue={row.item.name}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label={isLoan ? 'Still owed' : 'Worth now'}>
                    <input
                      name="current_amount"
                      inputMode="decimal"
                      type="text"
                      required
                      defaultValue={Number(row.item.current_amount).toFixed(2)}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label={isLoan ? 'Full amount of the loan' : 'Target'}>
                    <input
                      name="total_amount"
                      inputMode="decimal"
                      type="text"
                      defaultValue={
                        row.item.total_amount === null
                          ? ''
                          : Number(row.item.total_amount).toFixed(2)
                      }
                      className={fieldClass}
                    />
                    <span className="mt-1 block text-xs text-neutral-500">
                      Optional — it only draws the progress bar.
                    </span>
                  </Field>
                  <Field label="Monthly payment">
                    <input
                      name="monthly_amount"
                      inputMode="decimal"
                      type="text"
                      defaultValue={
                        row.item.monthly_amount === null
                          ? ''
                          : Number(row.item.monthly_amount).toFixed(2)
                      }
                      className={fieldClass}
                    />
                  </Field>
                  <Field label={isLoan ? 'End of loan' : 'Ends'}>
                    <input
                      name="ends_on"
                      type="date"
                      defaultValue={row.item.ends_on ?? ''}
                      className={fieldClass}
                    />
                  </Field>
                </EditDialog>

                <form action={toggleNetWorthItem}>
                  <input type="hidden" name="id" value={row.item.id} />
                  <input type="hidden" name="active" value="true" />
                  <button
                    type="submit"
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700"
                  >
                    Archive
                  </button>
                </form>

                <ConfirmDelete
                  action={deleteNetWorthItem}
                  id={row.item.id}
                  title={row.item.name}
                  detail="No expense is touched — only this entry"
                  amount={formatEur(row.current)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-neutral-500">
          {isLoan ? 'Add a loan' : 'Add an investment'}
        </summary>
        <div className="mt-3">
          <NetWorthForm kind={kind} />
        </div>
      </details>

      {rows.length > 1 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-500">
            As a table
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="py-1 pr-3 font-normal">{singular}</th>
                  <th className="py-1 pr-3 text-right font-normal">
                    {isLoan ? 'Still owed' : 'Worth now'}
                  </th>
                  <th className="py-1 pr-3 text-right font-normal">
                    {isLoan ? 'Full amount' : 'Target'}
                  </th>
                  <th className="py-1 text-right font-normal">Monthly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {rows.map((row) => (
                  <tr key={row.item.id}>
                    <td className="py-1.5 pr-3">{row.item.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {formatEur(row.current)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {row.total === null ? '—' : formatEur(row.total)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {row.monthly === null ? '—' : formatEur(row.monthly)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-neutral-300 dark:border-neutral-700">
                  <td className="py-1.5 pr-3 font-medium">
                    {rows.length} {rows.length === 1 ? singular.toLowerCase() : title.toLowerCase()}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-medium tabular-nums">
                    {formatEur(sectionTotal)}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
