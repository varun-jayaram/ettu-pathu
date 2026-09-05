import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * Phones on the house wifi, in development only.
   *
   * `next dev` serves /_next/* dev assets to localhost alone and blocks every
   * other origin. Hitting the LAN address from a phone therefore returns the
   * HTML but none of the client bundle: the page renders, nothing hydrates,
   * and the Sign in button does nothing at all — no error, because no
   * JavaScript ran to produce one.
   *
   * A range rather than one address: the router hands out DHCP leases, so the
   * laptop's own IP moves and pinning today's would break next week. This has
   * no effect on `next build` or on Vercel — dev assets do not exist there.
   */
  allowedDevOrigins: ['192.168.178.*', '192.168.1.*'],

  async redirects() {
    return [
      // Recurring rules moved into the Budgets page — they are the committed
      // floor, so planning them on a separate tab split one job across two
      // screens. Kept so any bookmark or home-screen shortcut still lands
      // somewhere sensible.
      { source: '/recurring', destination: '/budgets', permanent: false },
    ]
  },
}

export default nextConfig
