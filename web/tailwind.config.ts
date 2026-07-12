import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0806",
        gold: "#e0a94a",
      },
      fontFamily: {
        sans: ["var(--font-inter)"],
        serif: ["var(--font-fraunces)"],
      },
    },
  },
  plugins: [],
};

export default config;
