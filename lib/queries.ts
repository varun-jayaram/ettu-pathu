import { createClient } from '@/lib/supabase/server'
import { addDays, getPeriod, todayIso, type Period } from '@/lib/period'

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
    category_groups: { id: string; name: string }
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
    .select('id, name, sort_order, categories(id, name, icon, sort_order, active)')
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
  categories!inner(id, name, icon, category_groups!inner(id, name))
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

export type RecurringRule = {
  id: string
  wallet_id: string
  amount: string
  note: string | null
  day_of_month: number
  start_date: string
  end_date: string | null
  active: boolean
  last_generated_on: string | null
  wallets: { id: string; name: string }
  categories: {
    id: string
    name: string
    icon: string | null
    category_groups: { id: string; name: string }
  }
}

/** Recurring rules in the user's wallets. RLS scopes them. */
export async function getRecurringRules(): Promise<RecurringRule[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('recurring_rules')
    .select(
      `id, wallet_id, amount, note, day_of_month, start_date, end_date, active,
       last_generated_on,
       wallets!inner(id, name),
       categories!inner(id, name, icon, category_groups!inner(id, name))`,
    )
    .order('active', { ascending: false })
    .order('day_of_month')
  return (data ?? []) as unknown as RecurringRule[]
}

export type Income = {
  id: string
  wallet_id: string
  amount: string
  received_on: string
  source: string
  note: string | null
  wallets: { id: string; name: string }
}

/** Household settings as a plain map. Shared and non-sensitive. */
export async function getSettings(): Promise<Record<string, string>> {
  const supabase = await createClient()
  const { data } = await supabase.from('app_settings').select('key, value')
  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]))
}

/**
 * Income is SHARED — both people see every euro coming in. Only spending is
 * private. There is no wallet filter here for that reason. See PROJECT.md.
 */
export async function getIncome(
  options: { from?: string; to?: string; limit?: number } = {},
): Promise<Income[]> {
  const supabase = await createClient()
  let query = supabase
    .from('income')
    .select('id, wallet_id, amount, received_on, source, note, wallets!inner(id, name)')
    .order('received_on', { ascending: false })
    .limit(options.limit ?? 100)

  if (options.from) query = query.gte('received_on', options.from)
  if (options.to) query = query.lte('received_on', options.to)

  const { data } = await query
  return (data ?? []) as unknown as Income[]
}

/**
 * The current pay-cycle period: anchor day from settings, snapped to real
 * salary dates where they have been logged.
 */
export async function getCurrentPeriod(): Promise<Period> {
  const supabase = await createClient()

  const [settings, salaries] = await Promise.all([
    getSettings(),
    supabase
      .from('income')
      .select('received_on')
      .eq('source', 'salary')
      .order('received_on', { ascending: false })
      .limit(24),
  ])

  return getPeriod(todayIso(), {
    anchorDay: Number(settings.pay_anchor_day ?? 26),
    windowDays: Number(settings.pay_anchor_window_days ?? 7),
    salaryDates: (salaries.data ?? []).map((row) => row.received_on as string),
  })
}

/**
 * The last `count` pay cycles, oldest first, including the current one.
 *
 * Walks backwards a day at a time from each period's start, so it follows the
 * same snapping rules as the live period — a cycle that moved because of a real
 * payday stays moved in the history.
 */
export async function getRecentPeriods(count = 6): Promise<Period[]> {
  const supabase = await createClient()
  const [settings, salaries] = await Promise.all([
    getSettings(),
    supabase
      .from('income')
      .select('received_on')
      .eq('source', 'salary')
      .order('received_on', { ascending: false })
      .limit(60),
  ])

  const options = {
    anchorDay: Number(settings.pay_anchor_day ?? 26),
    windowDays: Number(settings.pay_anchor_window_days ?? 7),
    salaryDates: (salaries.data ?? []).map((row) => row.received_on as string),
  }

  const periods: Period[] = []
  let cursor = todayIso()

  for (let i = 0; i < count; i++) {
    const period = getPeriod(cursor, options)
    periods.unshift(period)
    cursor = addDays(period.from, -1)
  }

  return periods
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
