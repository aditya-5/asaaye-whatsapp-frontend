/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          green: '#25D366',
          dark: '#111B21',
          darker: '#0B141A',
          chat: '#0B141A',
          sidebar: '#111B21',
          input: '#2A3942',
          hover: '#202C33',
          border: '#2A3942',
          text: '#E9EDEF',
          muted: '#8696A0',
          blue: '#53BDEB',
          outgoing: '#005C4B',
          incoming: '#202C33',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
