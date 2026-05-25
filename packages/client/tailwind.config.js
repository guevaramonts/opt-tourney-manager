/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: { 900: '#0d1f18', 800: '#142b21', 700: '#1a3829' },
      },
    },
  },
  plugins: [],
};
