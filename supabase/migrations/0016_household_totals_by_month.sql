-- 0016_household_totals_by_month.sql — fix the wallet budget total
--
-- household_wallet_totals() was written in 0013, before budgets were flattened
-- (0014) and before they belonged to a month (0015). Both changes broke it, and
-- both were visible on Home:
--
--   1. It summed `scope in ('wallet', 'group')`. 0014 deleted every group-scoped
--      budget, so the joint wallet's budget total silently became 0 and its bar
--      vanished from "By wallet".
--
--   2. It had no month filter, which was correct when a budget was standing and
--      wrong the moment 0015 gave budgets a period_month. With August and
--      September both populated it summed BOTH: Varun's 120,00 budget rendered
--      as "0,00 € / 240,00 €". Each new month would have added another 120.
--
-- The fix is a `budget_month` argument. The caller already knows which cycle it
-- is showing, and passing it explicitly is what makes the sum single-month by
-- construction rather than by luck.
--
-- Privacy is unchanged and re-checked: still SECURITY DEFINER, still aggregates
-- only, still no filter that could bisect a total down to one transaction. A
-- month is a coarser window than the from/to the caller already supplies, so it
-- adds no resolution. Still granted to `authenticated` alone.

drop function if exists public.household_wallet_totals(date, date);

create function public.household_wallet_totals(
  from_date    date,
  to_date      date,
  budget_month date
)
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
    -- One month only. A personal wallet carries a single `wallet` budget; the
    -- joint one carries `category` budgets, which since 0014 are the only thing
    -- that defines "over". A wallet never holds both in practice, so summing
    -- the two scopes cannot double-count.
    coalesce((
      select sum(b.amount) from budgets b
      where b.wallet_id = w.id
        and b.period_month = budget_month
        and b.scope in ('wallet', 'category')
    ), 0) as budgeted
  from wallets w
  order by w.kind desc, w.name;
$$;

revoke all on function public.household_wallet_totals(date, date, date) from public;
grant execute on function public.household_wallet_totals(date, date, date)
  to authenticated;
