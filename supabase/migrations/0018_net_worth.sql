-- 0018_net_worth.sql — loans and investments, so something finally holds a
-- BALANCE
--
-- Until now the app had flows and no stocks. Income came in, expenses went out,
-- and a €300 EMI was indistinguishable from €300 of groceries: both left, both
-- counted, and no screen could say how much of the loan was left. Same on the
-- other side — €250 a month into a fund, and nothing anywhere saying how much
-- is in it.
--
-- A `net_worth_items` row is a standing commitment with two numbers:
--
--   total_amount    the whole loan, or the savings target
--   monthly_amount  the instalment the contract says
--
-- WHY THE MONTHLY MOVEMENT IS NOT STORED HERE. There is deliberately no
-- "payments" table and no per-month amount to type. A loan payment is already
-- an `expenses` row — materialize_recurring() generates it from a rule, or
-- somebody logs it by hand on /add — so storing it again would create a second
-- copy of the same fact, free to drift from the first. The outstanding balance
-- is therefore DERIVED: total_amount minus the expenses that landed in this
-- item's category since started_on. Both paths count, because both end up in
-- the same table.
--
-- `category_id` is the "towards what" field, and it is what makes that
-- derivation possible: it is the join between a commitment and the money that
-- actually serviced it. Not null for that reason — an item with no category has
-- no way to ever move.
--
-- `recurring_rule_id` is optional and narrows the attribution to exactly one
-- rule's rows, which is what lets two loans share the Loans / EMI category.
-- Where it is absent and a category is shared, the app says the figure cannot
-- be split rather than silently halving it.
--
-- SHARED, LIKE INCOME. The wallet_id + is_wallet_member() pattern is kept
-- because every table in this schema has it (PROJECT.md § Add a table), but the
-- app always resolves the JOINT wallet, exactly as addIncome does, so both
-- people see every loan and every investment. This was the user's explicit
-- choice.
--
-- AND THE DERIVED SUM READS THE JOINT WALLET ONLY. This is the pay_anchors
-- lesson from 0007 restated. If the balance summed expenses across all wallets,
-- RLS would hide the other person's personal rows and the two phones would
-- compute DIFFERENT outstanding balances for the same loan. Summing one shared
-- wallet makes the number identical on both devices by construction. Reaching
-- further would need a SECURITY DEFINER aggregate keyed by CATEGORY — precisely
-- what PROJECT.md § "Totals are shared; detail is not" forbids, since a
-- per-category total bisects a private wallet. So: joint only, and the page
-- says so out loud.

create table net_worth_items (
  id                uuid primary key default gen_random_uuid(),
  wallet_id         uuid not null references wallets (id) on delete cascade,
  kind              text not null check (kind in ('loan', 'investment')),
  -- Free text, because "what loan is it" is not a taxonomy. The category below
  -- is the stable key; this is the label a human reads.
  name              text not null check (length(btrim(name)) > 0),
  -- "Towards what" — the join to the money that services this item.
  category_id       uuid not null references categories (id) on delete restrict,
  -- Optional, and only ever a narrowing: which rule's occurrences belong to
  -- this item. ON DELETE SET NULL so deleting a rule degrades the attribution
  -- rather than destroying the item.
  recurring_rule_id uuid references recurring_rules (id) on delete set null,
  total_amount      numeric(12, 2) check (total_amount > 0),
  monthly_amount    numeric(12, 2) check (monthly_amount > 0),
  -- Payments are counted from here. Without it the balance would silently
  -- include every euro ever spent in the category, including the years before
  -- this loan existed.
  started_on        date not null,
  ends_on           date,
  -- Never delete, archive. Same rule as categories and recurring rules.
  active            boolean not null default true,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A loan has a principal by definition — "how much is left" is meaningless
  -- without it. An open-ended monthly investment genuinely has no target, so
  -- there the column stays null and the page shows what has gone in instead.
  constraint net_worth_items_loan_has_total
    check (kind <> 'loan' or total_amount is not null),
  constraint net_worth_items_dates_ordered
    check (ends_on is null or ends_on >= started_on)
);

create index net_worth_items_wallet_kind_idx on net_worth_items (wallet_id, kind);
create index net_worth_items_category_id_idx on net_worth_items (category_id);

create trigger net_worth_items_set_updated_at
  before update on net_worth_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Membership decides, nothing else — identical in shape to the income policies
-- in 0007. WITH CHECK on insert and update is what stops a row being written
-- into, or moved into, a wallet the user does not belong to.

alter table net_worth_items enable row level security;

grant select, insert, update, delete on net_worth_items to authenticated;

create policy net_worth_items_select on net_worth_items
  for select to authenticated
  using (public.is_wallet_member(wallet_id));

create policy net_worth_items_insert on net_worth_items
  for insert to authenticated
  with check (public.is_wallet_member(wallet_id));

create policy net_worth_items_update on net_worth_items
  for update to authenticated
  using (public.is_wallet_member(wallet_id))
  with check (public.is_wallet_member(wallet_id));

create policy net_worth_items_delete on net_worth_items
  for delete to authenticated
  using (public.is_wallet_member(wallet_id));

-- anon gets nothing, consistent with 0005.
revoke all on net_worth_items from anon;
