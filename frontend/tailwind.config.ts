import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // HoodMap — lime-on-black fintech. Values from the brand sheet.
        canvas: "#06070A",
        surface: {
          DEFAULT: "#0D0F14",
          2: "#13161D",
          3: "#191D26",
        },
        line: {
          DEFAULT: "rgba(255,255,255,0.08)",
          strong: "rgba(255,255,255,0.16)",
        },
        lime: {
          DEFAULT: "#D6FA4D",
          soft: "#E6FF9E",
        },
        moss: {
          DEFAULT: "#17B04A",
          soft: "#7CE38A",
        },
        ink: {
          DEFAULT: "#F4F5F7",
          muted: "#9AA1AE",
          faint: "#676E7A",
        },
        // Semantic — kept separate from the accent family.
        success: "#34D399",
        warning: "#FBBF24",
        danger: "#FB7185",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        display: ["var(--font-display)", "var(--font-geist-sans)", "sans-serif"],
      },
      backgroundImage: {
        "lime-moss": "linear-gradient(100deg, #D6FA4D, #17B04A)",
      },
      boxShadow: {
        "glow-lime": "0 0 40px -8px rgba(214,250,77,0.35)",
        "glow-lime-sm": "0 0 20px -6px rgba(214,250,77,0.4)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
