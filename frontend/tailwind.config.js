/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          forest: {
            50: '#f0f7f3',
            100: '#e2efe7',
            200: '#c6ded1',
            500: '#3c8d70',
            600: '#297057',
            700: '#1e5642',
            800: '#164234',
            900: '#0b231b',
          },
          gold: {
            50: '#fefaf0',
            100: '#fef4dc',
            200: '#f7e4be',
            500: '#dfa619',
            600: '#c69214',
            700: '#ae7e0d',
            800: '#946b08',
            900: '#6b4d05',
          },
        },
        page: '#f8faf8',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Noto Sans Ethiopic"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 3px rgba(19, 27, 22, 0.05)',
        card: '0 4px 20px -2px rgba(19, 27, 22, 0.06), 0 2px 6px -1px rgba(19, 27, 22, 0.03)',
        'card-hover': '0 12px 30px -4px rgba(22, 66, 52, 0.12), 0 4px 12px -2px rgba(22, 66, 52, 0.06)',
        'gold-glow': '0 0 24px -2px rgba(198, 146, 20, 0.35)',
        'forest-glow': '0 0 24px -2px rgba(22, 66, 52, 0.3)',
      },
      borderRadius: {
        DEFAULT: '0.625rem',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.04)' },
        },
        'soundwave': {
          '0%, 100%': { height: '8px' },
          '50%': { height: '28px' },
        },
      },
      animation: {
        'pulse-slow': 'pulse-slow 2.5s ease-in-out infinite',
        'soundwave': 'soundwave 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
