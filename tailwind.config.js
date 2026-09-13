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
        teal: {
          50: '#effbfa',
          100: '#d6f4f1',
          200: '#b0e8e3',
          300: '#7ad6d0',
          400: '#43bcb7',
          500: '#289f9c',
          600: '#1f807f',
          700: '#1d6666',
          800: '#1c5252',
          900: '#1b4545',
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
