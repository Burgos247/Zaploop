import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070710",
          900: "#0c0c18",
          800: "#13132a",
          700: "#1c1c3a",
          600: "#2a2a52",
          500: "#3c3c75",
          400: "#5c5ca0",
          300: "#8888c7",
          200: "#b8b8df",
          100: "#e2e2f3",
        },
        bolt: {
          400: "#ffd84d",
          500: "#ffcc14",
          600: "#e5b400",
        },
        nostr: {
          500: "#7a5cff",
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
