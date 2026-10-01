/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0e1014",
        panel: "#161920",
        panel2: "#1d212b",
        line: "#2a2f3a",
        text: "#e7e9ee",
        muted: "#8a92a6",
        accent: "#f5b14c",
        mountain: "#ff5d5d",
        valley: "#4da3ff",
        flat: "#6b7280",
        success: "#3ccf91",
        warning: "#f5b14c",
        error: "#ff5d5d",
        paperfront: "#e2553f",
        paperback: "#f3e6cc",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: { base: ["15px", "1.5"] },
    },
  },
  plugins: [],
};
