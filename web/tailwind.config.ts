import type { Config } from "tailwindcss";

/**
 * Streamly design tokens. The colours come from CSS variables (see app/globals.css) so the
 * light / dark theme switch only has to change the variables.
 * (Tailwind 4 reads this file through the `@config` line in app/globals.css.)
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}", "./shared/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        panel2: "var(--panel2)",
        panel3: "var(--panel3)",
        fg: "var(--text)",
        mute: "var(--mute)",
        accent: "var(--accent)",
        accent2: "var(--accent2)",
        line: "var(--line)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: {
        card: "14px",
      },
      animation: {
        "fade-in": "fade-in 0.25s ease both",
        "pulse-soft": "pulse-soft 1.4s ease-in-out infinite",
        "spin-fast": "spin 0.8s linear infinite",
        "spin-mid": "spin 0.7s linear infinite",
        "card-in": "card-in 0.22s cubic-bezier(0.2, 0.7, 0.2, 1) var(--d, 0ms) backwards",
        shimmer: "shimmer 1.3s linear infinite",
        slide: "slide 1.1s ease-in-out infinite",
        floaty: "floaty 2.8s ease-in-out infinite",
        "chip-in": "chip-in 0.25s ease both",
        "toast-in": "toast-in 0.19s ease-out both",
        "toast-out": "toast-out 0.16s ease-in forwards",
        "dialog-in": "dialog-in 0.21s cubic-bezier(0.2, 0.7, 0.2, 1) both",
        shake: "shake 0.22s ease",
        flash: "flash-ring 1.5s ease-out",
        "logo-pop": "logo-pop 0.24s ease-out both",
        "splash-logo": "logo-in 0.35s ease-out both",
        tspin: "tspin 0.16s ease-out",
        rip: "rip 0.6s ease-out forwards",
        pfx: "pfx-pop 0.65s ease-out forwards",
        skip: "skip-bg 0.78s ease-out forwards",
        chev: "chev 0.6s ease-out",
        "slide-down": "slide-down 0.19s ease-out both",
        "slide-up": "slide-up 0.3s ease forwards",
        "nu-in": "nu-in 0.2s ease-out both",
        "nu-ring": "nu-ring 5s linear forwards",
        "sub-in": "fade-in 0.22s ease both",
      },
      keyframes: {
        "fade-in": {
          from: {
            opacity: "0",
          },
        },
        "pulse-soft": {
          "50%": {
            opacity: "0.55",
          },
        },
        "card-in": {
          from: {
            opacity: "0",
            translate: "0 6px",
          },
        },
        slide: {
          from: {
            transform: "translateX(-100%)",
          },
          to: {
            transform: "translateX(260%)",
          },
        },
        floaty: {
          "0%,100%": {
            transform: "translateY(0)",
          },
          "50%": {
            transform: "translateY(-9px)",
          },
        },
        "chip-in": {
          from: {
            opacity: "0",
            translate: "0 -6px",
          },
        },
        "toast-in": {
          from: {
            opacity: "0",
            translate: "0 6px",
          },
        },
        "toast-out": {
          to: {
            opacity: "0",
            translate: "0 4px",
          },
        },
        "dialog-in": {
          from: {
            opacity: "0",
            transform: "translateY(6px)",
          },
        },
        shake: {
          "0%,100%": {
            transform: "none",
          },
          "25%": {
            transform: "translateX(-2px)",
          },
          "50%": {
            transform: "translateX(2px)",
          },
          "75%": {
            transform: "translateX(-1px)",
          },
        },
        "flash-ring": {
          "0%": {
            "box-shadow": "0 0 0 0 rgba(124, 92, 255, 0.8)",
          },
          "40%": {
            "box-shadow": "0 0 0 6px rgba(124, 92, 255, 0.45), 0 0 34px 8px rgba(124, 92, 255, 0.55)",
          },
          "100%": {
            "box-shadow": "0 0 0 0 rgba(124, 92, 255, 0)",
          },
        },
        "logo-pop": {
          from: {
            opacity: "0",
            translate: "0 3px",
          },
        },
        "logo-glow": {
          "40%": {
            "box-shadow": "0 0 0 6px rgba(124, 92, 255, 0.25), 0 0 26px 6px rgba(124, 92, 255, 0.65)",
          },
        },
        "logo-in": {
          from: {
            opacity: "0",
            transform: "translateY(5px)",
          },
          to: {
            opacity: "1",
            transform: "none",
          },
        },
        "splash-glow": {
          "50%": {
            filter: "drop-shadow(0 0 26px rgba(124, 92, 255, 0.55)) brightness(1.08)",
          },
        },
        tspin: {
          from: {
            opacity: "0.65",
            transform: "rotate(-8deg)",
          },
          to: {
            opacity: "1",
            transform: "none",
          },
        },
        "pfx-pop": {
          "0%": {
            opacity: "0",
            scale: "0.6",
          },
          "25%": {
            opacity: "1",
            scale: "1",
          },
          "100%": {
            opacity: "0",
            scale: "1.55",
          },
        },
        "skip-bg": {
          "0%": {
            opacity: "0",
          },
          "15%": {
            opacity: "1",
          },
          "100%": {
            opacity: "0",
          },
        },
        chev: {
          from: {
            opacity: "0",
            translate: "-10px 0",
          },
        },
        "slide-down": {
          from: {
            opacity: "0",
            translate: "-50% -18px",
          },
        },
        "slide-up": {
          to: {
            opacity: "0",
            translate: "-50% -14px",
          },
        },
        "nu-in": {
          from: {
            opacity: "0",
            translate: "30px 0",
          },
        },
        "nu-ring": {
          to: {
            "stroke-dashoffset": "113.1",
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
