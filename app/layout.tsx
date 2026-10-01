import type { Metadata } from 'next'
import { Inter, Manrope, Montserrat } from 'next/font/google'
import './globals.css'

// The workspace keeps Montserrat. The public site and the sign-in pages use
// Inter for text and Manrope for display headings (see .theme-dg in globals.css).
const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  display: 'swap',
})
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Lead Engine',
  description: 'Scrape, enrich, and reach — outbound lead engine',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${montserrat.variable} ${inter.variable} ${manrope.variable} h-full`}>
      <body className="min-h-full text-[color:var(--color-text-primary)]">
        {children}
      </body>
    </html>
  )
}
