/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    // lg at 1280px so tablets / Nest Hub (1024px) use the mobile bottom nav + fan menu.
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1280px',
      xl: '1536px',
      '2xl': '1920px',
    },
    extend: {
      colors: {
        sky: {
          125: '#d4edfd',
        },
      },
    },
  },
  plugins: [],
};
