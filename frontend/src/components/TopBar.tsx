/**
 * Top navigation bar with theme toggle, branding, and authentication controls.
 */
import React, { useEffect, useMemo, useState } from "react";
import "../styles/index.css";
import { getUser, login, logout, AuthUser } from "../lib/auth";
import { initTheme, toggleTheme, getActiveTheme, ThemeName, ThemeChangeDetail } from "../lib/theme";

const TopBar: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [theme, setThemeState] = useState<ThemeName>("light");

  useEffect(() => {
    const applied = initTheme();
    setThemeState(applied);

    const loadUser = async () => {
      const profile = await getUser();
      setUser(profile);
    };

    void loadUser();

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ThemeChangeDetail>).detail;
      setThemeState(detail.theme);
    };

    document.documentElement.addEventListener("themechange", handler as EventListener);
    return () => {
      document.documentElement.removeEventListener("themechange", handler as EventListener);
    };
  }, []);

  const handleThemeToggle = () => {
    const next = toggleTheme();
    setThemeState(next);
  };

  const handleAuthAction = () => {
    if (user) {
      logout();
    } else {
      login();
    }
  };

  const themeLabel = useMemo(() => (theme === "cyberpunk" ? "Cyberpunk" : "Light"), [theme]);
  const userEmail = useMemo(() => (user?.name || user?.userDetails) ?? "Guest", [user]);
  const authButtonLabel = user ? "Logout" : "Login";

  return (
    <header className="topbar-shell">
      <div className="topbar-content">
        <div className="flex items-center gap-4">
          <div className="relative">
            <span className="logo-orb" aria-hidden="true" />
          </div>
          <div>
            <h1 className="brand-title">Azure PDF Chat</h1>
            <p className="brand-subtitle">Grounded answers from your documents.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <span className="theme-badge" aria-live="polite">
            {themeLabel} Mode
          </span>
          <button type="button" onClick={handleThemeToggle} className="neon-switch" aria-label="Toggle theme">
            <svg
              aria-hidden="true"
              className="h-4 w-4 text-white opacity-90"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v2" />
              <path d="M12 19v2" />
              <path d="M5.22 5.22l1.42 1.42" />
              <path d="M17.36 17.36l1.42 1.42" />
              <path d="M3 12h2" />
              <path d="M19 12h2" />
              <path d="M5.22 18.78l1.42-1.42" />
              <path d="M17.36 6.64l1.42-1.42" />
              <path d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4z" />
            </svg>
            <span className="hidden text-xs font-semibold uppercase tracking-wide sm:inline">{themeLabel}</span>
          </button>
          <button
            type="button"
            onClick={handleAuthAction}
            className={`auth-button ${user ? "auth-button--logout" : ""}`}
            title={userEmail}
          >
            {authButtonLabel}
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopBar;