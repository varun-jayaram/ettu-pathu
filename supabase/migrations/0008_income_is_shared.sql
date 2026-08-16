-- 0008_income_is_shared.sql — income is a household fact, not a private one
--
-- 0007 modelled income as wallet-private, mirroring expenses. That was wrong:
-- the household pools income and keeps only *spending* private. Both people
-- should see every euro coming in.
--
-- This is a deliberate asymmetry, and it is the heart of the household model:
--
--     INCOME   is shared    — we both see what comes in.
--     SPENDING is private   — neither sees the other's personal wallet.
--     JOINT    is shared    — what we spend together.
--
-- Two consequences worth knowing:
--
-- 1. `pay_anchors` is dropped. It existed only to publish the payday DATE
--    without leaking the AMOUNT, so both phones computed the same period
--    boundary. Now that salary rows are readable by both, the period can snap
--    to the actual `received_on` directly. One table less, one sync problem
--    less.
--
-- 2. `wallet_id` stays on `income`, but purely as attribution — whose account
--    it landed in — not as a privacy boundary. Either person may log income
--    against either wallet, because it is household money either way.

drop table if exists pay_anchors;

drop policy if exists income_select on income;
drop policy if exists income_insert on income;
drop policy if exists income_update on income;
drop policy if exists income_delete on income;

-- Shared, like the category taxonomy: any authenticated user (there are
-- exactly two, and signup is disabled) may read and write household income.
create policy income_select on income
  for select to authenticated using (true);
create policy income_insert on income
  for insert to authenticated with check (true);
create policy income_update on income
  for update to authenticated using (true) with check (true);
create policy income_delete on income
  for delete to authenticated using (true);
