"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import {
  AuthSessionResponse,
  AuthenticatedUser,
  authMe
} from "@/lib/api";

import { clearAccessToken, readAccessToken, writeAccessToken } from "./session-storage";

interface SessionContextValue {
  accessToken: string | null;
  user: AuthenticatedUser | null;
  loading: boolean;
  error: string | null;
  hasAdminAccess: boolean;
  applyAuthSession: (session: AuthSessionResponse) => Promise<void>;
  refreshUser: () => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function checkAdminAccess(user: AuthenticatedUser | null): boolean {
  if (!user) {
    return false;
  }
  return user.roles.includes("admin") || user.roles.includes("support");
}

export function SessionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async (): Promise<void> => {
    const token = readAccessToken();
    if (!token) {
      setAccessToken(null);
      setUser(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      const me = await authMe(token);
      setAccessToken(token);
      setUser(me);
      setError(null);
    } catch (requestError) {
      clearAccessToken();
      setAccessToken(null);
      setUser(null);
      setError(requestError instanceof Error ? requestError.message : "Failed to refresh session");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const applyAuthSession = useCallback(
    async (session: AuthSessionResponse): Promise<void> => {
      writeAccessToken(session.accessToken);
      setAccessToken(session.accessToken);
      setLoading(true);
      await refreshUser();
    },
    [refreshUser]
  );

  const signOut = useCallback(() => {
    clearAccessToken();
    setAccessToken(null);
    setUser(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onAuthExpired = (): void => {
      clearAccessToken();
      setAccessToken(null);
      setUser(null);
      setError("Session expired. Please sign in again.");
      setLoading(false);
    };

    window.addEventListener("illamhelp:auth-expired", onAuthExpired);
    return () => {
      window.removeEventListener("illamhelp:auth-expired", onAuthExpired);
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      accessToken,
      user,
      loading,
      error,
      hasAdminAccess: checkAdminAccess(user),
      applyAuthSession,
      refreshUser,
      signOut
    }),
    [accessToken, user, loading, error, applyAuthSession, refreshUser, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
