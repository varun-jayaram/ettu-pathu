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
         ├─ expenses ──────── categories, net_worth_items?  (? = optional tag)
         ├─ recurring_rules ─ categories, net_worth_items?
         ├─ budgets ───────── categories | (whole wallet)
         └─ net_worth_items   ← a typed balance; derives nothing
```

- **Three wallets, two logins**: Varun / Shriya / Joint. Personal wallets have one
  member, Joint has both.
- **Recurring vs Budget** are the two independent ways money is committed. An
  expense is recurring if a rule created it (`recurring_rule_id is not null`) —
  read from the data, never a label. Any category can have either or both.
- **One flat list of ~25 categories.** `0014` dropped `category_groups`; there is
  no second level. Both recurring rules and budgets attach to a category.
- **Budgets** are per category and define "over". Personal wallets instead take
  one `scope = 'wallet'` budget — a single number, no breakdown.
- **Budgets belong to a month.** `period_month` is the first of the month the
  cycle is *named for* (the month it ends in). A new month starts with **no
  budgets** — nothing is copied forward (`0017`), because recurring already
  repeats itself and a budget is a per-month decision.
- **Net worth holds the only balances, and they are TYPED.**
  `net_worth_items.current_amount` — still owed, or worth now — is edited in a
  box on the tab, and net worth is those numbers added up. Nothing is derived.
  `total_amount` and `monthly_amount` are optional decoration (a progress bar,
  and a figure to display). `0018` inferred the balance from a category and
  `0019` from tagged payments; **both were replaced** — see PROJECT.md for why,
  the short version being that an investment's value moves with the market and
  no sum of contributions can say so.
- **"Towards what" makes a payment pending; Apply folds it in.**
  `expenses.net_worth_item_id`, set on Add, in the Log, or once on a recurring
  rule (which stamps it onto the rows it generates). Net worth shows
  "1.300,00 € tagged, not yet applied · Apply → …", and the balance moves only
  on that press — writing into the same field you can type, which still wins.
  **Don't apply** sits beside it and settles the payments without touching the
  figure, for when you already typed it yourself.
  `expenses.balance_applied_at` records *settled* either way, and is what stops
  a second press double-counting;
  pending ignores the pay cycle, and so does the whole tab. No automatic
  reversal if a payment is edited after applying. An untagged payment is never
  warned about. Shared like income: rows sit in the joint wallet.
- **The month is app-wide**, in the header, held in a cookie and read by every
  tab via `getActivePeriod()`. Off the live cycle it goes amber with a Today
  escape. Log follows it except while searching, which spans all cycles.
- **Cycle starts are adjustable** on the **Income** tab (income defines the
  cycle), stored in `period_starts`. Only the start is settable — the end is
  always the day before the next cycle, so gaps and overlaps cannot be
  expressed. Max 35 days, and a cycle must end inside the month it is named for.
  `pay_anchor_day` is the fallback for months nobody has set by hand.

## Layout

| Path | What lives there |
|---|---|
| `app/(app)/` | Authenticated pages — dashboard, add, expenses, reports, net-worth, settings |
| `app/login/` | The only unauthenticated route. There is no signup route, by design |
| `lib/supabase/` | `client.ts` (browser), `server.ts` (RSC + actions), `proxy.ts` (session refresh) |
| `proxy.ts` | Session refresh + route protection. **Next 16 renamed Middleware → Proxy** |
| `supabase/migrations/` | `0001_init` · `0002_rls` · `0003_seed` · `0004_recurring` · `0007` income+cycles · `0011` drops group `kind` · `0014` drops groups entirely · `0015` monthly budgets + adjustable cycle dates · `0017` no budget carry-forward · `0018` net worth · `0019` the expense names its loan · `0020` the balance is typed · `0021` tagged payments wait for Apply · `0022` and can be dismissed |

## Conventions

- **Never delete, archive.** `active` flags on categories, groups and recurring
  rules. Historical expenses must always resolve their labels.
- **Stable UUID keys, editable labels.** Renaming a category never breaks history.
- **Money is `numeric(12,2)`**, never float. Amounts are always positive; the
  wallet and category carry the meaning.
- **Server Components read, Server Actions write**, then `revalidatePath`.
- **Charts are hand-built** in `components/charts.tsx` — server-rendered
  HTML/CSS and inline SVG, no charting library and no client JS. Recharts is
  not a dependency and adding one is a decision, not a detail. Load the
  `dataviz` skill before writing chart code; the validated palette lives in
  `VizStyles`.
