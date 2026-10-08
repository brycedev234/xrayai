import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./preview/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        film: {
          950: "#03050a",
          900: "#060a12",
          800: "#0b1220",
          700: "#121c2e",
        },
        bone: "#d8e6f2",
        phosphor: "#7fe3ff",
        infra: "#ff2f6d",
        amber: "#ffb547",
        mute: "#5d6f86",
      },
      fontFamily: {
        display: ["Syncopate", "Arial Black", "sans-serif"],
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: {
        scan: "0.32em",
      },
    },
  },
  plugins: [],
};

export default config;
