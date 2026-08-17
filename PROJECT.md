# PROJECT.md — design decisions and rationale

> **வரவு எட்டணா, செலவு பத்தணா** — *income eight annas, expenses ten.*
> The Tamil proverb for living beyond your means. This is the app that watches
> that gap, in EUR, for two people.

This file records *why* the app is shaped the way it is. [CLAUDE.md](CLAUDE.md)
describes *what* it is. When the two disagree, this file wins.

---

## What this is

A private expense and budget tracker for two people — Varun and Shriya. Not a
product. There is no revenue to justify any recurring cost, so **0 EUR hosting is
a hard requirement**, not a preference.

| Service | Tier | Why it stays free |
|---|---|---|
| Vercel | Hobby | Free for non-commercial personal use. Deploys from GitHub on push. |
| Supabase | Free | 500 MB Postgres, 50k MAU, Auth + RLS included. Two users will never approach a limit. |
| Domain | `*.vercel.app` | A custom domain is the one thing that always costs money — skipped. |

**Two honest caveats.** Supabase free projects pause after ~7 days of no
activity; used regularly this never fires, and unpausing retains all data.
Vercel Hobby forbids commercial use, which is fine here.

---

## Security: the one thing that must never regress

The predecessor app (`claude-project`, the Streamlit habit tracker) enforced
privacy in *application code* against a shared Supabase key. Its own README lists
"true per-user DB isolation (Supabase Auth + RLS)" as the not-yet-built v3 idea.
**This app builds that properly from day one, and that is the whole reason it
exists as a new codebase rather than a feature added to the old one.**

In one sentence: the browser only ever holds the Supabase *anon* key plus the
logged-in user's JWT, and every table's RLS policy asks "is this user a member of
this row's wallet?" — so a public repo and a public URL leak nothing.

### Rules that must not be broken

1. **The `service_role` key never enters the repo, the client bundle, or any
   `NEXT_PUBLIC_*` variable.** The anon key is designed to be public; the
   service_role key bypasses RLS entirely.
2. **Privacy is enforced in Postgres, never in application code.** If you find
   yourself writing `if (wallet.owner_id === user.id)` in TypeScript to hide
   data, the policy is wrong — fix the policy. App-layer checks are a UX
   nicety; they are not the security boundary.
3. **RLS stays enabled on every table**, with no policy left permissive by
   default.
4. **Public signup stays permanently disabled.** There is no signup route and no
   window in which a stranger who found the URL could register.

### Why `is_wallet_member()` is SECURITY DEFINER

A policy on `wallet_members` that queries `wallet_members` recurses infinitely.
The helper runs as its owner, bypassing RLS on the table it reads, which breaks
the cycle. It sets `search_path = public` so a caller cannot shadow
`wallet_members` with their own table and trick it into returning true. Both
properties are load-bearing — do not remove either.

---

## The privacy model: `wallet_members` is the design

Three wallets, two logins: **Varun**, **Shriya**, **Joint**.

- A personal wallet has exactly **one** member — its owner.
- The joint wallet has **both**.

Every policy reduces to a membership check, so "personal is private, joint is
shared" **falls out of the data** rather than being re-implemented per query.
Adding a wallet later (a shared holiday pot, say) needs no new policies at all —
only new rows.

Wallets and memberships are seeded once by the operator via the service role and
are deliberately **not writable from the app**: there is no insert policy on
either table, so a user cannot add themselves to a wallet.

Neither person can see the other's personal expenses. This is a stated product
decision, and it has a consequence worth remembering: **there is deliberately no
household-wide budget**, because computing one would require exposing each
other's personal spend.

---

## The model: Recurring and Budget

Money committed ahead of time comes in exactly two forms, and they are
independent:

| | What it means | Example |
|---|---|---|
| **Recurring** | It goes out every month regardless | Rent, insurance, loans, subscriptions, Deutschlandticket, donation, savings |
| **Budget** | A target you might miss | Groceries, petrol, eating out, films |

**Any category can be either, both, or neither.** A category with a recurring
rule *and* a budget is fine — the recurring amount simply counts towards the
budget like any other spending.

### What this replaced, and why

The first version put a `kind` column on `category_groups` —
`committed` / `variable` / `transfer` — and made it carry three jobs at once:
what could be budgeted, how Home was split, and what counted as spending.

**That axis was wrong, and it produced a visibly wrong number.** A cost is
fixed because it *recurs*, not because someone filed it under a group labelled
"Committed". Deutschlandticket, Netflix, Prime and a bank fee all landed in
`variable` groups purely because Transport sits under Essentials and
Entertainment under Lifestyle — so Home reported €141,89 of "variable" spending
that was in fact four fixed monthly charges nobody could choose to reduce.

`0011` drops the column. **Recurring-ness is now read from the data**: an
expense is recurring if a rule created it (`recurring_rule_id is not null`).
That cannot drift, because it is not a label anyone applies by hand.

### Groups are folders, not meanings

The two-level taxonomy stays — groups exist to organise ~25 categories and to
let one budget cover several of them. They imply nothing about how money
behaves.

**~25 categories with a Misc escape hatch.** Past about this size people stop
categorising honestly at the moment of entry, and an entry you cannot file is an
entry you do not make. Misc is deliberate; a Misc that grows is the signal to
add a category.

### Everything counts as spending

Savings and investments used to be excluded from every total. That is gone, at
the user's explicit request: one rule, no exceptions to explain. The argument
against — that a good savings month then reads as a blowout — was put and
declined. If it is ever reinstated, do it as an explicit flag on the category,
not as a group label, or the same drift returns.

---

## Budgets

**Per wallet, one pay cycle, no rollover.** Set on any group, any category, or
both — nothing is off-limits, since no group is privileged any more.

