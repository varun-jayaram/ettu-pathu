'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
    })
    .eq('id', id)

  revalidatePath('/')
  revalidatePath('/expenses')
  revalidatePath('/reports')
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
  const note = String(formData.get('note') ?? '').trim()

  if (!id || amount === null || !categoryId) return
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return

  const supabase = await createClient()
  await supabase
    .from('recurring_rules')
    .update({
      amount: amount.toFixed(2),
      category_id: categoryId,
      day_of_month: dayOfMonth,
      note: note || null,
    })
    .eq('id', id)

  revalidatePath('/')
  revalidatePath('/budgets')
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
 * Sets or clears a budget. An empty amount removes it, which is how you turn a
 * budget off — there is no separate delete button to hunt for.
 *
 * Upserts by hand rather than using .upsert(): the uniqueness is enforced by
 * PARTIAL unique indexes (…where group_id is not null), which PostgREST's
 * on_conflict cannot target.
 */
export async function setBudget(formData: FormData): Promise<void> {
  const walletId = String(formData.get('wallet_id') ?? '')
  const groupId = String(formData.get('group_id') ?? '')
  const categoryId = String(formData.get('category_id') ?? '')
  const raw = String(formData.get('amount') ?? '').replace(',', '.').trim()

  if (!walletId || (!groupId && !categoryId)) return

  const scope = groupId ? 'group' : 'category'
  const column = groupId ? 'group_id' : 'category_id'
  const targetId = groupId || categoryId

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('budgets')
    .select('id')
    .eq('wallet_id', walletId)
    .eq(column, targetId)
    .maybeSingle()

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
      group_id: groupId || null,
      category_id: categoryId || null,
      amount: amount.toFixed(2),
    })
  }

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

/** The pay-cycle anchor day, 1–31. Clamped per month (31 -> 28 in February). */
export async function setAnchorDay(formData: FormData): Promise<void> {
  const day = Number(String(formData.get('anchor_day') ?? ''))
  if (!Number.isInteger(day) || day < 1 || day > 31) return

  const supabase = await createClient()
  await supabase
    .from('app_settings')
    .update({ value: String(day), updated_at: new Date().toISOString() })
    .eq('key', 'pay_anchor_day')

  revalidatePath('/')
  revalidatePath('/income')
  revalidatePath('/budgets')
}

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

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
