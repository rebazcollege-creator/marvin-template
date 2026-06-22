import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm cream / paper aesthetic
        paper: '#F5F0E8',
        'paper-card': '#FBF8F2',
        terracotta: '#C0613A',
        'terracotta-dim': '#A8512E',
        amber: '#D89A4E',
        ink: '#2C2C2C',
        'ink-soft': '#5A554C',
        line: '#E3DBCC',
      },
      fontFamily: {
        // Playfair Display for headings / wordmark, Inter for UI
        display: ['var(--font-playfair)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
