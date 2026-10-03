'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPeriodForMonthKey } from '@/lib/queries'
import { shiftMonthKey, startDateProblem } from '@/lib/period'

/**
 * Writes. Each of these relies on RLS to reject anything the user should not
 * be able to touch — a hostile wallet_id in the form payload is refused by
 * Postgres, not by a check here. The validation below is for helpful error
 * messages, not for security.
 */

export type FormState = { error?: string } | null

export async function addExpense(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const walletId = String(formData.get('wallet_id') ?? '')
  const categoryId = String(formData.get('category_id') ?? '')
  const rawAmount = String(formData.get('amount') ?? '').replace(',', '.')
  const spentOn = String(formData.get('spent_on') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  // "Towards what" — which loan or investment this payment moves, if any.
  // Optional: most spending moves no balance at all.
  const netWorthItemId = String(formData.get('net_worth_item_id') ?? '')

  if (!walletId || !categoryId) return { error: 'Pick a wallet and a category.' }

  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Enter an amount greater than zero.' }
  }
  // numeric(12,2) would round silently; be explicit instead.
  if (Math.round(amount * 100) !== Number((amount * 100).toFixed(4))) {
    return { error: 'Amounts can have at most two decimal places.' }
  }
  if (!spentOn) return { error: 'Pick a date.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('expenses').insert({
    wallet_id: walletId,
    category_id: categoryId,
    amount: amount.toFixed(2),
    spent_on: spentOn,
    note: note || null,
    net_worth_item_id: netWorthItemId || null,
    created_by: user?.id ?? null,
  })

  if (error) {
    // 42501 is RLS refusing a wallet the user does not belong to.
    return {
      error:
        error.code === '42501'
          ? 'That wallet is not yours.'
          : `Could not save: ${error.message}`,
    }
  }

  revalidatePath('/')
  revalidatePath('/expenses')
  redirect('/expenses?added=1')
}

