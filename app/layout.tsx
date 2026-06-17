import type { Metadata, Viewport } from 'next'
import './globals.css'
import { LanguageProvider } from '@/lib/i18n/LanguageProvider'

// Mobile-first viewport so the internal app scales correctly on phones.
// `viewportFit: 'cover'` lets the fixed sidebar drawer + mobile top bar
// extend under iOS safe-area insets (we pad them back in via env()).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Bentala Internal System',
  description: 'Internal management system for Bentala',
  icons: {
    icon: '/Favicon.png',
    shortcut: '/Favicon.png',
    apple: '/Favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('bentala_theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`,
          }}
        />
      </head>
      <body><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  )
}
