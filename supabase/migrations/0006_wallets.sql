-- 0006_wallets.sql — the three wallets and their memberships
--
-- Deliberately derives everything from auth.users rather than hard-coding
-- email addresses: the repo is public, and two personal Gmail addresses in a
-- committed file is a small but permanent leak. It also means this migration
-- stays correct on a fresh database without editing.
--
-- Personal wallet names come from the first dot-segment of the local part
-- (varun.jayaram@… -> "Varun"). They are ordinary editable labels — rename
-- them in Settings whenever; the stable UUID is what everything references.
--
-- Wallets and memberships are intentionally NOT writable from the app (no
-- insert policy exists on either table), so this migration and the service
-- role are the only things that can create them. That is what stops a user
-- adding themselves to the other's wallet.

do $$
declare
  joint_wallet_id uuid;
begin
  -- One personal wallet per account, owned by that account.
  insert into wallets (name, kind, owner_id)
  select
    initcap(split_part(split_part(u.email, '@', 1), '.', 1)),
    'personal',
    u.id
  from auth.users u
  where not exists (
    select 1 from wallets w
    where w.owner_id = u.id and w.kind = 'personal'
  );

  -- The owner is the sole member of their own personal wallet. This single
  -- row is what makes "personal is private" true.
  insert into wallet_members (wallet_id, user_id)
  select w.id, w.owner_id
  from wallets w
  where w.kind = 'personal' and w.owner_id is not null
  on conflict do nothing;

  -- Exactly one joint wallet, owned by nobody.
  select id into joint_wallet_id from wallets where kind = 'joint' limit 1;

  if joint_wallet_id is null then
    insert into wallets (name, kind, owner_id)
    values ('Joint', 'joint', null)
    returning id into joint_wallet_id;
  end if;

  -- Everyone is a member of the joint wallet.
  insert into wallet_members (wallet_id, user_id)
  select joint_wallet_id, u.id from auth.users u
  on conflict do nothing;

  raise notice 'wallets: %, memberships: %',
    (select count(*) from wallets),
    (select count(*) from wallet_members);
end $$;
