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

## Categories: two levels, and why

**Groups carry the meaning, categories carry the detail.** You budget and read
reports at the group level; you search and tag at the category level.

`kind` lives on the **group, not the category**, so the fixed-vs-variable split
is declared once and cannot drift between two categories that mean the same
thing.

| `kind` | Meaning | Budgeted? | In spend totals? |
|---|---|---|---|
| `committed` | The monthly floor — contractual | No | Yes |
| `variable` | The only spend worth budgeting | Yes | Yes |
| `transfer` | Money moved, not money burnt | No | **No** |

- **`committed` is your monthly floor.** Summed, it is the number you must earn
  before anything else — the left-hand side of the proverb. A budget on rent is
  theatre, so it is shown as a floor, not a bar you can beat.
- **`variable` is the only spend worth budgeting.** A budget on dining out
  changes behaviour. The dashboard leads with variable spend for that reason.
- **`transfer` keeps savings out of spend.** Otherwise a good savings month reads
  as a blowout. This exclusion lives in **one shared query helper**
  (`kind <> 'transfer'`), never repeated per report — if you add a report, use
  the helper.

### Family support is split across two groups, deliberately

The regular monthly transfer to India is a fixed commitment and belongs in the
floor, so it sits in **Committed** with a recurring rule filling it in. Occasional
or emergency help is not predictable, so it sits in **Personal** as *Family
support — extra*.

These are **two separate categories, not one category in two groups**. A category
has exactly one `group_id`, which is precisely what guarantees group totals sum
to the month total with nothing double-counted. The split also earns its keep in
reports: a rising *extra* line against a flat *monthly* line is a real signal you
would otherwise never see.

**Neither is a `transfer`** — unlike savings, this money leaves the household for
good, so it is genuine spend.

### Why ~25 categories

Past roughly this size, people stop categorising honestly at the moment of entry,
and an entry you cannot file is an entry you do not make. **Misc is deliberate,
not a failure** — a Misc that grows is the signal to add a category.

---

## The household model: income shared, spending private

This is the asymmetry the whole app is built around, and it was decided
deliberately:

| | |
|---|---|
| **Income** | **Shared** — both see every euro coming in |
| **Personal wallets** | **Private** — neither sees the other's spending |
| **Joint wallet** | **Shared** — what you spend together |

Money is pooled; discretion is not. `income` therefore has `using (true)`
policies like the category taxonomy, while `expenses` stays gated on
`is_wallet_member()`.

`income.wallet_id` records *which account the money landed in* — attribution,
not a privacy boundary. Either person may log either salary.

**A design that was built and then deleted:** the first version modelled income
as wallet-private, mirroring expenses. That forced a separate shared
`pay_anchors` table holding only dates, so both phones could agree on the cycle
boundary without leaking the amount. Once income became shared that table was
pure overhead, and `0008` drops it. If income is ever made private again, that
problem comes back — the boundary must be derivable by both users, or the same
cycle shows different totals on each phone.

---

## Pay-cycle periods, not calendar months

The household is paid **between the 25th and 27th**. On calendar months the
last ~5 days of every month were funded by the *next* salary, and the budget
reset five days after payday.

A period runs from an **anchor day** (default the 26th, configurable) to the
day before the next one, and is **named for the month it ends in** — 26 Aug–25
Sep is "September". When a salary is logged within a window (default 7 days) of
a boundary, the boundary **snaps to the real payday**; otherwise the anchor
stands.

**Why not a literal rolling 30 days**, which is what was asked for first:
12 × 30 = 360, so periods drift backwards ~5 days a year, eventually putting
two period starts in one calendar month and none in another. "What did I spend
in September" stops having an answer. The anchor keeps exactly one period per
month, so month-over-month comparison survives.

**Two traps, both covered by `tests/period.test.mjs`:**

- **Clamp short months.** An anchor of the 31st must become the 28th in
  February, not roll into March.
- **Snap before choosing the cycle, never after.** An earlier version picked
  the cycle from the unsnapped anchor and snapped afterwards, which could move
  a boundary out from under today and return a period that did not contain it
  (salary on the 24th, anchor the 26th, viewed on the 25th → "26 Jul–23 Aug").
  Boundaries are now all computed with snapping applied, then the cycle
  containing today is selected.

Recurring rules stay **calendar**-based: rent is due on the 1st whether or not
that falls mid-cycle. Only the reporting and budget period changed.

---

## Budgets

**Per wallet, at group level, one pay cycle, no rollover.** Roughly four numbers
per wallet — few enough that they will actually be kept current.

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
