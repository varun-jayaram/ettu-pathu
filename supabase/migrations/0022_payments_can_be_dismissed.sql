-- 0022_payments_can_be_dismissed.sql — "don't apply" is a real answer
--
-- 0021 gave a tagged payment two states: pending, or folded into the balance by
-- Apply. In use a third one turned out to be the common case — the user had
-- already typed the new balance by hand, so the payment was accounted for, but
-- the row went on offering to subtract it a second time. The only way to stop
-- that was to apply it and then correct the figure back, which is worse than
-- doing nothing.
--
-- So Apply gains a counterpart: DON'T APPLY. It settles the payment without
-- touching the balance — "I have dealt with this, stop offering it."
--
-- Deliberately NO new column. `balance_applied_at` already answers the only
-- question the app asks of it — "is this payment still pending?" — and the two
-- ways of settling have no different consequence anywhere: not in the balance,
-- not in a total, not in the Log. A second timestamp would have to be read
-- everywhere the first one is, to tell apart two states nothing distinguishes.
-- The column's meaning is widened instead, and its comment says so.
--
-- The payment itself is untouched either way. It keeps its amount, its tag and
-- its place in the Log; only the offer goes away.

comment on column expenses.balance_applied_at is
  'When this payment stopped being pending — either folded into its net worth entry''s balance by Apply, or dismissed with "Don''t apply" because the balance already accounted for it. Null = still pending.';
