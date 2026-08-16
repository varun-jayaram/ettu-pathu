import { createClient } from '@/lib/supabase/server'

/**
 * Shared reads. Every one of these relies on RLS to scope rows to the current
 * user — there is deliberately no `.eq('user_id', …)` filtering here, because
 * privacy is enforced in Postgres, not in application code. See PROJECT.md.
 */

export type Wallet = {
  id: string
  name: string
  kind: 'personal' | 'joint'
}

export type CategoryGroup = {
  id: string
  name: string
  kind: 'committed' | 'variable' | 'transfer'
  sort_order: number
  categories: { id: string; name: string; icon: string | null; sort_order: number }[]
}

export type ExpenseRow = {
  id: string
  amount: string
  spent_on: string
  note: string | null
  recurring_rule_id: string | null
  wallets: { id: string; name: string; kind: string }
  categories: {
    id: string
    name: string
    icon: string | null
    category_groups: { id: string; name: string; kind: string }
  }
}

/** Only the wallets this user belongs to — two of the three, always. */
export async function getWallets(): Promise<Wallet[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('wallets')
    .select('id, name, kind')
    .order('kind', { ascending: false }) // personal first, joint last
    .order('name')
  return data ?? []
}

/** The shared taxonomy, active entries only, ready to render as optgroups. */
export async function getCategoryGroups(): Promise<CategoryGroup[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('category_groups')
    .select('id, name, kind, sort_order, categories(id, name, icon, sort_order, active)')
    .eq('active', true)
    .order('sort_order')

  return (data ?? []).map((group) => ({
    ...group,
    categories: (group.categories ?? [])
      .filter((c: { active: boolean }) => c.active)
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
  })) as CategoryGroup[]
}

const EXPENSE_SELECT = `
  id, amount, spent_on, note, recurring_rule_id,
  wallets!inner(id, name, kind),
  categories!inner(id, name, icon, category_groups!inner(id, name, kind))
`

export async function getExpenses(options: {
  walletId?: string
  from?: string
  to?: string
  search?: string
  limit?: number
} = {}): Promise<ExpenseRow[]> {
  const supabase = await createClient()

  let query = supabase
    .from('expenses')
    .select(EXPENSE_SELECT)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 100)

  if (options.walletId) query = query.eq('wallet_id', options.walletId)
  if (options.from) query = query.gte('spent_on', options.from)
  if (options.to) query = query.lte('spent_on', options.to)
  if (options.search) query = query.ilike('note', `%${options.search}%`)

  const { data } = await query
  return (data ?? []) as unknown as ExpenseRow[]
}

export type Budget = {
  id: string
  wallet_id: string
  scope: 'group' | 'category'
  group_id: string | null
  category_id: string | null
  amount: string
}

/** Every budget in the user's wallets. RLS keeps the other person's out. */
export async function getBudgets(): Promise<Budget[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('budgets')
    .select('id, wallet_id, scope, group_id, category_id, amount')
  return (data ?? []) as Budget[]
}

/**
 * Budget alert states. A group budget defines what "over" means; a category
 * sub-limit only warns. See PROJECT.md § Budgets — sub-limits are deliberately
 * not required to sum to the group budget.
 */
export type BudgetState = 'normal' | 'approaching' | 'over'

export function budgetState(spentCents: number, budgetCents: number): BudgetState {
  if (budgetCents <= 0) return 'normal'
  const ratio = spentCents / budgetCents
  if (ratio > 1) return 'over'
  if (ratio >= 0.8) return 'approaching'
  return 'normal'
}

/** First and last day of the current month, as YYYY-MM-DD. */
export function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`
  return { from: iso(first), to: iso(last) }
}

/**
 * Materialises any due recurring expenses. Idempotent, guarded by
 * last_generated_on and a partial unique index, so calling it on every page
 * load is safe and cheap.
 */
export async function materializeRecurring(): Promise<void> {
  const supabase = await createClient()
  await supabase.rpc('materialize_recurring')
}
