// Purpose: Display application branding, theme toggle, and authentication controls.
import React, { useState } from 'react'
import { MoonStar, Sun } from 'lucide-react'
import type { AuthUser } from '../lib/auth'
import { getCurrentTheme, toggleTheme } from '../lib/theme'

interface TopBarProps {
  user: AuthUser | null
  onLogin: () => void
  onLogout: () => void
}

const TopBar: React.FC<TopBarProps> = ({ user, onLogin, onLogout }) => {
  const [mode, setMode] = useState<'light' | 'dark'>(getCurrentTheme())

  const handleToggle = () => {
    const next = toggleTheme()
    setMode(next)
  }

  return (
    <header className="border-b border-white/20 bg-white/50 px-4 py-4 shadow-sm backdrop-blur-md transition dark:border-slate-800 dark:bg-slate-900/60 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-500 text-white shadow-lg">
            📄
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight sm:text-xl">Azure PDF Chat</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Secure Q&amp;A experiences powered by your documents
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggle}
            aria-label="Toggle theme"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow transition hover:scale-105 hover:border-brand-400 hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {mode === 'dark' ? <Sun className="h-5 w-5" /> : <MoonStar className="h-5 w-5" />}
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <span
                className="hidden text-sm text-slate-600 dark:text-slate-300 sm:inline"
                title={user.userDetails}
              >
                {user.userDetails}
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full bg-gradient-to-r from-brand-600 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:scale-105 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="rounded-full border border-brand-500 px-4 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:border-brand-400 dark:text-brand-300 dark:hover:bg-brand-400/10"
            >
              Login
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

export default TopBar
