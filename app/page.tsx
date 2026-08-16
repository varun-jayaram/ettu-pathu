import { createClient } from '@/lib/supabase/server'

/**
 * Temporary landing page. Proves the auth round-trip works end to end and
 * surfaces the signed-in user's ID, which is what the wallet seed migration
 * needs. The real dashboard replaces this.
 */
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Varavu Ettu Selavu Pathu
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        வரவு எட்டணா, செலவு பத்தணா
      </p>

      <div className="mt-8 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm font-medium">Signed in</p>
        <p className="mt-1 text-sm text-neutral-500">{user?.email}</p>
        <p className="mt-3 text-xs font-medium text-neutral-500">User ID</p>
        <code className="mt-1 block break-all text-xs">{user?.id}</code>
      </div>

      <p className="mt-6 text-sm text-neutral-500">
        Wallets, quick-add and reports come next.
      </p>
    </main>
  )
}
