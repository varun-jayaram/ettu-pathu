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

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
