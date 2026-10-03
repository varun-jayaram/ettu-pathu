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
generous without rewriting history.

**The month is app-wide**, in the header. It began as a stepper on Plan alone,
on the theory that Home and Reports should always show the live cycle — but a
month is a lens on the whole app, and having it on one tab meant Plan could show
September while Home showed August. It is a cookie rather than a URL parameter
because it is a *mode*, not a page: moving between tabs must not drop it, and
threading `?month=` through every link breaks the moment one link forgets.

The cost of a mode is that it can be forgotten, so being off the live cycle is
deliberately loud — amber label, a **Today** escape, a banner on Home, and no
"N days left" for a cycle that has not started.

**A new month starts with no budgets.** `0015` copied the previous month's
forward; `0017` removed that, and the reason is the Recurring/Budget split
again:

| | Carries itself? | Why |
|---|---|---|
| **Recurring** | yes | A rule isn't attached to a month at all. `materialize_recurring()` fires it every month until stopped. Nothing is copied for rent to appear in October. |
| **Budget** | no | A budget is a decision about *one month*. Copying last month's silently asserts you made that decision again. |

Pre-filled numbers nobody chose are worse than no numbers: they look
deliberate, so they never get revisited. Nothing is copied forward, so every
budget on the page is one somebody typed this month.

### Not in plan

**Plan lists every category, and an unbudgeted one is measured against the
plan it does have.** Hiding those rows hid the spending in them, and the
categories worth looking at hardest are the ones nobody has decided about yet.
Plan files all of them into three groups, which are just the Recurring/Budget
split used as a filing system:

| Group | Means | Measured against |
|---|---|---|
| **In plan** | a budget was set this month | the budget |
| **Recurring only** | no budget, but rules commit money here | the recurring floor — that money *is* planned, just not with a budget |
| **Not in plan** | neither | 0,00 €, so every euro spent is unplanned |

**A recurring category is never "not in plan", however unbudgeted.** Rent goes
out every month by design. Counting it as unplanned would make the biggest line
in the household its biggest surprise, and the number worthless.

**Going past an implied budget is AMBER, not red.** Red is for missing a target
you set; nothing was promised here. A page of red bars for every category the
household has never budgeted only teaches you to stop reading the colour.

Stored state is unchanged: no budget row is written until you save one, and
clearing a budget returns the category to Not in plan. This is a *display*
rule — `budgetState()` still reads `budgetCents <= 0` as "nothing to measure",
so Reports and Home's own bars are untouched; `BudgetBar` takes
`budgetSet={false}` to opt in.

**Home shows the total.** A "Not in plan" card sits under Expected expense with
the joint categories that have spending, no budget and no rule, biggest first.
Expected only ever adds up what was decided, so without its counterpart the
categories nobody thought about were the ones the dashboard never mentioned.
Joint wallets only — a personal wallet takes one wallet-scope budget by design,
so every one of its categories would otherwise land here — and the per-category
detail comes from `expenses`, which RLS already limits to rows this user may
read.

### Reports: running totals, not projections

**A category's chart is CUMULATIVE, and that is the whole point.** Expenses are
discrete events — six shops in thirty-one days. A line through daily amounts
dives to zero and back twenty-five times, drawing spending on the Tuesdays
nothing was spent. A running total only ever rises, every day carries a real
value, and the slope *is* the daily rate. The dashed reference line is the
category's budget, or its recurring floor when no budget was set — the same
order of precedence Plan uses.

It replaced a sentence reading "At this rate you'll finish the cycle around
2.480,32 €". A projection stated to the cent invites belief in a precision it
does not have: it is one number, derived from days elapsed, that swings wildly
in the first week and stops being news in the last. The line shows the rate and
lets you extend it yourself.

**The whole-cycle chart draws only what this user may read.** It sums
`expenses`, so a private wallet's contribution is missing from it while still
counting in the headline total above. The two genuinely differ, and the chart
says so rather than quietly reconciling them — the aggregate function returns
totals with no dates by design, so that money cannot be drawn and never will
be. Same reason the private lump on "Where it went" has no `items` and cannot
be expanded.

