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
  const walletId = String(formData.get('wallet_id') ?? '')
  const rawAmount = String(formData.get('amount') ?? '').replace(',', '.')
  const receivedOn = String(formData.get('received_on') ?? '')
  const source = String(formData.get('source') ?? 'salary')
  const note = String(formData.get('note') ?? '').trim()

  if (!walletId) return { error: 'Pick a wallet.' }

  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Enter an amount greater than zero.' }
  }
  if (!receivedOn) return { error: 'Pick a date.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('income').insert({
    wallet_id: walletId,
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

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
