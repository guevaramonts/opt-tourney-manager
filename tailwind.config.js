/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        felt: {
          900: '#0d1f18',
          800: '#142b21',
          700: '#1a3829',
        },
      },
    },
  },
  plugins: [],
};
