/**
 * The privacy test, run against the LIVE database with two real accounts.
 *
 * This is the check the whole design exists to pass: it queries PostgREST
 * directly with each user's JWT, so it proves the data is unreachable at the
 * API layer — not merely hidden by the UI. It uses only the publishable key,
 * exactly like the browser does. The service_role key would bypass RLS and
 * prove nothing.
 *
 * It writes a handful of probe rows and deletes them again at the end.
 *
 *   VARUN_PASSWORD='...' SHRIYA_PASSWORD='...' node scripts/verify-privacy.mjs
 */

const url = 'https://rujhyijsoeezcclsladc.supabase.co'
const anon = 'sb_publishable_nFicGIhYVMmeQ-YNrUpSbQ_JBlNo0s-'

const accounts = {
  varun: { email: 'varun.jayaram@gmail.com', password: process.env.VARUN_PASSWORD },
  shriya: { email: 'shriya.be@gmail.com', password: process.env.SHRIYA_PASSWORD },
}

const NOTE = 'privacy-probe'
let failures = 0

function check(label, passed, detail = '') {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!passed) failures++
}

async function signIn({ email, password }) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`${email}: ${body.error_description ?? body.msg}`)
  return body.access_token
}

async function rest(path, token, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    },
  })
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: response.status, ok: response.ok, body }
}

const varun = await signIn(accounts.varun)
const shriya = await signIn(accounts.shriya)
console.log('Both accounts signed in.\n')

// --- What each user can see -------------------------------------------------
const varunWallets = (await rest('wallets?select=id,name,kind', varun)).body
const shriyaWallets = (await rest('wallets?select=id,name,kind', shriya)).body

check(
  'Varun sees exactly 2 wallets (his own + Joint)',
  varunWallets.length === 2,
  varunWallets.map((w) => w.name).join(', '),
)
check(
  'Shriya sees exactly 2 wallets (her own + Joint)',
  shriyaWallets.length === 2,
  shriyaWallets.map((w) => w.name).join(', '),
)

const varunPersonal = varunWallets.find((w) => w.kind === 'personal')
const joint = varunWallets.find((w) => w.kind === 'joint')
const shriyaPersonal = shriyaWallets.find((w) => w.kind === 'personal')

check(
  "Varun cannot see Shriya's personal wallet",
  !varunWallets.some((w) => w.id === shriyaPersonal.id),
)

// --- Categories are shared --------------------------------------------------
const categories = (await rest('categories?select=id,name&limit=500', varun)).body
check('Shared taxonomy readable (25 categories)', categories.length === 25, `${categories.length} found`)
const snacks = categories.find((c) => c.name === 'Snacks & coffee')
const savings = categories.find((c) => c.name === 'Savings')
const misc = categories.find((c) => c.name === 'Misc / uncategorised')

// --- Varun writes one private and one joint expense -------------------------
const today = new Date().toISOString().slice(0, 10)

await rest('expenses', varun, {
  method: 'POST',
  body: JSON.stringify({
    wallet_id: varunPersonal.id,
    category_id: snacks.id,
    amount: 50.0,
    spent_on: today,
    note: `${NOTE}-private`,
  }),
})
await rest('expenses', varun, {
  method: 'POST',
  body: JSON.stringify({
    wallet_id: joint.id,
    category_id: snacks.id,
    amount: 20.0,
    spent_on: today,
    note: `${NOTE}-joint`,
  }),
})

// --- THE TEST ---------------------------------------------------------------
const shriyaSees = (await rest('expenses?select=note,amount', shriya)).body
const notes = shriyaSees.map((e) => e.note)

check(
  "Shriya CANNOT read Varun's personal expense",
  !notes.includes(`${NOTE}-private`),
  `she sees: [${notes.join(', ')}]`,
)
check('Shriya CAN read the joint expense', notes.includes(`${NOTE}-joint`))

// --- Can Shriya write into Varun's wallet? ----------------------------------
const intrusion = await rest('expenses', shriya, {
  method: 'POST',
  body: JSON.stringify({
    wallet_id: varunPersonal.id,
    category_id: snacks.id,
    amount: 999,
    spent_on: today,
    note: `${NOTE}-intrusion`,
  }),
})
check(
  "Shriya CANNOT write into Varun's wallet",
  intrusion.status === 403 || intrusion.status === 401,
  `HTTP ${intrusion.status}`,
)

// --- Transfers excluded from spend, and money is exact ----------------------
await rest('expenses', varun, {
  method: 'POST',
  body: JSON.stringify({
    wallet_id: varunPersonal.id,
    category_id: savings.id,
    amount: 500.0,
    spent_on: today,
    note: `${NOTE}-savings`,
  }),
})
for (let i = 0; i < 3; i++) {
  await rest('expenses', varun, {
    method: 'POST',
    body: JSON.stringify({
      wallet_id: varunPersonal.id,
      category_id: misc.id,
      amount: 0.1,
      spent_on: today,
      note: `${NOTE}-cent`,
    }),
  })
}

const withKind = (
  await rest(
    `expenses?select=amount,note,categories(category_groups(kind))&note=like.${NOTE}*`,
    varun,
  )
).body

/**
 * Sum in integer cents, never in floats.
 *
 * PostgREST returns numeric(12,2) as a STRING ("0.10") precisely so no
 * precision is lost in transit. Doing Number(a) + Number(b) throws that away:
 * 0.10 + 0.10 + 0.10 === 0.30000000000000004 in IEEE 754. The column is exact;
 * only JavaScript is not.
 *
 * This is the rule the app has to follow too — see PROJECT.md § Money.
 */
const toCents = (amount) => Math.round(Number(amount) * 100)
const sumCents = (rows) => rows.reduce((total, e) => total + toCents(e.amount), 0)

const spend = sumCents(
  withKind.filter((e) => e.categories.category_groups.kind !== 'transfer'),
)
const cents = sumCents(withKind.filter((e) => e.note === `${NOTE}-cent`))

check('€500 savings excluded from spend total', !withKind.some(
  (e) => e.note === `${NOTE}-savings` && e.categories.category_groups.kind !== 'transfer',
))
check('0.10 × 3 === 0.30 exactly', cents === 30, `got ${(cents / 100).toFixed(2)}`)
check('Spend total excludes the transfer', spend === 7030, `€${(spend / 100).toFixed(2)}`)

// --- Cleanup ----------------------------------------------------------------
await rest(`expenses?note=like.${NOTE}*`, varun, { method: 'DELETE' })
await rest(`expenses?note=like.${NOTE}*`, shriya, { method: 'DELETE' })
const leftover = (await rest(`expenses?select=id&note=like.${NOTE}*`, varun)).body
check('Probe rows cleaned up', leftover.length === 0, `${leftover.length} left`)

console.log(
  failures === 0
    ? '\nAll checks passed. Personal wallets are private at the database layer.'
    : `\n${failures} CHECK(S) FAILED.`,
)
process.exit(failures === 0 ? 0 : 1)
