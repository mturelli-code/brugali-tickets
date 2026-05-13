import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#fafaf7",
        surface: "#ffffff",
        surface2: "#f4f3ee",
        border: "#e6e2d8",
        text: "#1d1d1b",
        muted: "#6a6862",
        dim: "#a8a59a",
        accent: "#254957",
        brugaligreen: "#339f8f",
        brugaliamber: "#e6a303",
        brugaliorange: "#f07e26",
        brugalired: "#e63323",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        serif: ['"Fraunces"', "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
