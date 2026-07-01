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
        accent: '#40705c',
        'accent-dim': '#365e4d',
        'accent-soft': 'var(--accent-soft)',
        'accent-soft-2': 'var(--accent-soft-2)',
        'on-accent': 'var(--on-accent)',
        // Source / chip accents (Quiet Stone, per-source colour-coding)
        green: '#5f9070',
        'green-soft': '#e6efe8',
        'green-ink': '#3f6b52',
        gold: '#c2963c',
        'gold-soft': '#f6ecd6',
        violet: '#9a6f9c',
        'violet-soft': '#efe7f0',
        trello: '#5f86a8',
        lead: '#c2963c',
        amargi: '#bd6a4a',
        slack: '#5f9070',
        // Back-compat names used by existing screens → same vars
        paper: 'var(--bg)',
        'paper-card': 'var(--surface)',
        ink: 'var(--text)',
        'ink-soft': 'var(--text-2)',
        line: 'var(--border)',
        terracotta: '#bd6a4a',
        'terracotta-dim': '#9f5f3c',
        amber: '#c2963c',
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
