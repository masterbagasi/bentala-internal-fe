import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Strict 3-color palette: white #FFFFFF, black #000000, blue
      // #0B3DE7. Surface variants are black with low-alpha white
      // tints. accent2 stays red for destructive actions per brief.
      colors: {
        bg: '#000000',
        bg2: '#0d0d0d',
        bg3: '#1a1a1a',
        border: 'rgba(255, 255, 255, 0.08)',
        accent: '#0B3DE7',
        accent2: '#ff453a',
        accent3: '#43d9a2',
        accent4: '#0B3DE7',
        text: '#FFFFFF',
        text2: 'rgba(255, 255, 255, 0.55)',
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-up': 'slideUp 0.18s ease',
        'fade-in': 'fadeIn 0.15s ease',
        'spin-fast': 'spin 0.65s linear infinite',
      },
      keyframes: {
        slideUp: {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
