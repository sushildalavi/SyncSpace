import animate from "tailwindcss-animate";

const hsl = (name) => `hsl(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1440px" },
    extend: {
      colors: {
        background: hsl("background"),
        foreground: hsl("foreground"),
        surface: hsl("surface"),
        muted: { DEFAULT: hsl("muted"), foreground: hsl("muted-foreground") },
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
        primary: { DEFAULT: hsl("primary"), foreground: hsl("primary-foreground"), soft: hsl("primary-soft") },
        destructive: { DEFAULT: hsl("destructive"), foreground: hsl("destructive-foreground"), soft: hsl("destructive-soft") },
        success: { DEFAULT: hsl("success"), soft: hsl("success-soft") },
        warning: { DEFAULT: hsl("warning"), soft: hsl("warning-soft") },
        sidebar: { DEFAULT: hsl("sidebar"), border: hsl("sidebar-border") }
      },
      fontFamily: {
        sans: ["Inter Variable", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
      },
      fontSize: {
        // [size, {lineHeight, letterSpacing}]
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.625rem", letterSpacing: "-0.01em" }],
        xl: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.025em" }]
      },
      borderRadius: { sm: "4px", md: "6px", lg: "8px", xl: "12px" },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)"
      },
      transitionDuration: { fast: "120ms", base: "180ms", slow: "280ms" },
      transitionTimingFunction: { out: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
      keyframes: {
        shimmer: { "0%": { backgroundPosition: "200% 0" }, "100%": { backgroundPosition: "-200% 0" } }
      },
      animation: { shimmer: "shimmer 1.6s linear infinite" }
    }
  },
  plugins: [animate]
};

export default config;
