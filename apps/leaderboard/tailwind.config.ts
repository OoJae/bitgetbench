import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0e14",
        panel: "#131722",
        edge: "#222838",
        ink: "#e6e9ef",
        muted: "#8b93a7",
        accent: "#16c784",
        danger: "#ea3943",
      },
    },
  },
  plugins: [],
} satisfies Config;
