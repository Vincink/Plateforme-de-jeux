import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tvos: {
          bg: "#07080C",
          surface: "#12151E",
          glass: "rgba(255, 255, 255, 0.08)",
          glassBorder: "rgba(255, 255, 255, 0.16)",
          accent: "#0A84FF",
        },
      },
      boxShadow: {
        "tvos-focus":
          "0 25px 60px -12px rgba(0, 0, 0, 0.85), 0 0 0 3px rgba(255, 255, 255, 0.85), 0 0 40px rgba(10, 132, 255, 0.35)",
        "tvos-card": "0 12px 30px -8px rgba(0, 0, 0, 0.65)",
      },
      borderRadius: {
        tvos: "24px",
        "tvos-lg": "32px",
      },
    },
  },
  plugins: [],
};

export default config;
