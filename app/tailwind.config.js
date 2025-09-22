/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['ui-sans-serif', 'system-ui', 'Inter', 'Avenir', 'Helvetica', 'Arial'],
        body: ['ui-sans-serif', 'system-ui', 'Inter', 'Avenir', 'Helvetica', 'Arial'],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(2, 6, 23, 0.12)',
      },
    },
  },
  plugins: [],
}


