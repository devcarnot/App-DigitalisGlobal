/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
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
