import type { JSX } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Checkbox } from "react-native-paper";
import { House, LockKeyhole } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LegalHelpContent, type LegalHelpTab } from "./LegalHelpScreen";


import { AppButton, Banner, InputField, SectionCard, AuthMode } from "../components";
import { useAppTheme, useAppStyles } from "../theme-context";

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
  legalAccepted: boolean;
}

function createLocalStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    welcome: {
      gap: 8,
      paddingBottom: 4
    },
    brand: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    logoMark: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceAlt
    },
    brandName: {
      flexShrink: 1,
      color: colors.brandText,
      fontSize: 15,
      fontWeight: "700"
    },
    display: {
      color: colors.ink,
      fontSize: 28,
      lineHeight: 34,
      fontWeight: "800",
      letterSpacing: -0.55
    },
    displayAccent: {
      color: colors.brandText
    },
    body: {
      color: colors.muted,
      fontSize: 15,
      lineHeight: 21
    },
    privacy: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      paddingHorizontal: 4
    },
    privacyText: {
      flex: 1,
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    legal: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20
    },
    legalAgreement: {
      textAlign: "left",
      marginLeft: 8
    },
    legalCheckbox: {
      paddingHorizontal: 0
    },
    legalAcceptance: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceAlt
    },
    legalLinkRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.46)",
      justifyContent: "flex-end"
    },
    modalPanel: {
      maxHeight: "88%",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 18,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.line
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14
    },
    modalTitle: {
      color: colors.ink,
      fontSize: 20,
      fontWeight: "800"
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
  const styles = useAppStyles();
  const localStyles = useMemo(() => createLocalStyles(theme.colors), [theme.colors]);
  const legalScroll = useRef<ScrollView>(null);
  const [legalModalTab, setLegalModalTab] = useState<LegalHelpTab | null>(null);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.authContainer}
        testID="auth-scroll"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <View style={localStyles.welcome}>
          <View style={localStyles.brand}>
            <View style={localStyles.logoMark} accessible={false} importantForAccessibility="no">
              <House size={17} color={theme.colors.brandText} />
            </View>
            <Text style={localStyles.brandName}>IllamHelp</Text>
          </View>
          <Text style={localStyles.display} accessibilityRole="header">
            Find help at home.{"\n"}
            <Text style={localStyles.displayAccent}>Find work nearby.</Text>
          </Text>
          <Text style={localStyles.body}>Post a household job or apply for work anywhere in India.</Text>
        </View>

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
              Sign in
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === "register" ? styles.modeButtonSelected : null]}
            onPress={() => setMode("register")}
            testID="auth-mode-register"
            accessibilityRole="tab"
            accessibilityLabel="Create account"
            accessibilityState={{ selected: mode === "register" }}
          >
            <Text
              style={[
                styles.modeButtonLabel,
                mode === "register" ? styles.modeButtonLabelSelected : null
              ]}
            >
              Create account
            </Text>
          </Pressable>
        </View>

        {error ? <Banner tone="error" message={error} testID="auth-error-banner" /> : null}

        {mode === "login" ? (
          <SectionCard
            key="login"
            title="Sign in"
            subtitle="Sign in with your username or email and password."
            motion="rise"
          >
            <InputField
              label="Username or email"
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
              placeholder="Enter your password"
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
            key="register"
            title="Create account"
            subtitle="Post jobs or offer your services."
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
              label="Member ID"
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
              placeholder="Create a password"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              testID="auth-register-password"
            />
            <View style={localStyles.legalAcceptance}>
              <View style={{ flex: 1, gap: 8 }}>
                <Checkbox.Item
                  mode="android"
                  label="I agree to the current Terms and Conditions and Privacy Policy."
                  status={registerForm.legalAccepted ? "checked" : "unchecked"}
                  onPress={() => setRegisterForm({ ...registerForm, legalAccepted: !registerForm.legalAccepted })}
                  accessibilityLabel="Accept current Terms and Privacy Policy"
                  testID="auth-register-legal-acceptance"
                  position="leading"
                  style={localStyles.legalCheckbox}
                  labelStyle={[localStyles.legal, localStyles.legalAgreement]}
                />
                <View style={localStyles.legalLinkRow}>
                  <AppButton label="Terms" variant="ghost" onPress={() => setLegalModalTab("terms")} accessibilityLabel="Open Terms and Conditions" testID="auth-open-terms" />
                  <AppButton label="Privacy Policy" variant="ghost" onPress={() => setLegalModalTab("privacy")} accessibilityLabel="Open Privacy Policy" testID="auth-open-privacy-policy" />
                  <AppButton label="FAQ" variant="ghost" onPress={() => setLegalModalTab("faq")} accessibilityLabel="Open FAQ" testID="auth-open-faq" />
                </View>
              </View>
            </View>
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

        <View style={localStyles.privacy}>
          <LockKeyhole size={16} color={theme.colors.brandText} accessible={false} importantForAccessibility="no" />
          <Text style={localStyles.privacyText}>
            Your contact details stay private until you choose to share them with a connection.
          </Text>
        </View>
        <Modal
          visible={legalModalTab !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setLegalModalTab(null)}
        >
          <SafeAreaView style={localStyles.modalBackdrop}>
            <View style={localStyles.modalPanel}>
              <View style={localStyles.modalHeader}>
                <Text style={localStyles.modalTitle}>Registration help</Text>
                <AppButton label="Close" variant="ghost" onPress={() => setLegalModalTab(null)} />
              </View>
              <ScrollView ref={legalScroll} contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
                {legalModalTab ? <LegalHelpContent key={legalModalTab} initialTab={legalModalTab} compact
                  onScrollTo={(y) => legalScroll.current?.scrollTo({ y, animated: false })} /> : null}
              </ScrollView>
            </View>
          </SafeAreaView>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
