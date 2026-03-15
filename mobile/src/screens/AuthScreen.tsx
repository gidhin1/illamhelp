
import {} from "../api";

import {} from "../utils";

import type { PickedImageAsset } from "../media-upload";
import {} from "../constants";
import { useMemo } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { MemberAvatar } from "../member-avatar";
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
import { AppButton, Banner, InputField, SectionCard, AuthMode } from "../components";
import { useAppTheme } from "../theme-context";

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    heroFrame: {
      gap: 14
    },
    logoMark: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line
    },
    logoText: {
      color: colors.brand,
      fontSize: 30,
      fontWeight: "800"
    },
    display: {
      color: colors.ink,
      fontSize: 38,
      lineHeight: 42,
      fontWeight: "800"
    },
    body: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 24
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
  registerAvatar,
  onPickRegisterAvatar,
  onClearRegisterAvatar,
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
  registerAvatar: PickedImageAsset | null;
  onPickRegisterAvatar: () => Promise<void>;
  onClearRegisterAvatar: () => void;
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
        <View style={[styles.authHero, localStyles.heroFrame]}>
          <View style={localStyles.logoMark}>
            <Text style={localStyles.logoText}>I</Text>
          </View>
          <Text style={styles.pill}>Built for homes in Kerala and Tamil Nadu</Text>
          <Text style={localStyles.display}>Trusted help for everyday life.</Text>
          <Text style={localStyles.body}>
            Discover skilled people, post work, manage privacy, and build a trusted local network from one modern member experience.
          </Text>
        </View>

        <View style={styles.modeSwitch}>
          <Pressable
            style={[styles.modeButton, mode === "login" ? styles.modeButtonSelected : null]}
            onPress={() => setMode("login")}
            testID="auth-mode-login"
          >
            <Text style={[styles.modeButtonLabel, mode === "login" ? styles.modeButtonLabelSelected : null]}>
              Sign In
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === "register" ? styles.modeButtonSelected : null]}
            onPress={() => setMode("register")}
            testID="auth-mode-register"
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
          >
            <InputField
              label="Username / Email"
              value={loginForm.username}
              onChangeText={(value) => setLoginForm({ ...loginForm, username: value })}
              placeholder="anita_worker_01"
              autoComplete="off"
              textContentType="none"
              testID="auth-login-username"
            />
            <InputField
              label="Password"
              value={loginForm.password}
              onChangeText={(value) => setLoginForm({ ...loginForm, password: value })}
              placeholder="StrongPass#2026"
              secureTextEntry
              autoComplete="off"
              textContentType="oneTimeCode"
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
              autoComplete="off"
              textContentType="none"
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
              autoComplete="off"
              textContentType="oneTimeCode"
              testID="auth-register-password"
            />
            <SectionCard
              title="Profile picture"
              subtitle="Optional now, moderated before it appears on your profile."
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <MemberAvatar
                  name={registerForm.firstName || registerForm.username || "New member"}
                  avatar={null}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.cardTitle}>
                    {registerAvatar?.fileName ?? "No photo selected"}
                  </Text>
                  <Text style={styles.cardBodyMuted}>
                    Choose a clear face photo. Admin review still applies after upload.
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <AppButton
                    label={registerAvatar ? "Change photo" : "Choose photo"}
                    onPress={() => {
                      void onPickRegisterAvatar();
                    }}
                    variant="secondary"
                    testID="auth-register-avatar-pick"
                  />
                </View>
                {registerAvatar ? (
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Remove"
                      onPress={onClearRegisterAvatar}
                      variant="ghost"
                      testID="auth-register-avatar-clear"
                    />
                  </View>
                ) : null}
              </View>
            </SectionCard>
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