> **The rule that keeps it coherent:** a group budget defines what **"over"**
> means. A category sub-limit only **warns** — it never creates a second,
> competing definition of over.

This avoids the usual nested-budget mess: sub-limits are **not** required to sum
to the group budget, so there is no reconciliation to do and no state where the
dashboard contradicts itself. A sub-limit is a tripwire inside the group, not a
budget in its own right.

| Spend vs budget | State |
|---|---|
| < 80% | normal |
| 80–100% | approaching |
| > 100% | over |

Budgets are a single amount compared against `date_trunc('month', spent_on)` —
no per-month rows, no rollover balances, so a quiet month does not bank credit.
Editing a budget changes it for the current and future months. Historical
budget-vs-actual is out of scope for v1 and is additive later.

---

## Recurring expenses: why lazy, not cron

Rules are materialised into real `expenses` rows by `materialize_recurring()`,
called on app load and guarded by `last_generated_on`.

**Why not `pg_cron`:** zero moving parts, nothing to monitor, no scheduler to
fail silently, and the numbers are always correct at the moment you look at them.
If a scheduled push is ever wanted, pg_cron can call the same function without
changing the model.

Two independent idempotency guards, both intentional: the `last_generated_on`
watermark, and a **partial unique index** on `(recurring_rule_id, spent_on)` that
makes a duplicate impossible even if two page loads race. The index is partial so
hand-entered expenses are never constrained by it.

`day_of_month` is clamped to the length of each month, so a rule dated the 31st
still fires in February rather than silently skipping it.

Generated rows are ordinary expenses — editable and deletable — linked back via
`recurring_rule_id` so they are recognisable in the log.

---

## Accounts and passwords

The intent is that **Varun and Shriya each choose their own password**, and the
app is built for that: `/set-password` changes it from inside the app at any
time.

**What actually happened at bootstrap, recorded honestly:** Supabase's built-in
SMTP is rate limited to ~2 emails/hour and the invite links proved fiddly, so
the two accounts were given **temporary passwords** set via
`scripts/set-password.mjs` at the user's explicit request. Those passwords
follow a weak, guessable pattern and are **due to be changed** at `/set-password`.
Until they are, they are the weakest part of this system — everything else here
is enforced by Postgres.

The original design — accounts created **by email address only**, each person
following a one-time link to choose their own password — is still the right one,
and `scripts/generate-auth-links.mjs` can produce those links without sending
email at all. Settings then exposes
`supabase.auth.updateUser({ password })`, which works while logged in and needs
no email at all — which is why an in-app password change matters more here than
a forgot-password flow.

**Email caveat:** Supabase's built-in email is rate-limited and by default
delivers reliably only to project team members — fine for two invites and the
occasional reset, and both addresses are added as project members. If delivery
turns flaky, Resend's free tier as custom SMTP is a ~10 minute change touching
Supabase config only, not application code.

**Lockout backstop:** the Supabase dashboard can always issue a fresh invite.

---

## Conventions carried over from `claude-project`

These worked there and are kept deliberately:

- **Never delete, archive.** `active` flags rather than `DELETE`, so historical
  expenses keep resolving their labels. Archiving a group hides its categories
  from quick-add while leaving every past expense intact. Foreign keys to
  `categories` are `on delete restrict` to enforce this at the database level.
- **Stable UUID keys, editable labels.** Renaming a category never breaks
  history — the same rule as never renaming a `habit_key`.
- **Money is `numeric(12,2)`, never float.** Amounts are always positive; the
  wallet and category carry the meaning, not the sign.
- **Secrets never in code.**

### Money: the database is exact, JavaScript is not

`numeric(12,2)` guarantees exactness *in Postgres*, and PostgREST deliberately
returns those values as **strings** (`"0.10"`) so nothing is lost in transit.
The moment application code does `Number(a) + Number(b)` that guarantee is gone:

```js
0.10 + 0.10 + 0.10 === 0.30000000000000004   // IEEE 754
```

This was caught by the live privacy test, which reported a spend total of
`€70.29999999999998`. The column was never wrong — the test's own arithmetic
was.

**The rule:** totals are computed in **SQL** (`sum(amount)`), or, where a
running total must happen client-side, in **integer cents**
(`Math.round(Number(amount) * 100)`) and formatted back only for display. Never
accumulate euros as floats. Every budget bar, group total and report on the
dashboard depends on this.

---

## Framework note: this is Next.js 16, not 15

The original plan specified Next.js 15; the scaffold is **16.3.1**. The
difference that matters:

- **Middleware is now Proxy.** The root file is `proxy.ts`, not `middleware.ts`,
  and it exports `proxy` (or a default). Functionality is unchanged.
- `cookies()` is async — `await cookies()` — as in 15.

`AGENTS.md` (written and refreshed by `next dev`) instructs any agent to read
`node_modules/next/dist/docs/` before writing code rather than relying on
training data. Do that; the docs ship with the installed version and are
therefore always correct for this repo.

---

## How to change common things

| Task | Where |
|---|---|
| Add or rename a category | Settings UI, or `0003_seed.sql` for a fresh database. Never change a UUID. |
| Retire a category | Set `active = false`. **Never `DELETE`** — history depends on it. |
| Change what counts as spend | `category_groups.kind`, plus the single `kind <> 'transfer'` query helper. |
| Add a wallet | Insert into `wallets` + `wallet_members`. **No policy changes needed.** |
| Change budget thresholds | The 80% / 100% constants — keep them in one place. |
| Add a table | Create it, `enable row level security`, and add all four policies gated on `is_wallet_member(wallet_id)`. A table without policies is invisible; a table without RLS is public. |

---

## Out of scope for v1

All additive later without a rewrite: historical budget-vs-actual (per-month
budget rows), budget rollover, CSV import, receipt photos, multi-currency.
