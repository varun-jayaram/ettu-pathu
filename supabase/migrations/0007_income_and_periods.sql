-- 0007_income_and_periods.sql — income tracking, and pay-cycle periods
--
-- Two changes, related:
--
-- 1. INCOME. Until now the app only had the "expenses ten" half of the
--    proverb. `income` is the "income eight" half. It is wallet-scoped and
--    RLS-gated exactly like expenses, so salary in a personal wallet stays
--    private.
--
-- 2. PAY-CYCLE PERIODS. Budgets and reports ran on calendar months, but the
--    household is paid between the 25th and 27th — so the last days of every
--    calendar month were funded by the following month's salary, and the
--    budget reset five days after payday.
--
--    Periods now run from a configurable anchor day (default the 26th) to the
--    day before the next one. Exactly one period per calendar month, so
--    month-over-month comparison still works; no drift, unlike a rolling
--    30 days.
--
-- WHY `pay_anchors` IS A SEPARATE, SHARED TABLE — this is the subtle part:
--
--    The period may snap to the actual payday when it is logged. But if that
--    date were read from `income`, RLS would hide the other person's salary
--    and the two of them would compute DIFFERENT period boundaries — the same
--    month would show different totals on each phone.
--
--    So the cycle start DATE is stored here, shared and readable by both,
--    while the AMOUNT stays private in `income`. A date alone reveals nothing
--    sensitive; the amount is what matters, and that is still wallet-scoped.

-- ---------------------------------------------------------------------------
-- Household settings
-- ---------------------------------------------------------------------------
-- Shared, non-sensitive configuration. Same reasoning as the category
-- taxonomy: both people must agree on it, and it leaks nothing.

create table app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('pay_anchor_day', '26'),
  -- How far from the anchor a logged payday may be and still be treated as
  -- that cycle's start, rather than a stray mid-month payment.
  ('pay_anchor_window_days', '7');

-- ---------------------------------------------------------------------------
-- Pay anchors — dates only, deliberately
-- ---------------------------------------------------------------------------

create table pay_anchors (
  starts_on  date primary key,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Income
-- ---------------------------------------------------------------------------
-- Only `source = 'salary'` drives the pay cycle. Bonuses, refunds and gifts
-- are income but do not move the period boundary.

create table income (
  id          uuid primary key default gen_random_uuid(),
  wallet_id   uuid not null references wallets (id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  received_on date not null,
  source      text not null default 'salary'
              check (source in ('salary', 'bonus', 'freelance', 'interest',
                                'gift', 'refund', 'other')),
  note        text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index income_wallet_received_idx on income (wallet_id, received_on desc);

create trigger income_set_updated_at
  before update on income
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table app_settings enable row level security;
alter table pay_anchors  enable row level security;
alter table income       enable row level security;

grant select, insert, update, delete on app_settings, pay_anchors, income
  to authenticated;

-- Shared household config: both may read and write, like the taxonomy.
create policy app_settings_select on app_settings
  for select to authenticated using (true);
create policy app_settings_insert on app_settings
  for insert to authenticated with check (true);
create policy app_settings_update on app_settings
  for update to authenticated using (true) with check (true);

create policy pay_anchors_select on pay_anchors
  for select to authenticated using (true);
create policy pay_anchors_insert on pay_anchors
  for insert to authenticated with check (true);
create policy pay_anchors_delete on pay_anchors
  for delete to authenticated using (true);

-- Income is as private as expenses: wallet membership decides, nothing else.
create policy income_select on income
  for select to authenticated
  using (public.is_wallet_member(wallet_id));

create policy income_insert on income
  for insert to authenticated
  with check (public.is_wallet_member(wallet_id));

create policy income_update on income
  for update to authenticated
  using (public.is_wallet_member(wallet_id))
  with check (public.is_wallet_member(wallet_id));

create policy income_delete on income
  for delete to authenticated
  using (public.is_wallet_member(wallet_id));

-- anon gets nothing, consistent with 0005.
revoke all on app_settings, pay_anchors, income from anon;
