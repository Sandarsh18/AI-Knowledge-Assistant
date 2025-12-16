/**
 * Tailwind configuration enabling class-based dark mode and custom themes.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          light: "#93c5fd",
          DEFAULT: "#3b82f6",
          dark: "#1d4ed8"
        },
        "cyber-blue": "#00f6ff",
        "neon-pink": "#ff4dff",
        "violet-glow": "#8b5cff",
        "matrix-green": "#68ff8b"
      },
      boxShadow: {
        glass: "0 10px 30px rgba(15, 23, 42, 0.15)",
        neon: "0 0 20px rgba(0, 246, 255, 0.45)",
        "neon-strong": "0 0 40px rgba(139, 92, 255, 0.6)"
      },
      backgroundImage: {
        "cyber-grid":
          "radial-gradient(circle at 1px 1px, rgba(0, 246, 255, 0.3) 1px, transparent 0), radial-gradient(circle at 3px 3px, rgba(139, 92, 255, 0.25) 1px, transparent 0)"
      },
      keyframes: {
        gradientFlow: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" }
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 14px rgba(0, 246, 255, 0.35)" },
          "50%": { boxShadow: "0 0 28px rgba(255, 77, 255, 0.55)" }
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" }
        }
      },
      animation: {
        "gradient-flow": "gradientFlow 12s ease infinite",
        "pulse-glow": "pulseGlow 2.6s ease-in-out infinite",
        scanline: "scanline 10s linear infinite",
        float: "float 4.5s ease-in-out infinite"
      },
      transitionTimingFunction: {
        "out-back": "cubic-bezier(0.34, 1.56, 0.64, 1)"
      }
    }
  },
  plugins: []
};