
import {} from "../api";

import {} from "../utils";

import {} from "../constants";
import { useMemo } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
export interface LoginFormState {
  username: string;
  password: string;
}
export interface RegisterFormState {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  phone: string;
  password: string;
}

import {} from "../theme";
import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard, AuthMode, MotionView } from "../components";
import { useAppTheme } from "../theme-context";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    authFrame: {
      gap: 14,
      backgroundColor: colors.brand,
      borderColor: colors.brand,
      shadowColor: colors.shadow,
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4
    },
    logoMark: {
      width: 56,
      height: 56,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.onStrong,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.42)"
    },
    logoText: {
      color: colors.brand,
      fontSize: 30,
      fontWeight: "700"
    },
    display: {
      color: colors.onStrong,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: "700"
    },
    body: {
      color: "rgba(255,255,255,0.86)",
      fontSize: 16,
      lineHeight: 24
    },
    heroPill: {
      alignSelf: "flex-start",
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.28)",
      color: colors.onStrong,
      overflow: "hidden",
      fontSize: 12,
      fontWeight: "700"
    },
    trustRail: {
      gap: 8
    },
    trustSignal: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.24)"
    },
    signalDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.onStrong
    },
    trustSignalText: {
      flex: 1,
      color: colors.onStrong,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 18
    },
    legal: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    }
  });
}

export function AuthScreen({
  mode,
  setMode,
  loginForm,
  setLoginForm,
  registerForm,
  setRegisterForm,
  busy,
  error,
  onLogin,
  onRegister
}: {
  mode: AuthMode;
  setMode: (next: AuthMode) => void;
  loginForm: LoginFormState;
  setLoginForm: (next: LoginFormState) => void;
  registerForm: RegisterFormState;
  setRegisterForm: (next: RegisterFormState) => void;
  busy: boolean;
  error: string | null;
  onLogin: () => Promise<void>;
  onRegister: () => Promise<void>;
}): JSX.Element {
  const theme = useAppTheme();
  const localStyles = useMemo(() => createLocalStyles(theme.colors), [theme.colors]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
      <ScrollView
        contentContainerStyle={styles.authContainer}
        testID="auth-scroll"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <MotionView style={[styles.authHero, localStyles.authFrame]} variant="rise">
          <View style={localStyles.logoMark}>
            <Text style={localStyles.logoText}>I</Text>
          </View>
          <Text style={localStyles.heroPill}>Built for homes in Kerala and Tamil Nadu</Text>
          <Text style={localStyles.display}>Trusted help for everyday life.</Text>
          <Text style={localStyles.body}>
            Discover skilled people, post work, manage privacy, and build a trusted local network from one modern member experience.
          </Text>
          <View style={localStyles.trustRail} accessibilityLabel="IllamHelp safety highlights">
            {["Private contact sharing", "Profile and media review", "Jobs with clear next steps"].map((label) => (
              <View key={label} style={localStyles.trustSignal}>
                <View style={localStyles.signalDot} />
                <Text style={localStyles.trustSignalText}>{label}</Text>
              </View>
            ))}
          </View>
        </MotionView>

        <View style={styles.modeSwitch}>
          <Pressable
            style={[styles.modeButton, mode === "login" ? styles.modeButtonSelected : null]}
            onPress={() => setMode("login")}
            testID="auth-mode-login"
            accessibilityRole="tab"
            accessibilityLabel="Sign in"
            accessibilityState={{ selected: mode === "login" }}
          >
            <Text style={[styles.modeButtonLabel, mode === "login" ? styles.modeButtonLabelSelected : null]}>
              Sign In
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === "register" ? styles.modeButtonSelected : null]}
            onPress={() => setMode("register")}
            testID="auth-mode-register"
            accessibilityRole="tab"
            accessibilityLabel="Register"
            accessibilityState={{ selected: mode === "register" }}
          >
            <Text
              style={[
                styles.modeButtonLabel,
                mode === "register" ? styles.modeButtonLabelSelected : null
              ]}
            >
              Register
            </Text>
          </Pressable>
        </View>

        {error ? <Banner tone="error" message={error} testID="auth-error-banner" /> : null}

        {mode === "login" ? (
          <SectionCard
            title="Sign in"
            subtitle="Use your username/email and password."
            motion="rise"
          >
            <InputField
              label="Username / Email"
              value={loginForm.username}
              onChangeText={(value) => setLoginForm({ ...loginForm, username: value })}
              placeholder="anita_worker_01"
              autoComplete="username"
              textContentType="username"
              testID="auth-login-username"
            />
            <InputField
              label="Password"
              value={loginForm.password}
              onChangeText={(value) => setLoginForm({ ...loginForm, password: value })}
              placeholder="StrongPass#2026"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              testID="auth-login-password"
            />
            <AppButton
              label={busy ? "Signing in..." : "Sign in"}
              onPress={() => {
                void onLogin();
              }}
              disabled={busy}
              testID="auth-login-submit"
            />
          </SectionCard>
        ) : (
          <SectionCard
            title="Create account"
            subtitle="Create your account and start posting work or offering services."
            motion="rise"
          >
            <InputField
              label="First name"
              value={registerForm.firstName}
              onChangeText={(value) => setRegisterForm({ ...registerForm, firstName: value })}
              placeholder="Anita"
              autoCapitalize="words"
              testID="auth-register-first-name"
            />
            <InputField
              label="Last name (optional)"
              value={registerForm.lastName}
              onChangeText={(value) => setRegisterForm({ ...registerForm, lastName: value })}
              placeholder="K"
              autoCapitalize="words"
              testID="auth-register-last-name"
            />
            <InputField
              label="Email"
              value={registerForm.email}
              onChangeText={(value) => setRegisterForm({ ...registerForm, email: value })}
              placeholder="anita@example.com"
              autoComplete="email"
              textContentType="emailAddress"
              testID="auth-register-email"
            />
            <InputField
              label="User ID"
              value={registerForm.username}
              onChangeText={(value) => setRegisterForm({ ...registerForm, username: value })}
              placeholder="anita_worker_01"
              autoComplete="username"
              textContentType="username"
              testID="auth-register-username"
            />
            <InputField
              label="Phone (optional)"
              value={registerForm.phone}
              onChangeText={(value) => setRegisterForm({ ...registerForm, phone: value })}
              placeholder="+919876543210"
              autoComplete="tel"
              textContentType="telephoneNumber"
              testID="auth-register-phone"
            />
            <InputField
              label="Password"
              value={registerForm.password}
              onChangeText={(value) => setRegisterForm({ ...registerForm, password: value })}
              placeholder="StrongPass#2026"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              testID="auth-register-password"
            />
            <AppButton
              label={busy ? "Creating..." : "Create account"}
              onPress={() => {
                void onRegister();
              }}
              disabled={busy}
              testID="auth-register-submit"
            />
          </SectionCard>
        )}

        <Text style={localStyles.legal}>
          By continuing, you agree to a trust-first experience where contact details stay protected until you explicitly approve sharing.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
