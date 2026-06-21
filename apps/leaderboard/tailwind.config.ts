import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // BitgetBench brand: monochrome, no accent, no gradient.
        void: "#0A0A0A", // primary ground
        carbon: "#0E0E0E", // raised panel
        ink: "#F4F4F2", // text + chrome highlight
        bone: "#E8E7E3", // inverse surface
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
        mono: ["var(--font-space-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "bb-ticker": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "bb-blink": {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0" },
        },
      },
      animation: {
        ticker: "bb-ticker 22s linear infinite",
        blink: "bb-blink 1.6s steps(1) infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