/** Shared amount parsing: accepts a German comma, rejects anything else. */
function parseAmount(raw: FormDataEntryValue | null): number | null {
  const amount = Number(String(raw ?? '').replace(',', '.').trim())
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export async function updateExpense(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const amount = parseAmount(formData.get('amount'))
  const categoryId = String(formData.get('category_id') ?? '')
  const walletId = String(formData.get('wallet_id') ?? '')
  const spentOn = String(formData.get('spent_on') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  const netWorthItemId = String(formData.get('net_worth_item_id') ?? '')

  if (!id || amount === null || !categoryId || !walletId || !spentOn) return

  const supabase = await createClient()
  // RLS checks both the row being edited AND the wallet it is moved into, via
  // USING and WITH CHECK — so an expense cannot be pushed into a wallet the
  // user does not belong to.
  await supabase
    .from('expenses')
    .update({
      amount: amount.toFixed(2),
      category_id: categoryId,
      wallet_id: walletId,
      spent_on: spentOn,
      note: note || null,
      net_worth_item_id: netWorthItemId || null,
    })
    .eq('id', id)

  revalidatePath('/')
  revalidatePath('/expenses')
  revalidatePath('/reports')
  revalidatePath('/net-worth')
}

export async function updateIncome(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const amount = parseAmount(formData.get('amount'))
  const receivedOn = String(formData.get('received_on') ?? '')
  const source = String(formData.get('source') ?? 'salary')
  const note = String(formData.get('note') ?? '').trim()

  if (!id || amount === null || !receivedOn) return

  const supabase = await createClient()
  await supabase
    .from('income')
    .update({
      amount: amount.toFixed(2),
      received_on: receivedOn,
      source,
      note: note || null,
    })
    .eq('id', id)

  revalidatePath('/')
  revalidatePath('/income')
  revalidatePath('/reports')
}

/**
 * Edits a recurring rule.
 *
 * Only future occurrences change. Expenses already generated are ordinary rows
 * and keep whatever they were — editing rent from 890 to 950 does not rewrite
 * history, which is correct: you did pay 890 last month.
 */
export async function updateRecurringRule(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const amount = parseAmount(formData.get('amount'))
  const categoryId = String(formData.get('category_id') ?? '')
  const dayOfMonth = Number(String(formData.get('day_of_month') ?? ''))
  const startDate = String(formData.get('start_date') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  const netWorthItemId = String(formData.get('net_worth_item_id') ?? '')

  if (!id || amount === null || !categoryId || !startDate) return
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return

  const supabase = await createClient()

  /**
   * last_generated_on is reset so a corrected start date can actually backfill.
   *
   * The watermark exists to stop re-generating the same occurrence twice. But
   * it also blocks anything EARLIER than itself — so moving a start date back
   * (the common fix for "I set the wrong start and it skipped a month") would
   * silently do nothing. Clearing it lets materialize_recurring reconsider the
   * whole range.
   *
   * Safe because duplicates are impossible regardless: the partial unique index
   * on (recurring_rule_id, spent_on) rejects any occurrence that already
   * exists. Existing rows also keep their old amount, which is correct —
   * editing rent to 950 does not rewrite the 890 you actually paid.
   */
  await supabase
    .from('recurring_rules')
    .update({
      amount: amount.toFixed(2),
      category_id: categoryId,
      day_of_month: dayOfMonth,
      start_date: startDate,
      note: note || null,
      net_worth_item_id: netWorthItemId || null,
      last_generated_on: null,
    })
    .eq('id', id)

  /**
   * Retagging a rule retags the expenses it already made.
   *
   * materialize_recurring() stamps the tag only at creation, so without this
   * the fix would apply to next month and leave every past payment untagged —
   * the balance would be wrong in exactly the way the user had just corrected.
   * Only rows this rule generated are touched; a hand-logged payment keeps
   * whatever it was given.
   */
  await supabase
    .from('expenses')
    .update({ net_worth_item_id: netWorthItemId || null })
    .eq('recurring_rule_id', id)

  await supabase.rpc('materialize_recurring')

  revalidatePath('/')
  revalidatePath('/budgets')
  revalidatePath('/expenses')
  revalidatePath('/net-worth')
}

/**
 * Deletes a recurring rule outright.
 *
 * Distinct from Stop, which archives it. The expenses it already generated are
 * NOT removed — expenses.recurring_rule_id is ON DELETE SET NULL, so they
 * survive as ordinary rows and history stays intact.
 */
export async function deleteRecurringRule(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('recurring_rules').delete().eq('id', id)

  revalidatePath('/')
  revalidatePath('/budgets')
}

export async function deleteBudget(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('budgets').delete().eq('id', id)

  revalidatePath('/')
  revalidatePath('/budgets')
}

export async function deleteExpense(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('expenses').delete().eq('id', id)

  revalidatePath('/')
  revalidatePath('/expenses')
}

/**
 * The month every tab is looking at.
 *
 * Held in a cookie rather than a URL parameter, because it is a MODE, not a
 * page: switching from Home to Log must not drop it, and threading ?month=
 * through every internal link would break the moment one link forgot. An empty
 * value clears it and returns the whole app to the live cycle.
 */
export async function setMonth(formData: FormData): Promise<void> {
  const month = String(formData.get('month') ?? '')
  const store = await cookies()

  if (/^\d{4}-\d{2}-01$/.test(month)) {
    store.set('month', month, {
      httpOnly: true,
      sameSite: 'lax',
      // A viewing preference, not a credential. Expires so a month picked and
      // forgotten cannot silently frame the app weeks later.
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
  } else {
    store.delete('month')
  }

  // 'layout' — every tab reads this, so revalidating one page would leave the
  // others showing the previous month.
  revalidatePath('/', 'layout')
}

/**
 * Sets or clears a budget. An empty amount removes it, which is how you turn a
 * budget off — there is no separate delete button to hunt for.
 *
 * Upserts by hand rather than using .upsert(): the uniqueness is enforced by
 * PARTIAL unique indexes (…where category_id is not null), which PostgREST's
 * on_conflict cannot target.
 */
export async function setBudget(formData: FormData): Promise<void> {
  const walletId = String(formData.get('wallet_id') ?? '')
  const categoryId = String(formData.get('category_id') ?? '')
  const month = String(formData.get('period_month') ?? '')
  const raw = String(formData.get('amount') ?? '').replace(',', '.').trim()

  if (!walletId || !month) return

  // No category means the whole wallet — how a personal budget is expressed:
  // one number, no breakdown.
  const scope = categoryId ? 'category' : 'wallet'

  const supabase = await createClient()

  let lookup = supabase
    .from('budgets')
    .select('id')
    .eq('wallet_id', walletId)
    .eq('period_month', month)
  lookup =
    scope === 'category'
      ? lookup.eq('category_id', categoryId)
      : lookup.eq('scope', 'wallet')

  const { data: existing } = await lookup.maybeSingle()

  // Blank clears the budget.
  if (raw === '') {
    if (existing) await supabase.from('budgets').delete().eq('id', existing.id)
    revalidatePath('/budgets')
    revalidatePath('/')
    return
  }

  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount <= 0) return

  if (existing) {
    await supabase
      .from('budgets')
      .update({ amount: amount.toFixed(2) })
      .eq('id', existing.id)
  } else {
    await supabase.from('budgets').insert({
      wallet_id: walletId,
      scope,
      category_id: categoryId || null,
      amount: amount.toFixed(2),
      period_month: month,
    })
  }

  revalidatePath('/budgets')
  revalidatePath('/')
}

/**
 * Moves the start of one cycle, or clears the override to fall back to the
 * anchor day.
 *
 * Only the start is settable. The end is always the day before the next cycle
 * begins, so there is no way to express a gap or an overlap — see 0015.
 */
export async function setPeriodStart(formData: FormData): Promise<void> {
  const month = String(formData.get('period_month') ?? '')
  const startsOn = String(formData.get('starts_on') ?? '').trim()
  if (!month) return

  const supabase = await createClient()

  // Blank clears it, which is how you go back to "just use the 26th".
  if (startsOn === '') {
    await supabase.from('period_starts').delete().eq('period_month', month)
    revalidatePath('/budgets')
    revalidatePath('/')
    return
  }

  // Resolved periods, not the raw overrides map: a neighbour that has never
  // been set by hand still HAS a start, from the anchor or a logged payday, and
  // the length rules have to be measured against that.
  const [current, previous] = await Promise.all([
    getPeriodForMonthKey(month),
    getPeriodForMonthKey(shiftMonthKey(month, -1)),
  ])

  const problem = startDateProblem(month, startsOn, {
    // The end does not move when the start does — it is the day before the next
    // cycle begins — so it is the fixed point the 35-day rule measures from.
    endsOn: current.to,
    previousStart: previous.from,
  })
  // The CHECK constraint in 0015 is the real guarantee; this just avoids a raw
  // Postgres error reaching the user.
  if (problem) return

  await supabase
    .from('period_starts')
    .upsert(
      { period_month: month, starts_on: startsOn },
      { onConflict: 'period_month' },
    )

  revalidatePath('/budgets')
  revalidatePath('/')
}

/**
 * Logs household income. Shared, so either person may record either salary —
 * this is pooled money, unlike spending.
 *
 * A `salary` row also moves the pay-cycle boundary if it lands near the anchor
 * day, which is why the source matters and is not just a label.
 */
export async function addIncome(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawAmount = String(formData.get('amount') ?? '').replace(',', '.')
  const receivedOn = String(formData.get('received_on') ?? '')
  const source = String(formData.get('source') ?? 'salary')
  const note = String(formData.get('note') ?? '').trim()

  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Enter an amount greater than zero.' }
  }
  if (!receivedOn) return { error: 'Pick a date.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Income always lands in the JOINT wallet. It is pooled household money, so
  // asking which wallet was a choice that could only be answered wrongly —
  // and a salary sitting in a personal wallet would misattribute shared money.
  // Resolved server-side so the client cannot put it anywhere else.
  const { data: joint } = await supabase
    .from('wallets')
    .select('id')
    .eq('kind', 'joint')
    .maybeSingle()

  if (!joint) return { error: 'No joint wallet found.' }

  const { error } = await supabase.from('income').insert({
    wallet_id: joint.id,
    amount: amount.toFixed(2),
    received_on: receivedOn,
    source,
    note: note || null,
    created_by: user?.id ?? null,
  })

  if (error) return { error: `Could not save: ${error.message}` }

  revalidatePath('/')
  revalidatePath('/income')
  redirect('/income?added=1')
}

export async function deleteIncome(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('income').delete().eq('id', id)

  revalidatePath('/')
  revalidatePath('/income')
}

// setAnchorDay is gone. The anchor day set every cycle at once and could not
// say "September started late", which is the case that actually comes up. You
// now set the cycle you are looking at, on the Income tab. `pay_anchor_day`
// survives in app_settings as the FALLBACK for any month nobody has set by
// hand — it is no longer something the UI asks about.

/**
 * Creates a recurring rule — rent, insurance, subscriptions, the donation.
 *
 * The rule is not the expense. materialize_recurring() turns it into real
 * `expenses` rows on page load, idempotently, so generated rows stay editable
 * and deletable like any other. day_of_month is CALENDAR-based: rent is due on
 * the 1st whether or not that falls mid pay-cycle.
 */
export async function addRecurringRule(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const walletId = String(formData.get('wallet_id') ?? '')
  const categoryId = String(formData.get('category_id') ?? '')
  const rawAmount = String(formData.get('amount') ?? '').replace(',', '.')
  const dayOfMonth = Number(String(formData.get('day_of_month') ?? ''))
  const startDate = String(formData.get('start_date') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  const netWorthItemId = String(formData.get('net_worth_item_id') ?? '')

  if (!walletId || !categoryId) return { error: 'Pick a wallet and a category.' }

  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Enter an amount greater than zero.' }
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return { error: 'Day of month must be between 1 and 31.' }
  }
  if (!startDate) return { error: 'Pick a start date.' }

  const supabase = await createClient()
  const { error } = await supabase.from('recurring_rules').insert({
    wallet_id: walletId,
    category_id: categoryId,
    amount: amount.toFixed(2),
    day_of_month: dayOfMonth,
    start_date: startDate,
    note: note || null,
    net_worth_item_id: netWorthItemId || null,
  })

  if (error) {
    return {
      error:
        error.code === '42501'
          ? 'That wallet is not yours.'
          : `Could not save: ${error.message}`,
    }
  }

  // Fill in anything already due, so the rule shows its effect immediately
  // rather than on some later page load.
  await supabase.rpc('materialize_recurring')

  revalidatePath('/')
  revalidatePath('/recurring')
  revalidatePath('/expenses')
  revalidatePath('/net-worth')
  redirect('/recurring?added=1')
}

/**
 * Archives or reactivates a rule. Never deletes — the generated expenses stay
 * either way, and history must remain resolvable. See PROJECT.md.
 */
export async function toggleRecurringRule(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  if (!id) return

  const supabase = await createClient()
  await supabase.from('recurring_rules').update({ active: !active }).eq('id', id)

  revalidatePath('/')
  revalidatePath('/recurring')
}

// ---------------------------------------------------------------------------
// Net worth — loans and investments
// ---------------------------------------------------------------------------
// These rows hold a balance; nothing here records a payment. The monthly
// movement is derived from `expenses` by lib/net-worth.ts, because a loan
// payment is already an expense — storing it twice would let the two copies
// drift. See PROJECT.md § Net worth.

type NetWorthValues = {
  kind: string
  name: string
  current_amount: string
  total_amount: string | null
  monthly_amount: string | null
  ends_on: string | null
}

/** The fields shared by add and edit, validated once. */
function readNetWorthFields(
  formData: FormData,
): { error: string } | { values: NetWorthValues } {
  const kind = String(formData.get('kind') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const endsOn = String(formData.get('ends_on') ?? '').trim()

  if (kind !== 'loan' && kind !== 'investment') {
    return { error: 'Pick a loan or an investment.' }
  }
  if (!name) return { error: 'Give it a name — "Car loan", "Index fund".' }

  // The balance. Zero is a real answer — a loan you have just cleared — so this
  // is read directly rather than through parseAmount(), which treats 0 as
  // "nothing entered" because every other amount in this app must be positive.
  const rawCurrent = String(formData.get('current_amount') ?? '')
    .replace(',', '.')
    .trim()
  const current = Number(rawCurrent)
  if (rawCurrent === '' || !Number.isFinite(current) || current < 0) {
    return {
      error:
        kind === 'loan'
          ? 'Enter how much is still owed. Zero is fine if it is paid off.'
          : 'Enter what it is worth now.',
    }
  }

  // Optional for both: it only draws the progress bar.
  const total = parseAmount(formData.get('total_amount'))
  const monthly = parseAmount(formData.get('monthly_amount'))

  return {
    values: {
      kind,
      name,
      current_amount: current.toFixed(2),
      total_amount: total === null ? null : total.toFixed(2),
      monthly_amount: monthly === null ? null : monthly.toFixed(2),
      ends_on: endsOn || null,
    },
  }
}

/**
 * Sets just the balance, from the box beside it on the Net worth tab.
 *
 * Its own action because this is the one thing that gets updated often — a
 * fund's value moves every month — and making the user open a dialog to change
 * one number is exactly the friction they asked to be rid of. Zero is allowed
 * and meaningful: a loan that has been cleared.
 */
export async function setNetWorthBalance(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const raw = String(formData.get('current_amount') ?? '').replace(',', '.').trim()
  const amount = Number(raw)

  if (!id || raw === '' || !Number.isFinite(amount) || amount < 0) return

  const supabase = await createClient()
  await supabase
    .from('net_worth_items')
    .update({ current_amount: amount.toFixed(2) })
    .eq('id', id)

  revalidatePath('/net-worth')
  revalidatePath('/')
}

/**
 * Adds a loan or an investment.
 *
 * Lands in the JOINT wallet, resolved server-side exactly as addIncome does —
 * the user asked for these to be shared, and resolving it here means the client
 * cannot put one anywhere else. The derived balance then reads joint-wallet
 * expenses only, so both phones compute the same number; see the 0018 header.
 */
export async function addNetWorthItem(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = readNetWorthFields(formData)
  if ('error' in parsed) return { error: parsed.error }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: joint } = await supabase
    .from('wallets')
    .select('id')
    .eq('kind', 'joint')
    .maybeSingle()

  if (!joint) return { error: 'No joint wallet found.' }

  const { error } = await supabase.from('net_worth_items').insert({
    wallet_id: joint.id,
    ...parsed.values,
    created_by: user?.id ?? null,
  })

  if (error) {
    return {
      error:
        error.code === '42501'
          ? 'That wallet is not yours.'
          : `Could not save: ${error.message}`,
    }
  }

  revalidatePath('/net-worth')
  revalidatePath('/')
  redirect('/net-worth?added=1')
}

/**
 * Folds every payment tagged to one entry into its balance, and marks those
 * payments applied.
 *
 * On a button, never automatically: the balance is the user's own number, and
 * one that moved by itself whenever something was tagged would be the surprise
 * this whole feature keeps being simplified away from. What Apply removes is
 * the arithmetic, not the control.
 *
 * ORDER MATTERS. The balance is written FIRST, then the payments are stamped.
 * A failure between the two leaves them pending, so Apply is simply offered
 * again — recoverable. Stamping first would lose them silently on the same
 * failure, and nothing would ever say so.
 */
export async function applyNetWorthPayments(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()

  // RLS scopes both reads: an entry in a wallet this user is not a member of
  // comes back empty, and so do its payments.
  const [{ data: item }, { data: pending }] = await Promise.all([
    supabase
      .from('net_worth_items')
      .select('id, kind, current_amount')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('expenses')
      .select('id, amount')
      .eq('net_worth_item_id', id)
      .is('balance_applied_at', null),
  ])

  if (!item || !pending || pending.length === 0) return

  // Integer cents throughout — PROJECT.md § Money. Summing euros as floats here
  // would put a rounding error straight into a stored balance.
  const pendingCentsTotal = pending.reduce(
    (total, row) => total + Math.round(Number(row.amount) * 100),
    0,
  )
  const currentCents = Math.round(Number(item.current_amount) * 100)
  const next =
    item.kind === 'loan'
      ? currentCents - pendingCentsTotal
      : currentCents + pendingCentsTotal

  const { error } = await supabase
    .from('net_worth_items')
    .update({ current_amount: (next / 100).toFixed(2) })
    .eq('id', id)

  if (error) return

  await supabase
    .from('expenses')
    .update({ balance_applied_at: new Date().toISOString() })
    .in(
      'id',
      pending.map((row) => row.id),
    )

  revalidatePath('/net-worth')
  revalidatePath('/')
}

/**
 * Edits one — everything at once, for the occasional correction.
 *
 * The balance alone has its own action above, because that is the field that
 * actually changes month to month.
 */
export async function updateNetWorthItem(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const parsed = readNetWorthFields(formData)
  if (!id || 'error' in parsed) return

  const supabase = await createClient()
  await supabase.from('net_worth_items').update(parsed.values).eq('id', id)

  revalidatePath('/net-worth')
  revalidatePath('/')
}

/**
 * Archives or reactivates one. Never deletes — the same rule as recurring
 * rules, and archiving keeps the item's rule occurrences attributed to it so a
 * neighbour sharing the category does not suddenly absorb them.
 */
export async function toggleNetWorthItem(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  if (!id) return

  const supabase = await createClient()
  await supabase.from('net_worth_items').update({ active: !active }).eq('id', id)

  revalidatePath('/net-worth')
  revalidatePath('/')
}

/**
 * Deletes one outright, for something entered by mistake.
 *
 * No expense is touched: an item has never owned a row, it only reads them, so
 * the log and every total are unaffected.
 */
export async function deleteNetWorthItem(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('net_worth_items').delete().eq('id', id)

  revalidatePath('/net-worth')
  revalidatePath('/')
}

/**
 * Marks a category as savings, or unmarks it.
 *
 * Affects only which box it lands in on Home. It still counts as spending in
 * every total — putting money aside is not the same as still having it
 * available. See PROJECT.md.
 */
export async function toggleCategorySavings(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const isSavings = String(formData.get('is_savings') ?? '') === 'true'
  if (!id) return

  const supabase = await createClient()
  await supabase.from('categories').update({ is_savings: !isSavings }).eq('id', id)

  revalidatePath('/')
  revalidatePath('/budgets')
  revalidatePath('/reports')
}

/**
 * Sign out THIS device only.
 *
 * `scope: 'local'` is load-bearing and must not be dropped. supabase-js
 * defaults to `'global'`, which revokes every refresh token the user holds —
 * so signing out on the laptop silently killed the session on the phone, and
 * on any other browser that had ever signed in. For a two-person household
 * app used from a phone and a laptop at once, that is never what "sign out"
 * means: it means this browser, on this device.
 *
 * Concurrent sessions are otherwise fine — Supabase issues an independent
 * refresh token per sign-in and rotates them separately.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}
