-- 0019_expense_names_its_item.sql — the EXPENSE says what it paid towards
--
-- 0018 pointed the arrow the other way: a net_worth_item named a category, and
-- the balance was inferred from whatever landed in it. That inference could not
-- always be made. Two loans both paid out of Loans / EMI produced a category
-- total that genuinely could not be split, so the page had to show the money
-- and then explain, in amber, that it did not know whose it was. A number that
-- arrives with a disclaimer is a number nobody trusts.
--
-- So the link is inverted. An expense now carries `net_worth_item_id` — "towards
-- what" — chosen when it is logged. Attribution stops being a guess and becomes
-- a fact somebody stated: the balance of a loan is the sum of the payments that
-- NAME it, and nothing else. Two loans in one category are no longer a problem
-- worth a paragraph; they are two tags.
--
-- WHAT THIS LETS US DELETE, which is the real measure of the change:
--
--   net_worth_items.category_id       the inference's input
--   net_worth_items.recurring_rule_id the narrowing that patched the inference
--   net_worth_items.started_on        the window that stopped the inference
--                                     reaching back before the loan existed
--
-- All three existed to make a guess less wrong. With the expense naming its own
-- item, none of them has a job. An entry is now exactly what was asked for: an
-- amount, what it is, a monthly payment, and an optional end date.
--
-- RECURRING RULES CARRY THE TAG TOO. A monthly EMI generates a fresh expense
-- every month forever; tagging each one by hand would be a chore that gets
-- skipped, and a skipped tag is a balance that silently stops moving. The rule
-- holds the tag and materialize_recurring() stamps it onto every row it
-- creates, so a rule is tagged once and stays tagged.
--
-- NOTHING IS BACKFILLED. Existing expenses keep a null tag and count towards
-- nothing until somebody says otherwise. Guessing them from the categories the
-- old inference used would write the very assumption this migration exists to
-- remove — and it would look deliberate afterwards, exactly like 0017's
-- carried-forward budgets. The Net worth tab reports untagged money in amber
-- instead, so it is visible rather than merely absent.

-- The tag ---------------------------------------------------------------------
-- ON DELETE SET NULL on both: deleting a loan must never delete the record of
-- having paid it. The expense survives as an ordinary row, which is the same
-- rule recurring_rule_id already follows.

alter table expenses
  add column net_worth_item_id uuid references net_worth_items (id) on delete set null;

comment on column expenses.net_worth_item_id is
  'Which loan or investment this payment went towards. Null means it moves no balance.';

create index expenses_net_worth_item_id_idx on expenses (net_worth_item_id)
  where net_worth_item_id is not null;

alter table recurring_rules
  add column net_worth_item_id uuid references net_worth_items (id) on delete set null;

comment on column recurring_rules.net_worth_item_id is
  'Stamped onto every expense this rule generates, so a monthly loan payment tags itself.';

-- The three columns the inference needed ---------------------------------------
alter table net_worth_items drop column category_id;
alter table net_worth_items drop column recurring_rule_id;
alter table net_worth_items drop column started_on;

-- Generated rows inherit the rule's tag -----------------------------------------
-- Same body as 0004 but for the two added columns in the INSERT. Replacing it
-- wholesale rather than patching it keeps the one readable copy of the
-- generation logic.

create or replace function public.materialize_recurring() returns integer
language plpgsql
set search_path = public
as $$
declare
  r          record;
  month      date;
  occurrence date;
  horizon    date;
  last_occ   date;
  created    integer := 0;
begin
  for r in
    select * from recurring_rules
    where active and start_date <= current_date
  loop
    horizon  := least(current_date, coalesce(r.end_date, current_date));
    last_occ := r.last_generated_on;

    for month in
      select generate_series(
        date_trunc('month', r.start_date),
        date_trunc('month', horizon),
        interval '1 month'
      )::date
    loop
      occurrence := month + (
        least(
          r.day_of_month,
          extract(day from (month + interval '1 month' - interval '1 day'))::integer
        ) - 1
      );

      continue when occurrence < r.start_date or occurrence > horizon;
      continue when last_occ is not null and occurrence <= last_occ;

      insert into expenses (
        wallet_id, category_id, amount, spent_on, note, recurring_rule_id,
        net_worth_item_id, created_by
      )
      values (
        r.wallet_id, r.category_id, r.amount, occurrence, r.note, r.id,
        r.net_worth_item_id, auth.uid()
      )
      on conflict (recurring_rule_id, spent_on)
        where recurring_rule_id is not null
        do nothing;

      if found then
        created := created + 1;
      end if;
    end loop;

    if horizon is not null and (r.last_generated_on is null or horizon > r.last_generated_on) then
      update recurring_rules set last_generated_on = horizon where id = r.id;
    end if;
  end loop;

  return created;
end;
$$;
