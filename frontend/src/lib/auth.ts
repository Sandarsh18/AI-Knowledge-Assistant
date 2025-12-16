/**
 * Authentication helpers with local storage fallback for development.
 */
export interface AuthUser {
  identityProvider: string;
  userId: string;
  userDetails: string;
  name?: string;
}

interface AuthResponse {
  clientPrincipal?: AuthUser;
}

const STORAGE_KEY = "azure-pdf-chat-user";
const USERS_KEY = "azure-pdf-chat-users";

const isBrowser = typeof window !== "undefined";
const isLocalhost = (): boolean => isBrowser && window.location.hostname === "localhost";

/**
 * Get current authenticated user from localStorage or Azure
 */
export const getUser = async (): Promise<AuthUser | null> => {
  if (isLocalhost()) {
    // Check localStorage for local auth
    if (isBrowser) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored) as AuthUser;
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
    return null;
  }

  try {
    const response = await fetch("/.auth/me", {
      headers: {
        "Cache-Control": "no-cache"
      }
    });
    if (!response.ok) {
      return null;
    }
    const payload: AuthResponse = await response.json();
    return payload.clientPrincipal ?? null;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    return null;
  }
};

/**
 * Login with email and password (local mode only)
 */
export const loginWithCredentials = async (email: string, password: string): Promise<void> => {
  if (!isLocalhost()) {
    throw new Error("Local authentication is only available in development mode");
  }

  // Simulate authentication - in production, this would call your backend
  const users = localStorage.getItem(USERS_KEY);
  if (users) {
    const userList = JSON.parse(users) as Record<string, { password: string; name: string }>;
    if (userList[email] && userList[email].password === password) {
      const user: AuthUser = {
        identityProvider: "local",
        userId: email,
        userDetails: email,
        name: userList[email].name
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      return;
    }
  }
  throw new Error("Invalid email or password");
};

/**
 * Signup with email, password, and name (local mode only)
 */
export const signupWithCredentials = async (
  email: string,
  password: string,
  name: string
): Promise<void> => {
  if (!isLocalhost()) {
    throw new Error("Local authentication is only available in development mode");
  }

  // Store user credentials - in production, this would call your backend
  const users = localStorage.getItem(USERS_KEY);
  const userList = users ? (JSON.parse(users) as Record<string, { password: string; name: string }>) : {};

  if (userList[email]) {
    throw new Error("An account with this email already exists");
  }

  userList[email] = { password, name };
  localStorage.setItem(USERS_KEY, JSON.stringify(userList));

  // Auto-login after signup
  const user: AuthUser = {
    identityProvider: "local",
    userId: email,
    userDetails: email,
    name
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
};

/**
 * Login via Azure AD (production only)
 */
export const login = (): void => {
  if (isLocalhost()) {
    console.info("[LOCAL MODE] Use login form instead");
    return;
  }
  window.location.href = "/.auth/login/aad";
};

/**
 * Logout
 */
export const logout = (): void => {
  if (isLocalhost()) {
    if (isBrowser) {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
    return;
  }
  window.location.href = "/.auth/logout";
};

export const updateLocalProfile = async (updates: { name?: string }): Promise<AuthUser> => {
  if (!isLocalhost()) {
    throw new Error("Profile updates are only available in local development mode");
  }
  if (!isBrowser) {
    throw new Error("Profile updates require a browser environment");
  }

  const currentRaw = localStorage.getItem(STORAGE_KEY);
  if (!currentRaw) {
    throw new Error("No authenticated user");
  }

  const current = JSON.parse(currentRaw) as AuthUser;
  const next: AuthUser = { ...current, ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

  if (updates.name) {
    const usersRaw = localStorage.getItem(USERS_KEY);
    if (usersRaw) {
      const userList = JSON.parse(usersRaw) as Record<string, { password: string; name: string }>;
      if (userList[current.userDetails]) {
        userList[current.userDetails].name = updates.name;
        localStorage.setItem(USERS_KEY, JSON.stringify(userList));
      }
    }
  }

  return next;
};

export const canEditProfile = (): boolean => isLocalhost();
