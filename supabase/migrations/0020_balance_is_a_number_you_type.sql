-- 0020_balance_is_a_number_you_type.sql — the balance is yours to set
--
-- 0018 inferred a balance from a category. 0019 made it the sum of payments
-- tagged "Towards what". Both were derivations, and both had the same flaw: to
-- see a true figure you had to feed the machine first — tag every payment, keep
-- tagging them, and read warnings about the ones you had not. The user's verdict
-- was "it's too confusing", and they were right. A household knows what it owes;
-- it should be able to say so.
--
-- So `current_amount` is the balance, and it is TYPED. Still owed on a loan,
-- worth now on an investment, edited on the Net worth tab in one box, whenever
-- you like. It is the only number net worth is computed from.
--
--   net worth = sum(investments.current_amount) − sum(loans.current_amount)
--
-- An investment is the case that proves this was right. Its value moves with the
-- market, and no sum of contributions can ever express that: a fund you paid
-- 5.000 into might be worth 5.400, and 0019 had no way to say so. Typing it is
-- not a workaround, it is the only correct answer.
--
-- WHAT TAGGING IS NOW. `expenses.net_worth_item_id` stays, and so does the
-- "Towards what" field — but it is strictly optional and purely informational.
-- The page shows "300,00 € tagged this cycle" beside the balance and changes
-- nothing. Nothing is ever adjusted behind the user's back, and nothing is
-- warned about: a payment you did not tag is not a problem to be reported, it
-- is simply a payment you did not tag.
--
-- `total_amount` survives as the full loan or the savings target, and it now has
-- exactly one job: the progress bar. It is therefore OPTIONAL for both kinds —
-- the loan-needs-a-principal constraint went with the derivation that needed it.

alter table net_worth_items
  add column current_amount numeric(12, 2) check (current_amount >= 0);

comment on column net_worth_items.current_amount is
  'Still owed (loan) or worth now (investment). Typed by the user; the only number net worth is computed from.';

comment on column net_worth_items.total_amount is
  'The full loan, or the savings target. Optional, and used only to draw progress against.';

-- Backfill so nothing on screen changes the moment this lands.
--
--   loan       what 0019 showed as outstanding: principal minus tagged payments,
--              floored at zero
--   investment what 0019 showed as contributed: the tagged payments; falling
--              back to the target where nothing was ever tagged, since that is
--              the only other figure the entry carries
update net_worth_items n
   set current_amount = greatest(
     case
       when n.kind = 'loan'
         then coalesce(n.total_amount, 0) - coalesce((
           select sum(e.amount) from expenses e where e.net_worth_item_id = n.id
         ), 0)
       else coalesce((
         select sum(e.amount) from expenses e where e.net_worth_item_id = n.id
       ), n.total_amount, 0)
     end,
     0
   )
 where n.current_amount is null;

alter table net_worth_items alter column current_amount set not null;

-- A loan no longer needs a principal: without the derivation, "how much is left"
-- is answered by current_amount directly, and the full amount is only there to
-- draw a bar against.
alter table net_worth_items drop constraint net_worth_items_loan_has_total;
