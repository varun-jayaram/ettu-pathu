-- 0012_category_is_savings.sql — mark which categories are money kept, not spent
--
-- Home now shows Expenses and Savings as separate boxes, so the app needs to
-- know which is which again. `kind = 'transfer'` used to carry this and was
-- dropped in 0011.
--
-- This is deliberately NOT a revival of `kind`, and the difference matters:
--
--   `kind` was a label on the GROUP that silently decided three unrelated
--   things — what could be budgeted, how Home was split, and what counted as
--   spending. A category inherited all three from whichever folder it happened
--   to sit in, which is how Deutschlandticket became "variable".
--
--   `is_savings` is a flag on the CATEGORY that decides exactly one thing:
--   which box it appears in on Home. It survives renaming, survives moving the
--   category to another group, and implies nothing else.
--
-- Savings still COUNTS as spending — it is included in "Out" and in "Left", per
-- the user's decision. The split is presentational: it answers "how much did we
-- put aside" without pretending that money is still available.

alter table categories
  add column is_savings boolean not null default false;

comment on column categories.is_savings is
  'Money put aside rather than consumed. Affects the Home split only; still counts in every spend total.';

-- Seed the obvious ones. Everything else stays false and is toggled in the app.
update categories
set is_savings = true
where name in ('Savings', 'Investments');
