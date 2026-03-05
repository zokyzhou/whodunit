import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        void: {
          950: '#020408',
          900: '#04060f',
          800: '#080d1a',
          700: '#0d1424',
          600: '#131c33',
        },
      },
      boxShadow: {
        'cyan-glow':    '0 0 20px rgba(34,211,238,0.2), 0 0 40px rgba(34,211,238,0.06)',
        'cyan-glow-sm': '0 0 10px rgba(34,211,238,0.15)',
        'purple-glow':  '0 0 20px rgba(168,85,247,0.2), 0 0 40px rgba(168,85,247,0.06)',
      },
      animation: {
        'glow': 'glow 2.5s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        glow: {
          '0%, 100%': { opacity: '0.6' },
          '50%':       { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
