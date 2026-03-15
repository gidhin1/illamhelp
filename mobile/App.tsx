import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { Keyboard, SafeAreaView, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  authMe,
  AuthenticatedUser,
  AuthSessionResponse,
  getUnreadNotificationCount,
  login,
  register
} from "./src/api";
import type { PickedImageAsset } from "./src/media-upload";
import { pickSingleImage, uploadPickedImage } from "./src/media-upload";
import { AppThemeProvider, useThemePreference } from "./src/theme-context";
import { asError } from "./src/utils";
import { AuthMode } from "./src/components";
import { AuthScreen, LoginFormState, RegisterFormState } from "./src/screens/AuthScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";

const initialLoginForm: LoginFormState = { username: "", password: "" };
const initialRegisterForm: RegisterFormState = {
  firstName: "",
  lastName: "",
  email: "",
  username: "",
  phone: "",
  password: ""
};

function mapSessionUser(session: AuthSessionResponse): AuthenticatedUser {
  return {
    userId: session.userId,
    publicUserId: session.publicUserId,
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
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginForm);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(initialRegisterForm);
  const [registerAvatar, setRegisterAvatar] = useState<PickedImageAsset | null>(null);

  const signOut = useCallback((): void => {
    setAccessToken(null);
    setUser(null);
    setUnreadAlertsCount(0);
    setAuthError(null);
  }, []);

  const applySession = useCallback(
    async (session: AuthSessionResponse): Promise<void> => {
      setAccessToken(session.accessToken);
      setUser(mapSessionUser(session));
      try {
        const profile = await authMe(session.accessToken);
        setUser(profile);
      } catch (requestError) {
        signOut();
        throw requestError;
      }
    },
    [signOut]
  );

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
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await login(loginForm);
      await applySession(session);
      setLoginForm(initialLoginForm);
    } catch (requestError) {
      setAuthError(asError(requestError, "Unable to sign in"));
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
      if (normalizedUserId.length < 3) {
        throw new Error("User ID must be at least 3 characters.");
      }
      const session = await register({
        username: normalizedUserId,
        email: registerForm.email.trim(),
        password: registerForm.password,
        firstName: registerForm.firstName.trim(),
        lastName: registerForm.lastName.trim() || undefined,
        phone: registerForm.phone.trim() || undefined
      });
      if (registerAvatar) {
        await uploadPickedImage(registerAvatar, session.accessToken, "profile_avatar").catch((requestError) => {
          console.warn("Avatar upload skipped after registration", requestError);
        });
      }
      await applySession(session);
      setRegisterForm(initialRegisterForm);
      setRegisterAvatar(null);
    } catch (requestError) {
      setAuthError(asError(requestError, "Unable to register"));
    } finally {
      setAuthBusy(false);
    }
  }, [applySession, registerAvatar, registerForm]);

  const onPickRegisterAvatar = useCallback(async (): Promise<void> => {
    try {
      const asset = await pickSingleImage();
      if (asset) {
        setRegisterAvatar(asset);
      }
    } catch (requestError) {
      setAuthError(asError(requestError, "Unable to choose profile photo"));
    }
  }, []);

  if (accessToken && user) {
    return (
      <AppNavigator
        accessToken={accessToken}
        user={user}
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
      registerAvatar={registerAvatar}
      onPickRegisterAvatar={onPickRegisterAvatar}
      onClearRegisterAvatar={() => setRegisterAvatar(null)}
      onLogin={onLogin}
      onRegister={onRegister}
    />
  );
}

export default function App(): JSX.Element {
  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <AppThemeProvider>
          <AppContent />
        </AppThemeProvider>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}
