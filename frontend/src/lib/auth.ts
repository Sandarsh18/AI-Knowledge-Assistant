// Purpose: Handle authentication for both Azure Static Web Apps and local development.
export interface AuthUser {
  userId: string
  userDetails: string
  identityProvider: string
}

interface AuthResponse {
  clientPrincipal?: {
    identityProvider: string
    userId: string
    userDetails: string
  }
}

// Detect if the app is running locally or on Azure
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

// Environment variable fallback for flexibility
const AUTH_BASE = import.meta.env.VITE_AZURE_AUTH_BASE || '/.auth'

/**
 * Get the currently authenticated user.
 * Works with Azure Static Web Apps authentication or local mock mode.
 */
export const getUser = async (): Promise<AuthUser | null> => {
  try {
    if (isLocal) {
      console.warn('[auth] Running in local mode → using mock user.')
      return {
        userId: 'local-user-001',
        userDetails: 'Sandarsh Local',
        identityProvider: 'local-dev',
      }
    }

    // Azure Static Web Apps authentication endpoint
    const response = await fetch(`${AUTH_BASE}/me`, { credentials: 'include' })
    if (!response.ok) return null

    const data: AuthResponse = await response.json()
    const principal = data.clientPrincipal
    if (!principal) return null

    console.info(`[auth] Logged in as ${principal.userDetails} (${principal.identityProvider})`)

    return {
      userId: principal.userId,
      userDetails: principal.userDetails,
      identityProvider: principal.identityProvider,
    }
  } catch (error) {
    console.error('[auth] Failed to read authentication state:', error)
    return null
  }
}

/**
 * Trigger login with Azure AD when hosted on Azure.
 * Redirects the user to the Static Web Apps auth provider.
 */
export const login = (): void => {
  if (isLocal) {
    alert('🧪 Local mode: authentication is disabled.')
    return
  }
  window.location.href = `${AUTH_BASE}/login/aad`
}

/**
 * Logs the user out of Azure Static Web Apps authentication.
 */
export const logout = (): void => {
  if (isLocal) {
    alert('🧪 Local mode: no logout required.')
    return
  }
  window.location.href = `${AUTH_BASE}/logout`
}
