/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: "#10b981",
        secondary: "#3b82f6",
        dark: "#1f2937",
      }
    },
  },
  plugins: [],
}
