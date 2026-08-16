-- 0002_rls.sql — Row Level Security
--
-- This file is the security model. The browser only ever holds the Supabase
-- anon key plus the logged-in user's JWT; every policy below asks "is this user
-- a member of this row's wallet?". That is what makes a public repo and a
-- public URL leak nothing, and it is why privacy is enforced here rather than
-- in application code — the predecessor habit tracker's app-layer privacy was
-- its known weakness.
--
-- RLS is enabled on every table. No table is left permissive by default.

-- ---------------------------------------------------------------------------
-- Membership helper
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so that a policy ON wallet_members can query
-- wallet_members without triggering infinite policy recursion. The function
-- runs as its owner and therefore bypasses RLS on the table it reads.
--
-- `set search_path = public` is mandatory on SECURITY DEFINER functions: it
-- stops a caller from shadowing `wallet_members` with their own table and
-- tricking the function into returning true.

create function public.is_wallet_member(w uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from wallet_members
    where wallet_id = w and user_id = auth.uid()
  );
$$;

revoke all on function public.is_wallet_member(uuid) from public;
grant execute on function public.is_wallet_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table wallets         enable row level security;
alter table wallet_members  enable row level security;
alter table category_groups enable row level security;
alter table categories      enable row level security;
alter table expenses        enable row level security;
alter table recurring_rules enable row level security;
alter table budgets         enable row level security;

-- ---------------------------------------------------------------------------
-- Table grants
-- ---------------------------------------------------------------------------
-- Grants and policies are two independent gates and BOTH must pass. Postgres
-- checks the table grant first: without it every statement is denied before a
-- policy is ever consulted.
--
-- These are stated explicitly rather than inherited from Supabase's default
-- privileges, because those are attached to the role that creates the object —
-- and migrations do not always run as that role. Being explicit is what makes
-- `supabase db reset` reproduce an identical database anywhere.
--
-- The grants are deliberately coarse (they say "may attempt"); the policies
-- above are what decide which rows. `anon` is granted nothing at all — an
-- unauthenticated visitor can read no application table.

grant usage on schema public to authenticated;

-- Read-only: seeded by the operator, never written from the app.
grant select on wallets, wallet_members to authenticated;

-- Shared taxonomy, and the wallet-scoped data that RLS filters per user.
grant select, insert, update, delete on
  category_groups, categories, expenses, recurring_rules, budgets
  to authenticated;

-- ---------------------------------------------------------------------------
-- Wallets and membership — read-only to members
-- ---------------------------------------------------------------------------
-- Wallets and memberships are seeded once by the operator (service role, which
-- bypasses RLS). Neither is writable from the app, so there is deliberately no
-- insert/update/delete policy: a user cannot add themselves to a wallet.

create policy wallets_select_member on wallets
  for select to authenticated
  using (public.is_wallet_member(id));

create policy wallet_members_select_member on wallet_members
  for select to authenticated
  using (public.is_wallet_member(wallet_id));

-- ---------------------------------------------------------------------------
-- Category taxonomy — shared by both users
-- ---------------------------------------------------------------------------
-- Any authenticated user may read and write the taxonomy. Category *names* are
-- not sensitive; the amounts attached to them are, and those live in
-- `expenses`. This is exactly what lets both of you share one taxonomy while
-- personal spending inside it stays private.

create policy category_groups_select on category_groups
  for select to authenticated using (true);
create policy category_groups_insert on category_groups
  for insert to authenticated with check (true);
create policy category_groups_update on category_groups
  for update to authenticated using (true) with check (true);
create policy category_groups_delete on category_groups
  for delete to authenticated using (true);

create policy categories_select on categories
  for select to authenticated using (true);
create policy categories_insert on categories
  for insert to authenticated with check (true);
create policy categories_update on categories
  for update to authenticated using (true) with check (true);
create policy categories_delete on categories
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Expenses — the private data
-- ---------------------------------------------------------------------------
-- WITH CHECK on insert and update is what stops a user writing a row *into* a
-- wallet they do not belong to, or moving one of their rows into someone
-- else's wallet. USING alone would only filter what they can see.

create policy expenses_select on expenses
  for select to authenticated
  using (public.is_wallet_member(wallet_id));

create policy expenses_insert on expenses
  for insert to authenticated
  with check (public.is_wallet_member(wallet_id));

create policy expenses_update on expenses
  for update to authenticated
  using (public.is_wallet_member(wallet_id))
  with check (public.is_wallet_member(wallet_id));

create policy expenses_delete on expenses
  for delete to authenticated
  using (public.is_wallet_member(wallet_id));

-- ---------------------------------------------------------------------------
-- Recurring rules
-- ---------------------------------------------------------------------------

create policy recurring_rules_select on recurring_rules
  for select to authenticated
  using (public.is_wallet_member(wallet_id));

create policy recurring_rules_insert on recurring_rules
  for insert to authenticated
  with check (public.is_wallet_member(wallet_id));

create policy recurring_rules_update on recurring_rules
  for update to authenticated
  using (public.is_wallet_member(wallet_id))
  with check (public.is_wallet_member(wallet_id));

create policy recurring_rules_delete on recurring_rules
  for delete to authenticated
  using (public.is_wallet_member(wallet_id));

-- ---------------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------------

create policy budgets_select on budgets
  for select to authenticated
  using (public.is_wallet_member(wallet_id));

create policy budgets_insert on budgets
  for insert to authenticated
  with check (public.is_wallet_member(wallet_id));

create policy budgets_update on budgets
  for update to authenticated
  using (public.is_wallet_member(wallet_id))
  with check (public.is_wallet_member(wallet_id));

create policy budgets_delete on budgets
  for delete to authenticated
  using (public.is_wallet_member(wallet_id));
