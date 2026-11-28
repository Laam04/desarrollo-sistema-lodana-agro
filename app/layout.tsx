import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import './globals.css'
import { RouteTransitionOverlay } from '@/components/route-transition-overlay'
import { ThemeProvider } from '@/components/theme-provider'


export const metadata: Metadata = {
  title: 'Lodana Agro | Selección de perfil',
  description: 'Sistema de gestión de producción agrícola para Lodana y Agro Market.',
  icons: {
    icon: [
      {
        url: '/brand/facivitec-icon-light.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/brand/facivitec-icon-dark.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/brand/facivitec-apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          themes={['light', 'dark', 'custom']}
          disableTransitionOnChange
        >
          {children}
          <Suspense fallback={null}>
            <RouteTransitionOverlay />
          </Suspense>
        </ThemeProvider>
        {process.env.VERCEL && <Analytics />}
      </body>
    </html>
  )
}
