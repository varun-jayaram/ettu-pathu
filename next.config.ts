import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
