@AGENTS.md

# Varavu Ettu Selavu Pathu (`ettu-pathu`)

> **Before changing anything, read [PROJECT.md](PROJECT.md).** It holds the design
> decisions and the rules that must not be broken. This file is only the map.

A private two-person expense tracker for Varun and Shriya. EUR only. Hosted at
0 EUR on Vercel Hobby + Supabase free tier.

## How to run it

```bash
npm install
npm run dev          # http://localhost:3000

supabase start       # local Postgres + Auth (needs Docker)
supabase db reset    # re-apply every migration from scratch, then seed
supabase db push     # apply migrations to the linked cloud project
```

Environment — copy `.env.example` to `.env.local`:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Safe to be public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Safe to be public — RLS is what protects the data |

**The `service_role` key never enters this repo, the client bundle, or any
`NEXT_PUBLIC_*` variable.** See PROJECT.md § Security.

## Data model

```
wallets ─┬─ wallet_members (wallet_id, user_id)   ← the entire privacy design
         ├─ expenses ──────── categories ── category_groups (folders)
         ├─ recurring_rules ─ categories
         └─ budgets ───────── category_groups | categories
```

- **Three wallets, two logins**: Varun / Shriya / Joint. Personal wallets have one
  member, Joint has both.
- **Recurring vs Budget** are the two independent ways money is committed. An
  expense is recurring if a rule created it (`recurring_rule_id is not null`) —
  read from the data, never a label. Any category can have either or both.
- **Budgets** work on any group or category; group budgets define "over",
  category rows are advisory sub-limits.
- Category groups are **folders only** — they imply nothing about behaviour.

## Layout

| Path | What lives there |
|---|---|
| `app/(app)/` | Authenticated pages — dashboard, add, expenses, reports, settings |
| `app/login/` | The only unauthenticated route. There is no signup route, by design |
| `lib/supabase/` | `client.ts` (browser), `server.ts` (RSC + actions), `proxy.ts` (session refresh) |
| `proxy.ts` | Session refresh + route protection. **Next 16 renamed Middleware → Proxy** |
| `supabase/migrations/` | `0001_init` · `0002_rls` · `0003_seed` · `0004_recurring` · `0007` income+cycles · `0011` drops group `kind` |

## Conventions

- **Never delete, archive.** `active` flags on categories, groups and recurring
  rules. Historical expenses must always resolve their labels.
- **Stable UUID keys, editable labels.** Renaming a category never breaks history.
- **Money is `numeric(12,2)`**, never float. Amounts are always positive; the
  wallet and category carry the meaning.
- **Server Components read, Server Actions write**, then `revalidatePath`.
- Charts use Recharts — load the `dataviz` skill before writing chart code.
