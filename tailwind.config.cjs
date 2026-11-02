module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: {
      background: 'var(--bg)', foreground: 'var(--text)',
      card: { DEFAULT: 'var(--surface)', foreground: 'var(--text)' },
      popover: { DEFAULT: 'var(--surface)', foreground: 'var(--text)' },
      primary: { DEFAULT: 'var(--accent)', foreground: 'var(--on-accent)' },
      secondary: { DEFAULT: 'var(--surface-hover)', foreground: 'var(--text)' },
      muted: { DEFAULT: 'var(--surface-hover)', foreground: 'var(--text-muted)' },
      accent: { DEFAULT: 'var(--surface-hover)', foreground: 'var(--text)' },
      destructive: { DEFAULT: 'var(--danger)', foreground: 'var(--bg)' },
      border: 'var(--border)', input: 'var(--border-strong)', ring: 'var(--focus)'
    },
    borderRadius: { lg: '12px', md: '8px', sm: '6px' }
  } },
  plugins: [require('tailwindcss-animate')]
}
