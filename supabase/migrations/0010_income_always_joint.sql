-- 0010_income_always_joint.sql — income belongs to the joint wallet, always
--
-- Income is pooled household money. Asking which wallet it landed in was a
-- choice that could only be answered wrongly: a salary filed against a personal
-- wallet misattributes shared money, and would make the per-wallet spend
-- figures read as though one person earned nothing.
--
-- The form no longer offers the choice, but a UI that omits a field is not a
-- guarantee — anything holding a JWT can POST to PostgREST directly. So this is
-- enforced in the database, consistent with the rest of the project: privacy
-- and invariants live in Postgres, not in application code.
--
-- The trigger OVERWRITES rather than rejects. A wrong wallet here is not an
-- attack to repel, it is a field that should never have existed; silently
-- routing it to the right place is kinder than an error nobody can act on.

-- Move anything already recorded.
update income
set wallet_id = (select id from wallets where kind = 'joint' limit 1)
where wallet_id <> (select id from wallets where kind = 'joint' limit 1);

create function public.income_force_joint_wallet() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  joint_id uuid;
begin
  select id into joint_id from wallets where kind = 'joint' limit 1;

  -- No joint wallet on a fresh database: leave the row alone rather than
  -- nulling a not-null column.
  if joint_id is not null then
    new.wallet_id := joint_id;
  end if;

  return new;
end;
$$;

create trigger income_force_joint_wallet
  before insert or update on income
  for each row execute function public.income_force_joint_wallet();
