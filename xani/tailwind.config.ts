import type { Config } from 'tailwindcss';

/**
 * Colours map to CSS variables (defined in globals.css) so the whole app themes
 * light/dark via :root[data-xtheme]. Both the new design vocabulary and the
 * original token names point at the same vars, so existing screens theme
 * automatically.
 */
const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // New design vocabulary
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        hover: 'var(--hover)',
        border: 'var(--border)',
        'border-2': 'var(--border-2)',
        muted: 'var(--muted)',
        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        accent: '#C0613A',
        'accent-dim': '#A8512E',
        'accent-soft': 'var(--accent-soft)',
        'accent-soft-2': 'var(--accent-soft-2)',
        'on-accent': 'var(--on-accent)',
        // Chip accents
        green: '#6E8B6A',
        'green-soft': '#E8EEE5',
        'green-ink': '#54704F',
        gold: '#D89A4E',
        'gold-soft': '#F8EFDF',
        violet: '#7A6E9C',
        'violet-soft': '#ECE7F1',
        // Back-compat names used by existing screens → same vars
        paper: 'var(--bg)',
        'paper-card': 'var(--surface)',
        ink: 'var(--text)',
        'ink-soft': 'var(--text-2)',
        line: 'var(--border)',
        terracotta: '#C0613A',
        'terracotta-dim': '#A8512E',
        amber: '#D89A4E',
      },
      fontFamily: {
        display: ['var(--font-playfair)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
