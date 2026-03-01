"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import {
  AuthSessionResponse,
  AuthenticatedUser,
  authMe,
  logoutSession,
  refreshSession
} from "@/lib/api";

import {
  clearAccessToken,
  clearRefreshToken,
  readAccessToken,
  readRefreshToken,
  writeAccessToken,
  writeRefreshToken
} from "./session-storage";

interface SessionContextValue {
  accessToken: string | null;
  user: AuthenticatedUser | null;
  loading: boolean;
  error: string | null;
  applyAuthSession: (session: AuthSessionResponse) => Promise<void>;
  refreshUser: () => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({
  children
}: {
  children: ReactNode;
}): JSX.Element {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSession = useCallback(() => {
    clearAccessToken();
    clearRefreshToken();
    setAccessToken(null);
    setUser(null);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    // Refresh 60 seconds before expiry, minimum 10 seconds
    const refreshMs = Math.max((expiresInSeconds - 60) * 1000, 10_000);
    refreshTimerRef.current = setTimeout(async () => {
      const token = readRefreshToken();
      if (!token) {
        return;
      }
      try {
        const session = await refreshSession(token);
        writeAccessToken(session.accessToken);
        if (session.refreshToken) {
          writeRefreshToken(session.refreshToken);
        }
        setAccessToken(session.accessToken);
        scheduleRefresh(session.expiresIn);
      } catch {
        // Silent refresh failed — user will be prompted to re-login on next API call
      }
    }, refreshMs);
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    const token = readAccessToken();
    if (!token) {
      clearSession();
      setError(null);
      setLoading(false);
      return;
    }

    try {
      const me = await authMe(token);
      setAccessToken(token);
      setUser(me);
      setError(null);
    } catch {
      // Access token expired — attempt refresh
      const refresh = readRefreshToken();
      if (refresh) {
        try {
          const session = await refreshSession(refresh);
          writeAccessToken(session.accessToken);
          if (session.refreshToken) {
            writeRefreshToken(session.refreshToken);
          }
          setAccessToken(session.accessToken);
          const me = await authMe(session.accessToken);
          setUser(me);
          setError(null);
          scheduleRefresh(session.expiresIn);
          return;
        } catch {
          // Refresh also failed — fall through to sign out
        }
      }
      clearSession();
      setError("Session expired. Please sign in again.");
    } finally {
      setLoading(false);
    }
  }, [clearSession, scheduleRefresh]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const applyAuthSession = useCallback(
    async (session: AuthSessionResponse): Promise<void> => {
      writeAccessToken(session.accessToken);
      if (session.refreshToken) {
        writeRefreshToken(session.refreshToken);
      }
      setAccessToken(session.accessToken);
      setLoading(true);
      await refreshUser();
      if (session.expiresIn) {
        scheduleRefresh(session.expiresIn);
      }
    },
    [refreshUser, scheduleRefresh]
  );

  const signOut = useCallback(() => {
    const refresh = readRefreshToken();
    clearSession();
    setError(null);
    // Fire-and-forget server-side logout
    if (refresh) {
      void logoutSession(refresh).catch(() => {
        // Best effort — local state is already cleared
      });
    }
  }, [clearSession]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onAuthExpired = (): void => {
      // Attempt silent refresh before signing out
      const refresh = readRefreshToken();
      if (refresh) {
        void refreshSession(refresh)
          .then((session) => {
            writeAccessToken(session.accessToken);
            if (session.refreshToken) {
              writeRefreshToken(session.refreshToken);
            }
            setAccessToken(session.accessToken);
            scheduleRefresh(session.expiresIn);
          })
          .catch(() => {
            clearSession();
            setError("Session expired. Please sign in again.");
            setLoading(false);
          });
      } else {
        clearSession();
        setError("Session expired. Please sign in again.");
        setLoading(false);
      }
    };

    window.addEventListener("illamhelp:auth-expired", onAuthExpired);
    return () => {
      window.removeEventListener("illamhelp:auth-expired", onAuthExpired);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [clearSession, scheduleRefresh]);

  const value = useMemo<SessionContextValue>(
    () => ({
      accessToken,
      user,
      loading,
      error,
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

