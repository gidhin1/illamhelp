import { useMemo, useState } from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LegalHelpContent, type LegalHelpTab } from "./LegalHelpScreen";

import { styles } from "../styles";
import { AppButton, Banner, InputField, SectionCard, AuthMode, MotionView } from "../components";
import { useAppTheme } from "../theme-context";

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
    authFrame: {
      gap: 16,
      backgroundColor: colors.brand,
      borderColor: "rgba(255,255,255,0.18)",
      shadowColor: colors.shadow,
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4
    },
    logoMark: {
      width: 60,
      height: 60,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
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
      fontSize: 36,
      lineHeight: 42,
      fontWeight: "800",
      letterSpacing: -0.45,
      maxWidth: 330
    },
    body: {
      color: "rgba(255,255,255,0.88)",
      fontSize: 16,
      lineHeight: 25,
      maxWidth: 330
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
      fontSize: 13,
      fontWeight: "700"
    },
    trustRail: {
      gap: 8
    },
    studioPanel: {
      gap: 10,
      borderRadius: 14,
      padding: 10,
      backgroundColor: "rgba(255,255,255,0.94)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.46)"
    },
    studioHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10
    },
    studioStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: "rgba(34,197,94,0.14)",
      borderWidth: 1,
      borderColor: "rgba(21,128,61,0.22)"
    },
    studioStatusText: {
      color: "#15803D",
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 17
    },
    studioTime: {
      color: "#6B6580",
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 16
    },
    studioPersonCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 12,
      padding: 12,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(106,90,205,0.18)"
    },
    studioAvatar: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: "#211845",
      alignItems: "center",
      justifyContent: "center"
    },
    studioAvatarText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "800"
    },
    studioCardCopy: {
      flex: 1,
      gap: 2
    },
    studioLabel: {
      color: colors.brandText,
      fontSize: 11,
      fontWeight: "800",
      lineHeight: 14
    },
    studioTitle: {
      color: "#1A1625",
      fontSize: 16,
      fontWeight: "800",
      lineHeight: 20
    },
    studioText: {
      color: "#6B6580",
      fontSize: 13,
      lineHeight: 18
    },
    studioTrack: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 6
    },
    studioTrackSegment: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      backgroundColor: "rgba(106,90,205,0.18)"
    },
    studioTrackSegmentActive: {
      backgroundColor: colors.brand
    },
    studioMediaThumb: {
      width: 96,
      minHeight: 86,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.brand,
      padding: 8
    },
    studioPlay: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.92)"
    },
    studioPlayText: {
      color: colors.brand,
      fontSize: 16,
      fontWeight: "800"
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
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 19
    },
    legal: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20
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
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface
    },
    checkboxActive: {
      borderColor: colors.brand,
      backgroundColor: colors.brand
    },
    checkboxMark: {
      color: colors.onStrong,
      fontSize: 14,
      fontWeight: "900"
    },
    legalLinkRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    legalLink: {
      color: colors.brandText,
      fontSize: 13,
      fontWeight: "800"
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
  const localStyles = useMemo(() => createLocalStyles(theme.colors), [theme.colors]);
  const [legalModalTab, setLegalModalTab] = useState<LegalHelpTab | null>(null);

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
          <Text style={localStyles.heroPill}>Trust signal studio for household work</Text>
          <Text style={localStyles.display}>Know the person before work reaches home.</Text>
          <Text style={localStyles.body}>
            IllamHelp keeps identity, privacy state, and the next safe action visible before contact details move.
          </Text>
          <MotionView
            style={localStyles.studioPanel}
            variant="rise"
            delay={120}
            accessibilityLabel="IllamHelp trust workflow preview"
          >
            <View style={localStyles.studioHeader}>
              <View style={localStyles.studioStatus}>
                <View style={localStyles.signalDot} />
                <Text style={localStyles.studioStatusText}>Review Arun's profile</Text>
              </View>
              <Text style={localStyles.studioTime}>Kochi, 8:40 AM</Text>
            </View>
            <MotionView style={localStyles.studioPersonCard} variant="slide" delay={180}>
              <View style={localStyles.studioAvatar}>
                <Text style={localStyles.studioAvatarText}>A</Text>
              </View>
              <View style={localStyles.studioCardCopy}>
                <Text style={localStyles.studioLabel}>Applicant</Text>
                <Text style={localStyles.studioTitle}>Arun M.</Text>
                <Text style={localStyles.studioText}>Plumber, Kakkanad</Text>
              </View>
              <Text style={localStyles.studioLabel}>Checked</Text>
            </MotionView>
            <MotionView
              style={localStyles.studioTrack}
              variant="fade"
              delay={240}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={[localStyles.studioTrackSegment, localStyles.studioTrackSegmentActive]} />
              <View style={[localStyles.studioTrackSegment, localStyles.studioTrackSegmentActive]} />
              <View style={localStyles.studioTrackSegment} />
            </MotionView>
            <MotionView style={localStyles.studioPersonCard} variant="slide" delay={300}>
              <View style={localStyles.studioMediaThumb}>
                <View style={localStyles.studioPlay}>
                  <Text style={localStyles.studioPlayText}>▶</Text>
                </View>
              </View>
              <View style={localStyles.studioCardCopy}>
                <Text style={localStyles.studioLabel}>Approved media</Text>
                <Text style={localStyles.studioTitle}>Work sample video</Text>
                <Text style={localStyles.studioText}>Visible only where profile rules allow.</Text>
              </View>
            </MotionView>
          </MotionView>
          <MotionView
            style={localStyles.trustRail}
            variant="rise"
            delay={380}
            accessibilityLabel="IllamHelp safety highlights"
          >
            {["Human identity first", "Privacy state visible", "Next safe action named"].map((label) => (
              <View key={label} style={localStyles.trustSignal}>
                <View style={localStyles.signalDot} />
                <Text style={localStyles.trustSignalText}>{label}</Text>
              </View>
            ))}
          </MotionView>
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
              Sign in
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
              placeholder="Create a password"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              testID="auth-register-password"
            />
            <Pressable
              onPress={() => setRegisterForm({ ...registerForm, legalAccepted: !registerForm.legalAccepted })}
              style={({ pressed }) => [
                localStyles.legalAcceptance,
                pressed ? styles.buttonPressed : null
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: registerForm.legalAccepted }}
              accessibilityLabel="Accept current Terms and Privacy Policy"
              testID="auth-register-legal-acceptance"
            >
              <View style={[localStyles.checkbox, registerForm.legalAccepted ? localStyles.checkboxActive : null]}>
                {registerForm.legalAccepted ? <Text style={localStyles.checkboxMark}>✓</Text> : null}
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={localStyles.legal}>
                  I agree to the current Terms and Conditions and Privacy Policy.
                </Text>
                <View style={localStyles.legalLinkRow}>
                  <Pressable
                    onPress={() => setLegalModalTab("terms")}
                    accessibilityRole="button"
                    accessibilityLabel="Open Terms and Conditions"
                    testID="auth-open-terms"
                  >
                    <Text style={localStyles.legalLink}>Terms</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setLegalModalTab("privacy")}
                    accessibilityRole="button"
                    accessibilityLabel="Open Privacy Policy"
                    testID="auth-open-privacy-policy"
                  >
                    <Text style={localStyles.legalLink}>Privacy Policy</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setLegalModalTab("faq")}
                    accessibilityRole="button"
                    accessibilityLabel="Open FAQ"
                    testID="auth-open-faq"
                  >
                    <Text style={localStyles.legalLink}>FAQ</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
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
        <Modal
          visible={legalModalTab !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setLegalModalTab(null)}
        >
          <View style={localStyles.modalBackdrop}>
            <View style={localStyles.modalPanel}>
              <View style={localStyles.modalHeader}>
                <Text style={localStyles.modalTitle}>IllamHelp legal</Text>
                <AppButton label="Close" variant="ghost" onPress={() => setLegalModalTab(null)} />
              </View>
              <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                <LegalHelpContent initialTab={legalModalTab ?? "help"} compact />
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