Charts live in one file, are server-rendered, and ship no client JS. The
expansion is a `<details>`, so it is keyboard-operable for free and works with
JS disabled.

### Cycle dates are adjustable, within two rules

**Set on the Income tab**, because income is what defines the cycle. It replaced
a "Pay cycle" box that asked for a day-of-the-month anchor: one number setting
every cycle at once, which could not express "September started late" — the case
that actually comes up. `setAnchorDay` is gone with it. `pay_anchor_day` survives
in `app_settings` as the fallback for months nobody has set by hand; the UI no
longer asks about it.

`period_starts` holds a hand-set start for a month; absent means "anchor day,
snapped to a logged payday" exactly as before, so the table stays empty until
someone actually moves something. A hand-set start beats both the anchor **and**
a nearby salary date — it is the one boundary a human asked for.

**Only the start is stored.** The end is always the day before the next cycle
begins, which makes a gap or an overlap *unrepresentable* rather than merely
discouraged.

Two rules, enforced as CHECK constraints in Postgres and explained by
`startDateProblem()` in the UI:

1. **A cycle named for month M ends within M** — September always ends by
   30 Sep. This is **structural, not checked**: a cycle ends the day before the
   next one begins, and the next one's own window forces it to start no later
   than the first of its month. There is no way to express a cycle that runs
   past its month.
2. **A cycle may start at most 35 days before it ends.** Deliberately longer
   than a calendar month: a payday that slips can stretch a cycle past 31 days
   without anything being wrong. Past 35 it is a mis-keyed date, not a late
   salary.

**The ceiling is measured back from the real end, not from the month's last
day** — `earliestStartFor(month, endsOn)`. Moving a start never moves its end,
so the end is the fixed point. Bounding by "35 days before 30 Sep" would give
27 Aug and reject **26 Aug**, the household's own anchor, for a September cycle
that actually ends on the 25th. The bound is then clamped to the CHECK
constraint's window so the two can never disagree.

Moving a start also moves the **previous** cycle's end, which is the half that
is easy to miss, so that length is checked too.

**None of this touches recurring rules.** `materialize_recurring()` reads
`recurring_rules` and the calendar; it has never read `budgets` or the pay cycle.
Rules keep firing on their day of every month regardless of how budgets or cycle
boundaries are edited.

Budgets are a single amount compared against `date_trunc('month', spent_on)` —
no per-month rows, no rollover balances, so a quiet month does not bank credit.
Editing a budget changes it for the current and future months. Historical
budget-vs-actual is out of scope for v1 and is additive later.

---

## Net worth: loans and investments

Every other screen answers *what moved?*. Net worth answers *where does that
leave us?* — it is the only place in the app that holds a **balance** rather
than a flow.

An entry is a loan or an investment with one number that matters:
**`current_amount`** — still owed, or worth now. It is **typed**, edited in a
box beside the entry (or folded in from tagged payments by the Apply button
below), and net worth is simply those numbers added up:

```
net worth = sum(investments.current_amount) − sum(loans.current_amount)
```

`total_amount` (the full loan, or a savings target) and `monthly_amount` are
optional and decorative: the first draws a progress bar, the second is displayed.
Nothing is computed from either.

### Two derivations were tried first, and both were wrong

This is the part worth remembering, because the instinct to derive is strong and
it was wrong twice.

| | How the balance was found | Why it failed |
|---|---|---|
| **0018** | infer it from an expense's **category** | Two loans paid out of Loans / EMI give a category total that cannot be split. The page showed a figure and then explained in amber that it did not know whose it was. |
| **0019** | sum the payments **tagged** to the entry | Exact, but only true once every payment had been tagged. The page filled up with warnings about its own inputs — "2.250,00 € is not assigned to anything yet" — and the user's verdict was "it's too confusing". |

**The common failure was the same both times: the number was a reward for
feeding the machine.** A household knows what it owes. Asking it to prove that
through bookkeeping, and nagging it when the bookkeeping was incomplete, is more
work than the number is worth.

