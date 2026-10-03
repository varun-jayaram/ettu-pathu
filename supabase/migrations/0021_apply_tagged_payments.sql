-- 0021_apply_tagged_payments.sql — tagged payments wait to be applied
--
-- 0020 made the balance a number the user types, and left "Towards what" purely
-- informational. That went one step too far: a 1.000 € payment was logged,
-- tagged to the car loan, and the balance did not move. Correct by the rules,
-- surprising in practice — the user wants to own the number without doing the
-- arithmetic.
--
-- So a tagged payment is now PENDING until it is applied, from a button on the
-- Net worth tab. The balance is still typed and still wins; Apply is a shortcut
-- that writes into the same field.
--
-- WHY A MARKER RATHER THAN A SUM. "What is pending" cannot be recomputed from
-- the tags alone — every one of them would look pending forever, so pressing
-- Apply twice, or simply loading the page next month, would subtract the same
-- 1.300 € again. `balance_applied_at` records the fact per payment, which makes
-- pending well defined, makes Apply idempotent, and survives a reload.
--
-- Pending is deliberately NOT scoped to a pay cycle: a payment tagged in
-- September and never applied must still be waiting in October, or money
-- evaporates when the month rolls over.
--
-- NO AUTOMATIC REVERSAL. Deleting or editing a payment AFTER it has been applied
-- does not rewind the balance. Doing that properly means a reversing ledger, and
-- this feature has twice been simplified away from exactly that kind of
-- machinery. The typed field is the escape hatch, and the UI says so rather than
-- leaving it to be discovered.

alter table expenses add column balance_applied_at timestamptz;

comment on column expenses.balance_applied_at is
  'When this payment was folded into its net worth entry''s balance. Null = still pending.';

-- Partial: the only lookup is "tagged and not yet applied".
create index expenses_balance_pending_idx on expenses (net_worth_item_id)
  where net_worth_item_id is not null and balance_applied_at is null;

-- Applying more than was owed must be visible, not clamped away. A negative
-- balance is a discrepancy the page reports in amber — the same treatment a
-- loan past its end date already gets. The typed field still refuses negatives,
-- because nobody types one on purpose.
alter table net_worth_items drop constraint net_worth_items_current_amount_check;
