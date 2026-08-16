-- 0004_recurring.sql — lazy materialisation of recurring expenses
--
-- Rent, insurance and subscriptions are entered once as a recurring_rule and
-- turned into real `expenses` rows here. Called on app load.
--
-- Why lazy generation instead of a cron job: zero moving parts, nothing to
-- monitor, no scheduler to fail silently, and the numbers are always correct
-- at the moment you look at them. If a scheduled push is ever wanted, Supabase
-- pg_cron can call this same function without changing the model.
--
-- Generated rows are ordinary expenses — editable and deletable — linked back
-- via recurring_rule_id so they are recognisable in the log.
--
-- SECURITY INVOKER (the default) is deliberate: the function runs as the
-- calling user, so RLS applies and a user can only ever materialise rules in
-- wallets they belong to.

create function public.materialize_recurring() returns integer
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
    -- Never generate into the future, and never past the rule's end date.
    horizon  := least(current_date, coalesce(r.end_date, current_date));
    last_occ := r.last_generated_on;

    for month in
      select generate_series(
        date_trunc('month', r.start_date),
        date_trunc('month', horizon),
        interval '1 month'
      )::date
    loop
      -- Clamp day_of_month to the length of this month, so a rule dated the
      -- 31st still fires in February (on the 28th/29th) rather than skipping.
      occurrence := month + (
        least(
          r.day_of_month,
          extract(day from (month + interval '1 month' - interval '1 day'))::integer
        ) - 1
      );

      continue when occurrence < r.start_date or occurrence > horizon;
      -- The idempotency guard: anything at or before last_generated_on has
      -- already been materialised.
      continue when last_occ is not null and occurrence <= last_occ;

      -- Backstop against races: the partial unique index on
      -- (recurring_rule_id, spent_on) makes a duplicate impossible even if two
      -- page loads run this concurrently.
      insert into expenses (
        wallet_id, category_id, amount, spent_on, note, recurring_rule_id, created_by
      )
      values (
        r.wallet_id, r.category_id, r.amount, occurrence, r.note, r.id, auth.uid()
      )
      on conflict (recurring_rule_id, spent_on)
        where recurring_rule_id is not null
        do nothing;

      if found then
        created := created + 1;
      end if;
    end loop;

    -- Advance the watermark to the last occurrence actually considered.
    if horizon is not null and (r.last_generated_on is null or horizon > r.last_generated_on) then
      update recurring_rules set last_generated_on = horizon where id = r.id;
    end if;
  end loop;

  return created;
end;
$$;

revoke all on function public.materialize_recurring() from public;
grant execute on function public.materialize_recurring() to authenticated;
