-- 0005_revoke_anon.sql — take the unauthenticated role off the tables entirely
--
-- Hosted Supabase projects ship with default privileges that grant `anon`
-- (the unauthenticated role) access to tables created in the public schema.
-- Nothing in 0002 asked for that, and it is not present on a local
-- `supabase db reset` — so hosted and local behaved differently, which is
-- exactly the kind of drift that makes a security model untestable.
--
-- With those grants in place the app was still safe: no policy in 0002 targets
-- `anon`, so RLS returned zero rows. But that is a single layer of defence,
-- and it means one mis-scoped policy written months from now (`to public`
-- instead of `to authenticated`) would leak data to anyone holding the
-- publishable key — which is, by design, everyone.
--
-- Revoking the grants restores the two independent gates: an unauthenticated
-- request now fails at the grant check and never reaches a policy at all.
--
-- The app is unaffected. Every application query runs as `authenticated`;
-- login and password reset use the /auth/v1 endpoints, which do not go through
-- PostgREST table grants.

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all routines  in schema public from anon;

-- Stop the same grants being reapplied to anything created later.
--
-- Only `postgres` is named here. Default privileges can only be altered by the
-- role that owns them, and migrations run as `postgres` — attempting the same
-- for `supabase_admin` fails with "permission denied to change default
-- privileges". That is fine in practice: migrations and the SQL editor both
-- create objects as `postgres`, so this covers everything this project will
-- actually create. A table somehow created by another role would still need
-- its own explicit `enable row level security` regardless.
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on routines  from anon;
