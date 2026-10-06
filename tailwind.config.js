/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        navy: {
          50: '#f2f5f9',
          100: '#e1e8f0',
          200: '#c3d0e0',
          300: '#95acc7',
          400: '#6283a8',
          500: '#40648c',
          600: '#2f4d70',
          700: '#263d59',
          800: '#1c2d42',
          900: '#14202f',
          950: '#0b1420',
        },
        /**
         * Brand accent ramp, anchored on the Sterling orange #F46B25 sampled from the logo.
         * The scale keeps the key name `teal` so no component markup had to change when the
         * accent moved from teal to orange. Steps 600 and 700 are deliberately darker than the
         * brand orange so white text on buttons and orange links on white both clear WCAG AA.
         */
        /**
         * The client accent. Values come from CSS custom properties set at
         * start-up from the selected client profile, so all ~240 `teal-*` classes
         * re-colour without being edited. The key stays `teal` for that reason.
         * src/index.css holds the fallback ramp for before the script runs.
         */
        teal: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-800) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(15 23 42 / 0.10), 0 2px 4px -1px rgb(15 23 42 / 0.06)',
        panel: '0 10px 40px -10px rgb(15 23 42 / 0.25)',
      },
    },
  },
  plugins: [],
}
