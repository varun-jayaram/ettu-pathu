-- 0001_init.sql — schema for Varavu Ettu Selavu Pathu
--
-- Conventions (carried over from claude-project, see PROJECT.md):
--   * Stable UUID keys, editable labels — renaming never breaks history.
--   * Never delete, archive — `active` flags instead of DELETE, so historical
--     expenses always resolve their category labels.
--   * Money is numeric(12,2), never float. Amounts are always positive; the
--     wallet and category carry the meaning, not the sign.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Wallets and membership
-- ---------------------------------------------------------------------------
-- wallet_members is the entire privacy design. A personal wallet has exactly
-- one member (its owner); the joint wallet has both. Every RLS policy in
-- 0002_rls.sql reduces to a membership check against this table, so "personal
-- is private, joint is shared" falls out of the data rather than being
-- re-implemented in application code.

create table wallets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null check (kind in ('personal', 'joint')),
  owner_id   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table wallet_members (
  wallet_id uuid not null references wallets (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  primary key (wallet_id, user_id)
);

create index wallet_members_user_id_idx on wallet_members (user_id);

-- ---------------------------------------------------------------------------
-- Category taxonomy: two levels, group -> category
-- ---------------------------------------------------------------------------
-- `kind` lives on the group, not the category, so the committed/variable/
-- transfer split is declared once and cannot drift between two categories that
-- mean the same thing.
--
--   committed — the monthly floor; contractual, not budgeted.
--   variable  — the only spend worth budgeting.
--   transfer  — money moved, not money burnt. Excluded from every spend total
--               and from budget consumption (see the kind <> 'transfer' rule).

create table category_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null check (kind in ('committed', 'variable', 'transfer')),
  sort_order integer not null default 0,
  active     boolean not null default true
);

create table categories (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references category_groups (id) on delete restrict,
  name       text not null,
  icon       text,
  sort_order integer not null default 0,
  active     boolean not null default true
);

create index categories_group_id_idx on categories (group_id);

-- ---------------------------------------------------------------------------
-- Recurring rules
-- ---------------------------------------------------------------------------
-- Materialised into real `expenses` rows by materialize_recurring() on app
-- load, guarded by last_generated_on so it is idempotent. Declared before
-- `expenses` because expenses carries the back-reference.

create table recurring_rules (
  id                 uuid primary key default gen_random_uuid(),
  wallet_id          uuid not null references wallets (id) on delete cascade,
  category_id        uuid not null references categories (id) on delete restrict,
  amount             numeric(12, 2) not null check (amount > 0),
  note               text,
  day_of_month       integer not null check (day_of_month between 1 and 31),
  start_date         date not null,
  end_date           date,
  active             boolean not null default true,
  last_generated_on  date,
  created_at         timestamptz not null default now(),
  constraint recurring_rules_dates_ordered check (end_date is null or end_date >= start_date)
);

create index recurring_rules_wallet_id_idx on recurring_rules (wallet_id);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create table expenses (
  id                uuid primary key default gen_random_uuid(),
  wallet_id         uuid not null references wallets (id) on delete cascade,
  category_id       uuid not null references categories (id) on delete restrict,
  amount            numeric(12, 2) not null check (amount > 0),
  spent_on          date not null,
  note              text,
  created_by        uuid references auth.users (id) on delete set null,
  recurring_rule_id uuid references recurring_rules (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index expenses_wallet_spent_on_idx on expenses (wallet_id, spent_on desc);
create index expenses_category_id_idx on expenses (category_id);

-- One generated row per rule per due date. Partial, so hand-entered expenses
-- (recurring_rule_id is null) are never constrained by it.
create unique index expenses_recurring_rule_occurrence_idx
  on expenses (recurring_rule_id, spent_on)
  where recurring_rule_id is not null;

-- ---------------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------------
-- Per wallet, at group level, monthly, no rollover. A category sub-limit only
-- WARNS — the group budget alone defines what "over" means, which is why
-- sub-limits are never required to sum to the group budget.
--
-- Per-wallet scoping is a privacy requirement, not a convenience: Shriya's
-- personal budgets sit in her wallet and are invisible under the same
-- is_wallet_member policy as her expenses. There is deliberately no
-- household-wide budget — computing one would expose each other's personal
-- spend.

create table budgets (
  id          uuid primary key default gen_random_uuid(),
  wallet_id   uuid not null references wallets (id) on delete cascade,
  scope       text not null check (scope in ('group', 'category')),
  group_id    uuid references category_groups (id) on delete cascade,
  category_id uuid references categories (id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  created_at  timestamptz not null default now(),

  -- Exactly one of group_id / category_id is set, matching `scope`.
  constraint budgets_scope_target_matches check (
    (scope = 'group'    and group_id is not null and category_id is null) or
    (scope = 'category' and category_id is not null and group_id is null)
  )
);

create unique index budgets_wallet_group_idx
  on budgets (wallet_id, group_id) where group_id is not null;
create unique index budgets_wallet_category_idx
  on budgets (wallet_id, category_id) where category_id is not null;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger expenses_set_updated_at
  before update on expenses
  for each row execute function public.set_updated_at();
