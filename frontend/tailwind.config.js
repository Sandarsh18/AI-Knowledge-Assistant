export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e8f0ff',
          100: '#d1e2ff',
          200: '#a4c6ff',
          300: '#76a9ff',
          400: '#4a8dff',
          500: '#1f70ff',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e3a8a',
          900: '#172554',
        },
      },
      boxShadow: {
        glass: '0 20px 45px -25px rgba(30, 64, 175, 0.35)',
      },
    },
  },
  plugins: [],
}