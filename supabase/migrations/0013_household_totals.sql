-- 0013_household_totals.sql — household totals, and one-number personal budgets
--
-- Two related changes.
--
-- ===========================================================================
-- 1. WALLET-LEVEL BUDGETS
-- ===========================================================================
-- A personal wallet now carries a single budget for the whole wallet — "my
-- spending money this month is 150" — rather than a budget per group with
-- optional per-category limits. Groups and sub-limits stay for the joint
-- wallet, where several people's shared costs genuinely need breaking down.
--
-- The `budgets` table gains a third scope. The CHECK still guarantees exactly
-- one target: 'wallet' has neither a group nor a category.

alter table budgets drop constraint if exists budgets_scope_check;
alter table budgets drop constraint if exists budgets_scope_target_matches;

alter table budgets add constraint budgets_scope_check
  check (scope in ('wallet', 'group', 'category'));

alter table budgets add constraint budgets_scope_target_matches check (
  (scope = 'wallet'   and group_id is null     and category_id is null) or
  (scope = 'group'    and group_id is not null and category_id is null) or
  (scope = 'category' and category_id is not null and group_id is null)
);

-- One wallet-level budget per wallet.
create unique index budgets_wallet_scope_idx
  on budgets (wallet_id) where scope = 'wallet';

-- ===========================================================================
-- 2. HOUSEHOLD TOTALS WITHOUT LEAKING ROWS
-- ===========================================================================
-- Until now a personal wallet was completely invisible to the other person:
-- RLS rejected the rows, so Varun's "Out" silently omitted whatever Shriya
-- spent, and the two phones disagreed about how much the household had spent.
--
-- The privacy line moves from "invisible" to "total visible, detail private".
-- Each of them may now see WHAT the other spent in total and against what
-- budget, but never a single row: not the categories, not the notes, not the
-- dates, not the amounts of individual purchases.
--
-- This is SECURITY DEFINER, which bypasses RLS — so it is written to make a
-- leak structurally impossible rather than merely unlikely:
--
--   * it returns aggregates ONLY; there is no row-returning path through it
--   * it takes no filters that could be used to bisect a total down to one
--     transaction (no category, no note search, no single-day range beyond
--     what the caller already knows)
--   * it is granted to `authenticated` alone — never to `anon`
--
-- If this function ever grows a category or per-row output, the private wallet
-- stops being private. Add a new function instead.

create function public.household_wallet_totals(from_date date, to_date date)
returns table (
  wallet_id   uuid,
  wallet_name text,
  wallet_kind text,
  spent       numeric,
  saved       numeric,
  budgeted    numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select
    w.id,
    w.name,
    w.kind,
    coalesce((
      select sum(e.amount) from expenses e
      where e.wallet_id = w.id and e.spent_on between from_date and to_date
    ), 0) as spent,
    coalesce((
      select sum(e.amount)
      from expenses e
      join categories c on c.id = e.category_id
      where e.wallet_id = w.id
        and e.spent_on between from_date and to_date
        and c.is_savings
    ), 0) as saved,
    -- Wallet-level budget for personal wallets; the sum of group budgets for
    -- the joint one. Category sub-limits are deliberately excluded — they only
    -- warn, and adding them would double-count.
    coalesce((
      select sum(b.amount) from budgets b
      where b.wallet_id = w.id and b.scope in ('wallet', 'group')
    ), 0) as budgeted
  from wallets w
  order by w.kind desc, w.name;
$$;

revoke all on function public.household_wallet_totals(date, date) from public;
grant execute on function public.household_wallet_totals(date, date) to authenticated;