**An investment settles the argument on its own.** Its value moves with the
market. No sum of contributions can ever express that a fund you paid 5.000 into
is now worth 5.400 — so for half the tab, a derivation is not merely
inconvenient, it is incapable of being right. Typing it is the only correct
answer, and once typing is right for investments it is right for loans too.

So `0020` made the balance a plain editable number, in a box on the tab itself.
Updating it is one keystroke and a Save, which is the *entire* interaction the
feature needs.

### Tagging makes a payment pending; Apply folds it in

`0020` left "Towards what" purely informational, and that went one step too far.
A 1.000 € payment was logged, tagged to the car loan, and the balance did not
move — correct by the rules, surprising in practice. The user wants to own the
number without doing the arithmetic.

So a tagged payment is **pending** until applied. The row reads
*"1.300,00 € tagged, not yet applied · Apply → 6.400,50 €"*, and one press folds
it into the balance — down for a loan, up for an investment.

**The typed field is untouched by this.** It is still editable at any time and
still wins; Apply writes into that same field. What it removes is the
subtraction, not the control. An automatic version was offered and declined, for
exactly that reason.

**"Don't apply" sits beside Apply**, quieter, and settles the payments without
touching the balance. `0022` added it because the common case turned out to be a
figure the user had already typed by hand: the payment was accounted for, and
the row went on offering to subtract it a second time. The only way out was to
apply it and then correct the figure back, which is worse than doing nothing.
The payment keeps its amount, its tag and its place in the Log; only the offer
goes away.

**Pending is remembered per payment, not recomputed.** `expenses.balance_applied_at`
records the fact, which is what stops a second press — or simply loading the page
next month — subtracting the same 1.300 € again. Without it every tag would look
pending forever.

It records *settled*, not *applied*, and there is deliberately **no second
column** for the dismissed case. The app asks that timestamp exactly one
question — "is this still pending?" — and the two ways of settling have no
different consequence anywhere: not in a balance, not in a total, not in the
Log. A second timestamp would have to be read everywhere the first one is, to
tell apart two states nothing distinguishes.

**Pending ignores the pay cycle**, unlike everything else on every other tab. A
payment tagged in September and never applied is still waiting in October;
scoping it to the month on screen would make money evaporate when the month
turned over. This is also why the whole tab ignores the header month: a balance
is a position, not a flow.

**There is no automatic reversal.** Deleting or editing a payment *after* it has
been applied does not rewind the balance — that needs a reversing ledger, which
is the machinery this feature has twice been simplified away from. The typed
field is the escape hatch, and the UI says so rather than leaving it to be
found.

**An untagged payment is still never reported.** It is not a problem to surface;
it is a payment somebody did not tag. Every warning about unassigned money went
with `0020`, along with the Log's `?untagged=` filter that existed only to serve
them.

### Shared, and the same on both phones

The user's choice was **shared**: both people see every loan and investment.
Implemented exactly like `income` — the row carries a `wallet_id` with the
ordinary four `is_wallet_member()` policies, and the server action resolves the
**joint** wallet itself. No new `SECURITY DEFINER` function was added.

Because the balance is typed rather than summed from private rows, the two
logins cannot disagree about it by construction — the earlier designs needed a
joint-wallet-only rule to guarantee that. The tagged-this-cycle line still reads
joint-wallet expenses only, for the same reason `0007` gave for `pay_anchors`.

### Progress, where there is something to measure

A bar is drawn only when `total_amount` was given — paid off against the full
loan, or value against the target. With no target there is **no bar at all**,
only the figure: a full bar would claim a goal was met and an empty one reads as
"nothing in" beside a label saying 5.400,00 €.

Two amber lines survive, because they are the only things the user cannot have
meant: a loan **past its end date** still showing a balance, and a loan pushed
**below zero** by applying more than was owed. Both suggest the fix. Applying is
deliberately not clamped at zero — a tidy zero would swallow a wrong tag or a
wrong figure. Everything else on this tab is a number somebody typed on purpose,
so there is nothing to correct them about.

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
