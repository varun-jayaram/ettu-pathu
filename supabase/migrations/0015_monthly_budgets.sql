-- 0015_monthly_budgets.sql — budgets belong to a month, and a month's dates
-- can be adjusted
--
-- Until now a budget was standing: one row per wallet+category, applying to
-- whatever cycle you happened to be looking at. You could not say "September is
-- a holiday month, allow 900 for groceries" without silently changing August
-- too, and you could not set next month's numbers before it arrived.
--
-- A budget now carries `period_month` — the FIRST OF THE MONTH THE CYCLE IS
-- NAMED FOR. Periods are named for the month they END in (26 Aug–25 Sep is
-- "September 2026"), so that cycle's budgets carry 2026-09-01. This is a label,
-- not a date range: the real boundaries live in period_starts below.
--
-- Carry-forward: opening a month with no budgets copies the most recent earlier
-- month's forward, once, into real rows. Read-time fallback was rejected — it
-- would mean editing September retroactively changed October wherever October
-- had not been touched, so "September is frozen" would be a lie.
--
-- Recurring rules are untouched and cannot be affected by any of this.
-- materialize_recurring() reads recurring_rules and the calendar only; it has
-- never read budgets or the pay cycle. Rules keep firing every month.

-- Budgets gain a month ----------------------------------------------------
alter table budgets add column period_month date;

-- Backfill every existing budget onto the current cycle's month, so nothing
-- disappears from view the moment this lands. A period is named for the month
-- it ends in, and the anchor is the 26th, so "now" belongs to the current month
-- before the 26th and the next month on or after it.
update budgets
   set period_month = date_trunc(
     'month',
     case when extract(day from current_date) >= 26
          then current_date + interval '1 month'
          else current_date
     end
   )::date
 where period_month is null;

alter table budgets alter column period_month set not null;

-- Must be the first of a month: the column is a month label, and allowing
-- 2026-09-14 in it would create a second budget for September that nothing
-- would ever find.
alter table budgets add constraint budgets_period_month_is_first
  check (period_month = date_trunc('month', period_month)::date);

-- Uniqueness is now per month.
drop index if exists budgets_wallet_category_idx;
drop index if exists budgets_wallet_scope_idx;

create unique index budgets_wallet_category_month_idx
  on budgets (wallet_id, category_id, period_month)
  where category_id is not null;

create unique index budgets_wallet_month_idx
  on budgets (wallet_id, period_month)
  where scope = 'wallet';

create index budgets_period_month_idx on budgets (period_month);

-- Adjustable cycle boundaries ---------------------------------------------
-- One row per month that has been moved off its computed boundary. Absent
-- means "use the anchor day, snapped to a logged payday" exactly as before, so
-- this table stays empty until someone actually overrides something.
--
-- Only the START is stored. The end is always the day before the next cycle
-- starts, which makes a gap or an overlap unrepresentable rather than merely
-- discouraged.
--
-- Shared household config, like app_settings and pay_anchors: the pay cycle is
-- something both people must agree on, and a date leaks nothing.

create table period_starts (
  -- First of the month the cycle is NAMED for; 2026-09-01 is the cycle that
  -- ends in September and therefore usually starts in late August.
  period_month date primary key
    check (period_month = date_trunc('month', period_month)::date),
  starts_on    date not null,
  created_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),

  -- The cycle named for month M must END within M, i.e. by the last day of M.
  -- Since it ends the day before cycle M+1 starts, the binding rule here is
  -- that it must START before M ends — enforced as: no earlier than the first
  -- of the PREVIOUS month, and no later than the first of M itself.
  constraint period_starts_within_window check (
    starts_on >= (period_month - interval '1 month')::date and
    starts_on <= period_month
  )
);

alter table period_starts enable row level security;
grant select, insert, update, delete on period_starts to authenticated;

create policy period_starts_select on period_starts
  for select to authenticated using (true);
create policy period_starts_insert on period_starts
  for insert to authenticated with check (true);
create policy period_starts_update on period_starts
  for update to authenticated using (true) with check (true);
create policy period_starts_delete on period_starts
  for delete to authenticated using (true);

create trigger period_starts_updated_at
  before update on period_starts
  for each row execute function public.set_updated_at();

-- Carry a month's budgets forward -----------------------------------------
-- Idempotent: does nothing once the month has any budget row of its own, so
-- calling it on every page load is safe. Same pattern as
-- materialize_recurring().
--
-- SECURITY INVOKER (the default) is deliberate. It runs as the caller, so RLS
-- decides which wallets are copyable — Shriya's personal budgets can never be
-- read or written through Varun's session, and vice versa.

create function public.carry_budgets_forward(target_month date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  source_month date;
  created      integer := 0;
begin
  if target_month is null or target_month <> date_trunc('month', target_month)::date then
    raise exception 'target_month must be the first of a month, got %', target_month;
  end if;

  -- Per wallet, so a wallet added later still inherits rather than starting
  -- blank because some other wallet already had rows for this month.
  for source_month in
    select distinct b.period_month from budgets b where b.period_month < target_month
    order by 1 desc limit 1
  loop
    insert into budgets (wallet_id, scope, category_id, amount, period_month)
    select b.wallet_id, b.scope, b.category_id, b.amount, target_month
      from budgets b
     where b.period_month = source_month
       and not exists (
         select 1 from budgets existing
          where existing.wallet_id = b.wallet_id
            and existing.period_month = target_month
       );
    get diagnostics created = row_count;
  end loop;

  return created;
end $$;

revoke all on function public.carry_budgets_forward(date) from public;
grant execute on function public.carry_budgets_forward(date) to authenticated;
