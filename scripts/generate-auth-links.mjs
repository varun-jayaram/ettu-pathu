/**
 * Generates password-set links for the two accounts WITHOUT sending any email.
 *
 * Supabase's built-in SMTP is capped at ~2 emails/hour, which makes bootstrap
 * painful. The admin `generate_link` endpoint returns the same material the
 * email would have carried, but sends nothing — so it is not rate limited.
 *
 * Why this does NOT use the `action_link` that Supabase returns:
 *
 *   action_link points at /auth/v1/verify, which verifies the token and then
 *   302s to the Site URL with the session in the URL *fragment*
 *   (#access_token=...). Fragments are never sent to a server, and they do not
 *   survive a server-side redirect — so the token was being silently dropped.
 *
 * Instead we take the `hashed_token` from the same response and point directly
 * at our own callback with it in the query string. Everything stays
 * server-readable, nothing depends on the Site URL setting, and the callback
 * verifies it with verifyOtp().
 *
 * Usage from the project root:
 *
 *   SUPABASE_SERVICE_ROLE_KEY='sb_secret_...' node scripts/generate-auth-links.mjs \
 *     you@example.com wife@example.com
 *
 * Override the app origin (defaults to the LAN address so phones work):
 *
 *   APP_URL=http://localhost:3000 SUPABASE_SERVICE_ROLE_KEY='...' node ...
 */

const supabaseUrl = 'https://rujhyijsoeezcclsladc.supabase.co'
const appUrl = process.env.APP_URL ?? 'http://192.168.178.23:3000'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const emails = process.argv.slice(2)

if (!key) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. See the header of this file.')
  process.exit(1)
}
if (emails.length === 0) {
  console.error('Pass one or more email addresses as arguments.')
  process.exit(1)
}

async function generate(email, type) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, email }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    return { error: body.msg ?? body.error_description ?? body.error ?? response.statusText }
  }

  // Present at the top level on current versions, nested on older ones.
  const hashedToken = body.hashed_token ?? body.properties?.hashed_token
  if (!hashedToken) return { error: 'no hashed_token in response' }

  return { hashedToken }
}

for (const email of emails) {
  // `recovery` suits an existing account; `magiclink` covers invited-but-never
  // -confirmed. Try in that order.
  let type = 'recovery'
  let result = await generate(email, type)

  if (!result.hashedToken) {
    type = 'magiclink'
    result = await generate(email, type)
  }

  console.log(`\n${email}`)
  if (result.hashedToken) {
    const link = `${appUrl}/auth/callback?token_hash=${result.hashedToken}&type=${type}&next=/set-password`
    console.log(link)
  } else {
    console.log(`  FAILED: ${result.error}`)
  }
}

console.log(
  '\nSingle use — opening a link consumes it. Re-run this script for a fresh one.',
)
console.log(`App origin: ${appUrl}  (override with APP_URL=...)`)
