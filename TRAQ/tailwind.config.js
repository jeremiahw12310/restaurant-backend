/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#d11a2a',
          dark: '#a0121f',
          light: '#ff2a3d',
        },
      },
    },
  },
  plugins: [],
}

