import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fafo: {
          bg: "rgb(var(--bg) / <alpha-value>)",
          panel: "rgb(var(--panel) / <alpha-value>)",
          panel2: "rgb(var(--panel2) / <alpha-value>)",
          border: "rgb(var(--border) / <alpha-value>)",
          accent: "rgb(var(--accent) / <alpha-value>)",
          accent2: "rgb(var(--accent2) / <alpha-value>)",
          gold: "rgb(var(--gold) / <alpha-value>)",
          muted: "rgb(var(--muted) / <alpha-value>)",
          text: "rgb(var(--text) / <alpha-value>)",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
