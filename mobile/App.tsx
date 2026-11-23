import type { JSX } from "react";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Keyboard, SafeAreaView, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CURRENT_LEGAL_VERSIONS } from "@illamhelp/shared-types";

import {
  ApiRequestError,
  authMe,
  AuthenticatedUser,
  AuthSessionResponse,
  getUnreadNotificationCount,
  login,
  refreshSession,
  register
} from "./src/api";
import { AnalyticsConsentBanner } from "./src/AnalyticsConsentBanner";
import { identifyAnalyticsUser, trackEvent } from "./src/analytics";
import { AppThemeProvider, useAppTheme, useThemePreference } from "./src/theme-context";
import { asError } from "./src/utils";
import { AuthMode } from "./src/components";
import { AuthScreen, LoginFormState, RegisterFormState } from "./src/screens/AuthScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { createSessionRefresh } from "./src/session-refresh";

const initialLoginForm: LoginFormState = { username: "", password: "" };
const initialRegisterForm: RegisterFormState = {
  firstName: "",
  lastName: "",
  email: "",
  username: "",
  phone: "",
  password: "",
  legalAccepted: false
};

function mapSessionUser(session: AuthSessionResponse): AuthenticatedUser {
  return {
    userId: session.userId,
    publicUserId: session.publicUserId,
    analyticsUserId: session.analyticsUserId,
    roles: session.roles,
    userType: session.userType,
    tokenSubject: session.userId
  };
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): { error: string } {
    return {
      error: error instanceof Error ? error.message : "Unexpected mobile render failure"
    };
  }

  componentDidCatch(error: unknown): void {
    console.error("IllamHelp mobile root render failed", error);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#0F0F14" }}>
          <StatusBar style="light" />
          <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "700" }}>
              IllamHelp failed to load
            </Text>
            <Text style={{ color: "#B8B4C7", fontSize: 15 }}>{this.state.error}</Text>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

function AppContent(): JSX.Element {
  const { preference, setPreference } = useThemePreference();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<{
    credentials: AuthSessionResponse;
    receivedAt: number;
    user: AuthenticatedUser;
  } | null>(null);
  const stopSessionRefresh = useRef<(() => void) | null>(null);
  const accessToken = session?.credentials.accessToken;
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginForm);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(initialRegisterForm);

  const signOut = useCallback((): void => {
    stopSessionRefresh.current?.();
    setSession(null);
    setUnreadAlertsCount(0);
    setAuthError(null);
  }, []);

  const applySession = useCallback(async (credentials: AuthSessionResponse): Promise<void> => {
    const receivedAt = Date.now();
    const user = await authMe(credentials.accessToken);
    setSession({ credentials, receivedAt, user });
    identifyAnalyticsUser(user.analyticsUserId);
  }, []);

  useEffect(() => {
    if (!session) return;

    const refresh = createSessionRefresh(
      session.credentials,
      session.receivedAt,
      refreshSession,
      (error) => error instanceof ApiRequestError && [400, 401, 403].includes(error.status),
      (credentials) => {
        const receivedAt = Date.now();
        const user = mapSessionUser(credentials);
        setSession({ credentials, receivedAt, user });
        identifyAnalyticsUser(user.analyticsUserId);
      },
      () => {
        signOut();
        setAuthMode("login");
        setAuthError("Your session expired. Sign in again.");
      }
    );
    stopSessionRefresh.current = refresh.stop;
    const subscription = AppState.addEventListener("change", (state) => refresh.setActive(state === "active"));
    refresh.setActive(AppState.currentState === "active" || AppState.currentState == null);
    return () => {
      refresh.stop();
      stopSessionRefresh.current = null;
      subscription.remove();
    };
  }, [session, signOut]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let cancelled = false;
    const loadUnread = async (): Promise<void> => {
      try {
        const response = await getUnreadNotificationCount(accessToken);
        if (!cancelled) {
          setUnreadAlertsCount(response.unreadCount);
        }
      } catch {
        if (!cancelled) {
          setUnreadAlertsCount(0);
        }
      }
    };
    void loadUnread();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const onLogin = useCallback(async (): Promise<void> => {
    Keyboard.dismiss();
    if (!loginForm.username.trim()) {
      setAuthError("Enter your username or email.");
      return;
    }
    if (!loginForm.password) {
      setAuthError("Enter your password.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await login(loginForm);
      await applySession(session);
      setLoginForm(initialLoginForm);
    } catch (requestError) {
      setAuthError(asError(requestError, "Couldn’t sign in. Try again."));
    } finally {
      setAuthBusy(false);
    }
  }, [applySession, loginForm]);

  const onRegister = useCallback(async (): Promise<void> => {
    Keyboard.dismiss();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const normalizedUserId = registerForm.username.trim().toLowerCase();
      trackEvent("signup_started", {
        surface: "mobile",
        source: "register_form"
      });
      if (normalizedUserId.length < 3) {
        throw new Error("Enter a member ID with at least 3 characters.");
      }
      if (!registerForm.legalAccepted) {
        throw new Error("Accept the current Terms and Privacy Policy to create an account.");
      }
      const session = await register({
        username: normalizedUserId,
        email: registerForm.email.trim(),
        password: registerForm.password,
        firstName: registerForm.firstName.trim(),
        lastName: registerForm.lastName.trim() || undefined,
        phone: registerForm.phone.trim() || undefined,
        acceptedTermsVersion: CURRENT_LEGAL_VERSIONS.terms,
        acceptedPrivacyPolicyVersion: CURRENT_LEGAL_VERSIONS.privacyPolicy,
        acceptedLegalAt: new Date().toISOString(),
        acceptanceSource: "mobile"
      });
      await applySession(session);
      setRegisterForm(initialRegisterForm);
    } catch (requestError) {
      setAuthError(asError(requestError, "Couldn’t create your account. Check your details and try again."));
    } finally {
      setAuthBusy(false);
    }
  }, [applySession, registerForm]);

  if (session) {
    return (
      <AppNavigator
        accessToken={session.credentials.accessToken}
        user={session.user}
        unreadAlertsCount={unreadAlertsCount}
        signOut={signOut}
        setUnreadAlertsCount={setUnreadAlertsCount}
        themePreference={preference}
        setThemePreference={setPreference}
      />
    );
  }

  return (
    <AuthScreen
      mode={authMode}
      setMode={setAuthMode}
      loginForm={loginForm}
      setLoginForm={setLoginForm}
      registerForm={registerForm}
      setRegisterForm={setRegisterForm}
      busy={authBusy}
      error={authError}
      onLogin={onLogin}
      onRegister={onRegister}
    />
  );
}

function ThemedApp(): JSX.Element {
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
      <AppContent />
      <AnalyticsConsentBanner />
    </View>
  );
}

export default function App(): JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootErrorBoundary>
        <SafeAreaProvider>
          <AppThemeProvider>
            <ThemedApp />
          </AppThemeProvider>
        </SafeAreaProvider>
      </RootErrorBoundary>
    </GestureHandlerRootView>
  );
}
