import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bentala Internal System',
  description: 'Internal management system for Bentala',
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
      <body>{children}</body>
    </html>
  )
}
