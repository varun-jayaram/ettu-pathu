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

### Totals are shared; detail is not

Neither person can see the other's personal **expenses**. They can see the
**total**. That line was moved deliberately: with rows fully hidden, each
phone's "Out" silently omitted whatever the other had spent, so the two devices
disagreed about how much the household had spent — which defeats the point of a
shared tracker.

`household_wallet_totals(from, to)` is a `SECURITY DEFINER` function that
returns per-wallet aggregates only: spent, saved, budgeted. It bypasses RLS by
design, so it is written so a leak is structurally impossible rather than
merely unlikely:

- it returns **aggregates only** — there is no row-returning path through it
- it takes **no filters** that could bisect a total down to a single
  transaction (no category, no note search, no narrower date range)
- it is granted to `authenticated` **only**, never to `anon`

**If this function ever grows a category or per-row output, the private wallet
stops being private.** Add a new function instead.

What stays private: categories, notes, dates, and individual amounts. What is
now shared: the per-wallet total, and for a PERSONAL wallet its budget progress
too. A total is itself information — this was accepted knowingly.

The joint wallet shows no budget bar on Home. It has no single budget to be
"progressing" against: its budgets are per category, so a wallet-level bar
measured every joint euro — rent, insurance, car service — against whichever
categories happened to carry one, and read `5.580,45 € / 600,00 €, over by
4.980,45 €`. Permanently red and saying nothing. The per-category bars above it
already answer "where am I over?" honestly.

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

### One flat list, no folders

`0014` removes `category_groups` entirely. 0011 had already stripped the meaning
out of it, leaving a pure folder — but a folder is not free. It forces every
screen to answer *at which level?*, and the two answers sat next to each other
looking like a contradiction:

