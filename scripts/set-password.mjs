/**
 * Sets a password directly on an account, and marks the email confirmed so the
 * account can sign in immediately.
 *
 * This bypasses the invite flow. It exists because Supabase's built-in SMTP is
 * rate limited to ~2 emails/hour, which made bootstrapping painful. It is a
 * bootstrap tool, not part of normal operation — the app's own /set-password
 * page is how passwords should be changed from here on.
 *
 * Passwords passed on the command line land in your shell history. Clear it
 * afterwards, and change these to something you actually chose:
 *
 *   history -d <line>   (or `history -c` for the lot)
 *
 * Usage from the project root:
 *
 *   SUPABASE_SERVICE_ROLE_KEY='sb_secret_...' node scripts/set-password.mjs \
 *     someone@example.com:'their-password'
 */

const supabaseUrl = 'https://rujhyijsoeezcclsladc.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const pairs = process.argv.slice(2)

if (!key) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. See the header of this file.')
  process.exit(1)
}
if (pairs.length === 0) {
  console.error("Pass one or more 'email:password' pairs.")
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

const listed = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200`, { headers })
if (!listed.ok) {
  console.error(`Could not list users: ${listed.status} ${listed.statusText}`)
  process.exit(1)
}
const { users } = await listed.json()

for (const pair of pairs) {
  // Split on the FIRST colon only — passwords may legitimately contain one.
  const separator = pair.indexOf(':')
  const email = pair.slice(0, separator)
  const password = pair.slice(separator + 1)

  const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.log(`${email}  NOT FOUND`)
    continue
  }

  const updated = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  })

  if (updated.ok) {
    console.log(`${email}  password set, email confirmed`)
  } else {
    const body = await updated.json().catch(() => ({}))
    console.log(`${email}  FAILED: ${body.msg ?? updated.statusText}`)
  }
}

console.log('\nSign in at http://localhost:3000/login')
console.log('Change it any time at /set-password while signed in.')
