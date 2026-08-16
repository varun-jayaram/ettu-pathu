import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Varavu Ettu Selavu Pathu',
  description: 'A private two-person expense tracker.',
}

export const viewport: Viewport = {
  // Both values, so the browser chrome follows whichever theme is painted.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

/**
 * Sets data-theme BEFORE first paint.
 *
 * This has to be a blocking inline script: if the theme were applied in a React
 * effect, the page would paint light first and snap to dark a moment later on
 * every single navigation. It resolves "system" itself, so the rest of the app
 * only ever sees a concrete "light" or "dark" — see globals.css.
 */
const themeScript = `
(function () {
  try {
    var choice = localStorage.getItem('theme');
    var dark = choice === 'dark' ||
      ((!choice || choice === 'system') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