> Plan showed **Recurring 2.482,02** (every rule, whatever folder) directly above
> **Committed 2.670,53 / 2.982,02** (this cycle's spend in one folder). Both
> numbers were correct. Neither was comparable to the other. The €188,51 gap was
> two folder-membership differences plus €482,70 of hand-entered spend.

The surviving folder was still *named* "Committed" — the exact label 0011 set out
to destroy, one heading away from the concept that replaced it.

So there is now **one level**. A category may carry a recurring rule, a budget,
both, or neither. Nothing sits above it. "Where did the money go?" and "what am I
over on?" are answered in the same units, which is the only way the two screens
can agree.

**~25 categories with a Misc escape hatch.** Past about this size people stop
categorising honestly at the moment of entry, and an entry you cannot file is an
entry you do not make. Misc is deliberate; a Misc that grows is the signal to
add a category.

### Savings counts as spending, but is shown apart

Savings and investments are **included** in every total — in "Out" and in
"Left". Putting money aside is not the same as still having it available.

They are nonetheless shown in their own box on Home, because *how much did we
keep* is a different question from *how much did we spend*. That split is driven
by **`categories.is_savings`** — and the distinction from the old `kind` is the
whole point:

| | `kind` (removed) | `is_savings` |
|---|---|---|
| Lives on | the group | the category |
| Decides | three unrelated things | one thing: which Home box |
| Survives renaming/regrouping | no | yes |

A category inherited `kind` from whichever folder it happened to sit in, which
is how Deutschlandticket became "variable". `is_savings` is set per category and
toggled in the app, so it cannot drift.

---

## Budgets

**Per wallet, one pay cycle, no rollover.**

- **Personal wallets take a single wallet-level budget** — one number for the
  whole wallet, no breakdown. "My spending money is 150." There is nothing to
  keep up to date, which is the only way a personal budget survives contact with
  real life.
- **The joint wallet takes category budgets**, because shared costs genuinely
  need breaking down — but only one level deep.

`budgets.scope` is therefore one of `wallet` / `category`, and the CHECK
constraint guarantees exactly one target.

> **The rule that keeps it coherent:** a category budget defines what **"over"**
> means, and it is the only thing that does.

Before `0014` there was a second, advisory level: group budgets defined "over"
and category sub-limits merely warned. That was one concept too many. Sub-limits
were never required to sum to their group, so the page could show a category in
the red inside a group that was comfortably fine — technically consistent,
unreadable in practice. With one level there is nothing to reconcile.

| Spend vs budget | State |
|---|---|
| < 80% | normal |
| 80–100% | approaching |
| > 100% | over |

### Expected expense = recurring + budgets, minus the overlap

Home carries an **Expected expense** box: what the month is committed to, as
opposed to what it has cost so far. It links to Plan, where both halves are set.

The two do not simply add. **A budget already contains its category's recurring
floor** — the Transport budget covers the Deutschlandticket, it is not on top of
it — so recurring that sits inside a budgeted category is subtracted back out:

```
recurring + budgets − (recurring inside a budgeted category)
```

The subtraction is shown as its own line rather than netted off silently,
because otherwise the two figures above it would visibly fail to add up.

Budget totals come from `household_wallet_totals`, not from `budgets`, so a
personal wallet's budget still counts even though its rows are invisible — the
same reason spend does.

### Recurring is a category's budget floor

A budget bar shows the category's recurring total as a marked floor, because
that money leaves whether or not anything else is spent. It is **not** folded
into "spent" — until the rule fires it has not been spent — but it is not
available either.

Without this the bar could read `0,00 € / 100,00 € · 100,00 € left` on a
Transport budget of 100,00 carrying a 126,00 Deutschlandticket. Not merely
optimistic: that budget was unmeetable the moment it was typed. A budget below
its own recurring total now says so outright and names the minimum.

Where there is headroom the bar reads *"474,00 € left after ↻ 126,00 €
recurring"* rather than a bare "left", so the committed part is never counted
as spendable.

### A budget belongs to a month

Since `0015` every budget carries `period_month` — **the first of the month the
cycle is named for**. A period is named for the month it *ends* in, so the
26 Aug–25 Sep cycle stores `2026-09-01`. That is a label, not a range; the real
boundaries are computed.

This is what lets you set September's budgets in August, and lets one month be
generous without rewriting history. Plan carries a month stepper; **Home and
Reports deliberately do not** — they always show the live cycle, so there is no
way to be looking at October's plan while believing it is where you stand.

**A new month starts with no budgets.** `0015` copied the previous month's
forward; `0017` removed that, and the reason is the Recurring/Budget split
again:

| | Carries itself? | Why |
|---|---|---|
| **Recurring** | yes | A rule isn't attached to a month at all. `materialize_recurring()` fires it every month until stopped. Nothing is copied for rent to appear in October. |
| **Budget** | no | A budget is a decision about *one month*. Copying last month's silently asserts you made that decision again. |

Pre-filled numbers nobody chose are worse than no numbers: they look
deliberate, so they never get revisited. An empty budget list means "not
decided yet" — never "zero".

### Cycle dates are adjustable, within two rules

`period_starts` holds a hand-set start for a month; absent means "anchor day,
snapped to a logged payday" exactly as before, so the table stays empty until
someone actually moves something. A hand-set start beats both the anchor **and**
a nearby salary date — it is the one boundary a human asked for.

**Only the start is stored.** The end is always the day before the next cycle
begins, which makes a gap or an overlap *unrepresentable* rather than merely
discouraged.

Two rules, enforced as CHECK constraints in Postgres and explained by
`startDateProblem()` in the UI:

1. **A cycle named for month M must end within M.** Enforced as: it must start
   between the first of M−1 and the first of M.
2. **No cycle may exceed 31 days.** A 32-day month is always a mistake.

**None of this touches recurring rules.** `materialize_recurring()` reads
`recurring_rules` and the calendar; it has never read `budgets` or the pay cycle.
Rules keep firing on their day of every month regardless of how budgets or cycle
boundaries are edited.

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
  expenses keep resolving their labels. Archiving a category hides it from
  quick-add while leaving every past expense intact. Foreign keys to
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
accumulate euros as floats. Every budget bar, category total and report on the
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
| Change what counts as spend | Nothing to change — every expense counts. `categories.is_savings` only picks which Home box it shows in. |
| Add a wallet | Insert into `wallets` + `wallet_members`. **No policy changes needed.** |
| Change budget thresholds | The 80% / 100% constants — keep them in one place. |
| Add a table | Create it, `enable row level security`, and add all four policies gated on `is_wallet_member(wallet_id)`. A table without policies is invisible; a table without RLS is public. |

---

## Out of scope for v1

All additive later without a rewrite: historical budget-vs-actual (per-month
budget rows), budget rollover, CSV import, receipt photos, multi-currency.
