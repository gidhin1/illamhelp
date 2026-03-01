import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View
} from "react-native";

import {
  acceptConnection,
  AccessRequestRecord,
  authMe,
  AuthenticatedUser,
  AuthSessionResponse,
  blockConnection,
  canViewConsent,
  completeMediaUpload,
  ConnectionSearchCandidate,
  ConnectionRecord,
  CONSENT_FIELDS,
  ConsentField,
  ConsentGrantRecord,
  createMediaUploadTicket,
  createJob,
  declineConnection,
  formatDate,
  getMyProfile,
  grantConsent,
  JobRecord,
  listConnections,
  listConsentGrants,
  listConsentRequests,
  listJobs,
  listMyMedia,
  listPublicApprovedMedia,
  login,
  MediaAssetRecord,
  PublicMediaAssetRecord,
  ProfileRecord,
  register,
  requestConnection,
  requestConsentAccess,
  revokeConsent,
  searchConnections,
  updateMyProfile
} from "./src/api";
import { theme } from "./src/theme";

type TabKey = "home" | "jobs" | "connections" | "consent" | "profile";
type AuthMode = "login" | "register";
type ButtonVariant = "primary" | "secondary" | "ghost";

const tabs: { key: TabKey; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "jobs", label: "Jobs" },
  { key: "connections", label: "People" },
  { key: "consent", label: "Privacy" },
  { key: "profile", label: "Profile" }
];

const MAX_RENDER_ROWS = 30;

const CONSENT_FIELD_LABELS: Record<ConsentField, string> = {
  phone: "Phone number",
  alternate_phone: "Alternate phone",
  email: "Email address",
  full_address: "Home address"
};

interface CreateJobPayload {
  category: string;
  title: string;
  description: string;
  locationText: string;
  visibility: "public" | "connections_only";
}

function validateJobPayload(payload: CreateJobPayload): string | null {
  const errors: string[] = [];
  if (payload.category.length < 2) {
    errors.push("Category must be at least 2 characters");
  }
  if (payload.title.length < 4) {
    errors.push("Title must be at least 4 characters");
  }
  if (payload.description.length < 10) {
    errors.push("Description must be at least 10 characters");
  }
  if (payload.locationText.length < 2) {
    errors.push("Location must be at least 2 characters");
  }

  return errors.length > 0 ? errors.join(", ") : null;
}

function randomHex(length: number): string {
  const alphabet = "0123456789abcdef";
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface LoginFormState {
  username: string;
  password: string;
}

interface RegisterFormState {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  phone: string;
  password: string;
}

interface ProfileFormState {
  firstName: string;
  lastName: string;
  city: string;
  area: string;
  serviceCategories: string;
  email: string;
  phone: string;
  alternatePhone: string;
  fullAddress: string;
}

function buildProfileForm(profile: ProfileRecord): ProfileFormState {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName ?? "",
    city: profile.city ?? "",
    area: profile.area ?? "",
    serviceCategories: profile.serviceCategories.join(", "),
    email: profile.contact.email ?? "",
    phone: profile.contact.phone ?? "",
    alternatePhone: profile.contact.alternatePhone ?? "",
    fullAddress: profile.contact.fullAddress ?? ""
  };
}

function parseServiceCategories(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const initialLoginForm: LoginFormState = {
  username: "",
  password: ""
};

const initialRegisterForm: RegisterFormState = {
  firstName: "",
  lastName: "",
  email: "",
  username: "",
  phone: "",
  password: ""
};

function shouldForceSignOut(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("unauthorized") ||
    normalized.includes("authorization") ||
    normalized.includes("invalid or expired bearer token") ||
    normalized.includes("token")
  );
}

function asError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  testID
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
}): JSX.Element {
  const buttonStyles = [
    styles.button,
    variant === "secondary" ? styles.buttonSecondary : null,
    variant === "ghost" ? styles.buttonGhost : null,
    disabled ? styles.buttonDisabled : null
  ];
  const textStyles = [
    styles.buttonLabel,
    variant === "ghost" ? styles.buttonLabelGhost : null
  ];
  return (
    <Pressable style={buttonStyles} disabled={disabled} onPress={onPress} testID={testID}>
      <Text style={textStyles}>{label}</Text>
    </Pressable>
  );
}

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoComplete = "off",
  textContentType = "none",
  autoCapitalize = "none",
  multiline = false,
  testID
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  testID?: string;
}): JSX.Element {
  return (
    <View style={styles.formField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline ? styles.inputMultiline : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        secureTextEntry={secureTextEntry}
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={textContentType}
        importantForAutofill="no"
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        testID={testID}
      />
    </View>
  );
}

function SectionCard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardBody}>{subtitle}</Text> : null}
      <View style={styles.stackSmall}>{children}</View>
    </View>
  );
}

function Banner({
  tone,
  message,
  testID
}: {
  tone: "error" | "success" | "info";
  message: string;
  testID?: string;
}): JSX.Element {
  return (
    <View
      style={[
        styles.banner,
        tone === "error" ? styles.bannerError : null,
        tone === "success" ? styles.bannerSuccess : null,
        tone === "info" ? styles.bannerInfo : null
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.bannerText,
          tone === "error" ? styles.bannerTextError : null,
          tone === "success" ? styles.bannerTextSuccess : null,
          tone === "info" ? styles.bannerTextInfo : null
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

function TabBar({
  activeTab,
  onSelect
}: {
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
}): JSX.Element {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const selected = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            style={[styles.tabButton, selected ? styles.tabButtonSelected : null]}
            testID={`tab-${tab.key}`}
          >
            <Text style={[styles.tabButtonLabel, selected ? styles.tabButtonLabelSelected : null]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AuthScreen({
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
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.authContainer}
        testID="auth-scroll"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.authHero}>
          <Text style={styles.pill}>Built for homes in Kerala and Tamil Nadu</Text>
          <Text style={styles.authTitle}>IllamHelp</Text>
          <Text style={styles.authSubtitle}>
            Find trusted help for your home with privacy-first connections.
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
            title="Register"
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
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeScreen({
  accessToken,
  onSessionInvalid
}: {
  accessToken: string;
  onSessionInvalid: () => void;
}): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobsCount, setJobsCount] = useState(0);
  const [connectionsCount, setConnectionsCount] = useState(0);
  const [pendingConsents, setPendingConsents] = useState(0);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [jobs, connections, consentRequests] = await Promise.all([
        listJobs(accessToken),
        listConnections(accessToken),
        listConsentRequests(accessToken)
      ]);
      setJobsCount(jobs.length);
      setConnectionsCount(connections.length);
      setPendingConsents(consentRequests.filter((item) => item.status === "pending").length);
    } catch (requestError) {
      const message = asError(requestError, "Failed to load dashboard");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSessionInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="home-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Home</Text>
        <Text style={styles.screenTitle}>Your activity at a glance</Text>
        <Text style={styles.screenSubtitle}>
          Track jobs, people connections, and privacy requests in one place.
        </Text>
      </View>
      {error ? <Banner tone="error" message={error} /> : null}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Jobs</Text>
          <Text style={styles.kpiValue}>{jobsCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Connections</Text>
          <Text style={styles.kpiValue}>{connectionsCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Pending privacy requests</Text>
          <Text style={styles.kpiValue}>{pendingConsents}</Text>
        </View>
      </View>
      <SectionCard
        title="Media safety"
        subtitle="All image/video uploads are restricted to professional service evidence."
      >
        <Text style={styles.cardBody}>
          Files remain private until AI and human reviewers approve them for public display.
        </Text>
      </SectionCard>
      <AppButton
        label={loading ? "Refreshing..." : "Refresh dashboard"}
        onPress={() => {
          void load();
        }}
        variant="ghost"
        disabled={loading}
        testID="home-refresh"
      />
    </ScrollView>
  );
}

function JobsScreen({
  accessToken,
  onSessionInvalid
}: {
  accessToken: string;
  onSessionInvalid: () => void;
}): JSX.Element {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [visibility, setVisibility] = useState<"public" | "connections_only">("public");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const latestDraftRef = useRef<CreateJobPayload>({
    category: "",
    title: "",
    description: "",
    locationText: "",
    visibility: "public"
  });
  const visibleJobs = useMemo(() => jobs.slice(0, MAX_RENDER_ROWS), [jobs]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await listJobs(accessToken);
      setJobs(result);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load jobs");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSessionInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (): Promise<void> => {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const payload: CreateJobPayload = {
      category: latestDraftRef.current.category.trim(),
      title: latestDraftRef.current.title.trim(),
      description: latestDraftRef.current.description.trim(),
      locationText: latestDraftRef.current.locationText.trim(),
      visibility: latestDraftRef.current.visibility
    };

    const validationError = validateJobPayload(payload);
    if (validationError) {
      setSubmitError(validationError);
      setSubmitting(false);
      return;
    }

    try {
      const created = await createJob(payload, accessToken);
      setJobs((previous) => [created, ...previous]);
      setSubmitSuccess("Job posted.");
      latestDraftRef.current = {
        category: "",
        title: "",
        description: "",
        locationText: "",
        visibility: "public"
      };
      setCategory("");
      setTitle("");
      setDescription("");
      setLocationText("");
      setVisibility("public");
    } catch (requestError) {
      const message = asError(requestError, "Unable to create job");
      setSubmitError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="jobs-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Jobs</Text>
        <Text style={styles.screenTitle}>Post new work</Text>
        <Text style={styles.screenSubtitle}>Create and track service requests.</Text>
      </View>
      {error ? <Banner tone="error" message={error} testID="jobs-error-banner" /> : null}
      {submitError ? <Banner tone="error" message={submitError} testID="jobs-submit-error-banner" /> : null}
      {submitSuccess ? <Banner tone="success" message={submitSuccess} testID="jobs-success-banner" /> : null}

      <SectionCard title="Create job">
        <InputField
          label="Category"
          value={category}
          onChangeText={(value) => {
            latestDraftRef.current.category = value;
            setCategory(value);
          }}
          placeholder="plumber"
          testID="jobs-category"
        />
        <InputField
          label="Title"
          value={title}
          onChangeText={(value) => {
            latestDraftRef.current.title = value;
            setTitle(value);
          }}
          placeholder="Kitchen sink leakage repair"
          testID="jobs-title"
        />
        <InputField
          label="Description"
          value={description}
          onChangeText={(value) => {
            latestDraftRef.current.description = value;
            setDescription(value);
          }}
          placeholder="Need urgent service support."
          multiline
          testID="jobs-description"
        />
        <InputField
          label="Location"
          value={locationText}
          onChangeText={(value) => {
            latestDraftRef.current.locationText = value;
            setLocationText(value);
          }}
          placeholder="Kakkanad, Kochi"
          testID="jobs-location"
        />
        <Text style={styles.fieldLabel}>Visibility</Text>
        <View style={styles.roleRow}>
          <Pressable
            style={[styles.roleChip, visibility === "public" ? styles.roleChipSelected : null]}
            onPress={() => {
              latestDraftRef.current.visibility = "public";
              setVisibility("public");
            }}
            testID="jobs-visibility-public"
          >
            <Text
              style={[
                styles.roleChipLabel,
                visibility === "public" ? styles.roleChipLabelSelected : null
              ]}
            >
              Public
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.roleChip,
              visibility === "connections_only" ? styles.roleChipSelected : null
            ]}
            onPress={() => {
              latestDraftRef.current.visibility = "connections_only";
              setVisibility("connections_only");
            }}
            testID="jobs-visibility-connections"
          >
            <Text
              style={[
                styles.roleChipLabel,
                visibility === "connections_only" ? styles.roleChipLabelSelected : null
              ]}
            >
              Connections only
            </Text>
          </Pressable>
        </View>
        <AppButton
          label={submitting ? "Posting..." : "Post job"}
          onPress={() => {
            void onCreate();
          }}
          disabled={submitting}
          testID="jobs-submit"
        />
      </SectionCard>

      <SectionCard title="Open jobs">
        {loading ? <Text style={styles.cardBodyMuted}>Loading jobs...</Text> : null}
        {!loading && jobs.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No jobs yet.</Text>
        ) : null}
        {!loading && jobs.length > MAX_RENDER_ROWS ? (
          <Text style={styles.cardBodyMuted}>
            Showing latest {MAX_RENDER_ROWS} of {jobs.length} jobs.
          </Text>
        ) : null}
        {visibleJobs.map((job) => (
          <View key={job.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>{job.title}</Text>
            <Text style={styles.dataMeta}>
              {job.category} · {job.locationText}
            </Text>
            <Text style={styles.dataMeta}>
              Visibility: {job.visibility === "connections_only" ? "Connections only" : "Public"}
            </Text>
            <Text style={styles.dataMeta}>{job.status}</Text>
            <Text style={styles.dataMeta}>{formatDate(job.createdAt)}</Text>
          </View>
        ))}
        <AppButton
          label={loading ? "Refreshing..." : "Refresh jobs"}
          onPress={() => {
            void load();
          }}
          variant="ghost"
          disabled={loading}
          testID="jobs-refresh"
        />
      </SectionCard>
    </ScrollView>
  );
}

function ConnectionsScreen({
  accessToken,
  user,
  onSessionInvalid
}: {
  accessToken: string;
  user: AuthenticatedUser;
  onSessionInvalid: () => void;
}): JSX.Element {
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [matches, setMatches] = useState<ConnectionSearchCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const visibleConnections = useMemo(
    () => connections.slice(0, MAX_RENDER_ROWS),
    [connections]
  );
  const visibleMatches = useMemo(() => matches.slice(0, 8), [matches]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listConnections(accessToken);
      setConnections(rows);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load connections");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSessionInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRequest = async (payload: {
    targetUserId?: string;
    targetQuery?: string;
  }): Promise<void> => {
    setSubmitting(true);
    setSubmitMessage(null);
    setError(null);
    try {
      const connection = await requestConnection(payload, accessToken);
      setConnections((previous) => [connection, ...previous]);
      setTargetQuery("");
      setMatches([]);
      setSubmitMessage("Connection request sent.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to request connection");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onRequest = async (): Promise<void> => {
    const normalizedQuery = targetQuery.trim();
    if (!normalizedQuery) {
      setError("Enter a name, member ID, service, or location.");
      return;
    }
    await submitRequest({ targetQuery: normalizedQuery });
  };

  const onSearch = async (): Promise<void> => {
    setSearching(true);
    setError(null);
    try {
      const rows = await searchConnections({ q: targetQuery.trim(), limit: 8 }, accessToken);
      setMatches(rows);
    } catch (requestError) {
      const message = asError(requestError, "Unable to search people");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSearching(false);
    }
  };

  const onAccept = async (connectionId: string): Promise<void> => {
    setSubmitMessage(null);
    setError(null);
    try {
      const updated = await acceptConnection(connectionId, accessToken);
      setConnections((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      setSubmitMessage("Connection accepted.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to accept connection");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    }
  };

  const onDecline = async (connectionId: string): Promise<void> => {
    setSubmitMessage(null);
    setError(null);
    try {
      const updated = await declineConnection(connectionId, accessToken);
      setConnections((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      setSubmitMessage("Connection request declined.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to decline connection");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    }
  };

  const onBlock = async (connectionId: string): Promise<void> => {
    setSubmitMessage(null);
    setError(null);
    try {
      const updated = await blockConnection(connectionId, accessToken);
      setConnections((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      setSubmitMessage("Person blocked.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to block person");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="connections-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>People</Text>
        <Text style={styles.screenTitle}>Connect with people you trust</Text>
        <Text style={styles.screenSubtitle}>
          Search by name, member ID, service, or location.
        </Text>
      </View>

      {error ? <Banner tone="error" message={error} testID="connections-error-banner" /> : null}
      {submitMessage ? <Banner tone="success" message={submitMessage} testID="connections-success-banner" /> : null}

      <SectionCard title="Find and connect">
        <InputField
          label="Find a person"
          value={targetQuery}
          onChangeText={setTargetQuery}
          placeholder="e.g. Anita, plumber kochi, or member ID"
          testID="connections-target-user-id"
        />
        <AppButton
          label={searching ? "Searching..." : "Search"}
          onPress={() => {
            void onSearch();
          }}
          variant="ghost"
          disabled={searching || submitting}
          testID="connections-search-submit"
        />
        <AppButton
          label={submitting ? "Sending..." : "Send request"}
          onPress={() => {
            void onRequest();
          }}
          disabled={submitting}
          testID="connections-request-submit"
        />
        {visibleMatches.length > 0 ? (
          <View style={styles.stackSmall}>
            <Text style={styles.cardBodyMuted}>Matches</Text>
            {visibleMatches.map((candidate) => (
              <View key={candidate.userId} style={styles.dataRow}>
                <Text style={styles.dataTitle}>{candidate.displayName}</Text>
                <Text style={styles.dataMeta}>Member ID: {candidate.userId}</Text>
                {candidate.locationLabel ? (
                  <Text style={styles.dataMeta}>Location: {candidate.locationLabel}</Text>
                ) : null}
                {candidate.serviceCategories.length > 0 ? (
                  <Text style={styles.dataMeta}>
                    Services: {candidate.serviceCategories.join(", ")}
                  </Text>
                ) : null}
                <AppButton
                  label="Connect"
                  onPress={() => {
                    void submitRequest({ targetUserId: candidate.userId });
                  }}
                  variant="secondary"
                  disabled={submitting}
                  testID={`connections-match-request-${candidate.userId}`}
                />
              </View>
            ))}
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Connections list">
        {loading ? <Text style={styles.cardBodyMuted}>Loading connections...</Text> : null}
        {!loading && connections.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No connections yet.</Text>
        ) : null}
        {!loading && connections.length > MAX_RENDER_ROWS ? (
          <Text style={styles.cardBodyMuted}>
            Showing latest {MAX_RENDER_ROWS} of {connections.length} connections.
          </Text>
        ) : null}
        {visibleConnections.map((connection) => {
          const currentUserId = user.publicUserId;
          const otherUser =
            connection.userAId === currentUserId ? connection.userBId : connection.userAId;
          const canAccept =
            connection.status === "pending" && connection.requestedByUserId !== currentUserId;
          const canDecline = connection.status === "pending";
          const canBlock = connection.status !== "blocked";
          return (
            <View key={connection.id} style={styles.dataRow}>
              <Text style={styles.dataTitle}>{connection.status}</Text>
              <Text style={styles.dataMeta}>Other user: {otherUser}</Text>
              <Text style={styles.dataMeta}>Requested at: {formatDate(connection.requestedAt)}</Text>
              {canAccept ? (
                <AppButton
                  label="Accept"
                  onPress={() => {
                    void onAccept(connection.id);
                  }}
                  variant="secondary"
                  testID={`connections-accept-${connection.id}`}
                />
              ) : null}
              {canDecline ? (
                <AppButton
                  label={
                    connection.requestedByUserId === currentUserId
                      ? "Withdraw request"
                      : "Decline"
                  }
                  onPress={() => {
                    void onDecline(connection.id);
                  }}
                  variant="secondary"
                  testID={`connections-decline-${connection.id}`}
                />
              ) : null}
              {canBlock ? (
                <AppButton
                  label="Block"
                  onPress={() => {
                    void onBlock(connection.id);
                  }}
                  variant="ghost"
                  testID={`connections-block-${connection.id}`}
                />
              ) : null}
            </View>
          );
        })}
        <AppButton
          label={loading ? "Refreshing..." : "Refresh connections"}
          onPress={() => {
            void load();
          }}
          variant="ghost"
          disabled={loading}
          testID="connections-refresh"
        />
      </SectionCard>
    </ScrollView>
  );
}

function ConsentScreen({
  accessToken,
  user,
  onSessionInvalid
}: {
  accessToken: string;
  user: AuthenticatedUser;
  onSessionInvalid: () => void;
}): JSX.Element {
  const [requests, setRequests] = useState<AccessRequestRecord[]>([]);
  const [grants, setGrants] = useState<ConsentGrantRecord[]>([]);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [requestConnectionId, setRequestConnectionId] = useState("");
  const [requestPurpose, setRequestPurpose] = useState("");
  const [requestFields, setRequestFields] = useState<ConsentField[]>(["phone"]);

  const [grantRequestId, setGrantRequestId] = useState("");
  const [grantPurpose, setGrantPurpose] = useState("");
  const [grantExpiresAt, setGrantExpiresAt] = useState("");
  const [grantFields, setGrantFields] = useState<ConsentField[]>(["phone"]);

  const [revokeGrantId, setRevokeGrantId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const [canViewConnectionId, setCanViewConnectionId] = useState("");
  const [canViewField, setCanViewField] = useState<ConsentField>("phone");
  const [canViewResult, setCanViewResult] = useState<boolean | null>(null);
  const currentUserId = user.publicUserId;
  const acceptedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "accepted"),
    [connections]
  );
  const connectionPeople = useMemo(
    () =>
      acceptedConnections.map((connection) => ({
        connectionId: connection.id,
        memberId:
          connection.userAId === currentUserId ? connection.userBId : connection.userAId
      })),
    [acceptedConnections, currentUserId]
  );
  const pendingIncomingRequests = useMemo(
    () =>
      requests.filter(
        (request) => request.status === "pending" && request.ownerUserId === currentUserId
      ),
    [requests, currentUserId]
  );
  const activeOwnedGrants = useMemo(
    () => grants.filter((grant) => grant.status === "active" && grant.ownerUserId === currentUserId),
    [grants, currentUserId]
  );
  const visibleRequests = useMemo(
    () => requests.slice(0, MAX_RENDER_ROWS),
    [requests]
  );
  const visibleGrants = useMemo(
    () => grants.slice(0, MAX_RENDER_ROWS),
    [grants]
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [requestRows, grantRows, connectionRows] = await Promise.all([
        listConsentRequests(accessToken),
        listConsentGrants(accessToken),
        listConnections(accessToken)
      ]);
      setRequests(requestRows);
      setGrants(grantRows);
      setConnections(connectionRows);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load consent data");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, onSessionInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleRequestField = (field: ConsentField): void => {
    setRequestFields((previous) =>
      previous.includes(field)
        ? previous.filter((item) => item !== field)
        : [...previous, field]
    );
  };

  const toggleGrantField = (field: ConsentField): void => {
    setGrantFields((previous) =>
      previous.includes(field) ? previous.filter((item) => item !== field) : [...previous, field]
    );
  };

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
    } catch (requestError) {
      const message = asError(requestError, "Consent action failed");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onRequestAccess = async (): Promise<void> => {
    await runAction(async () => {
      const selectedConnection = connectionPeople.find(
        (connection) => connection.connectionId === requestConnectionId
      );
      if (!selectedConnection) {
        throw new Error("Choose a connected person first.");
      }
      const created = await requestConsentAccess(
        {
          ownerUserId: selectedConnection.memberId,
          connectionId: selectedConnection.connectionId,
          requestedFields: requestFields,
          purpose: requestPurpose.trim()
        },
        accessToken
      );
      setRequests((previous) => [created, ...previous]);
      setRequestConnectionId("");
      setRequestPurpose("");
      setSuccess("Access request created.");
    });
  };

  const onGrant = async (): Promise<void> => {
    await runAction(async () => {
      if (!grantRequestId.trim()) {
        throw new Error("Choose a pending request first.");
      }
      const payload: {
        grantedFields: ConsentField[];
        purpose: string;
        expiresAt?: string;
      } = {
        grantedFields: grantFields,
        purpose: grantPurpose.trim()
      };
      if (grantExpiresAt.trim()) {
        payload.expiresAt = grantExpiresAt.trim();
      }
      const grant = await grantConsent(grantRequestId.trim(), payload, accessToken);
      setGrants((previous) => [grant, ...previous]);
      setRequests((previous) =>
        previous.map((item) =>
          item.id === grant.accessRequestId ? { ...item, status: "approved" } : item
        )
      );
      setGrantRequestId("");
      setGrantPurpose("");
      setGrantExpiresAt("");
      setSuccess("Consent granted.");
    });
  };

  const onRevoke = async (): Promise<void> => {
    await runAction(async () => {
      if (!revokeGrantId.trim()) {
        throw new Error("Choose an active share first.");
      }
      const updated = await revokeConsent(
        revokeGrantId.trim(),
        { reason: revokeReason.trim() },
        accessToken
      );
      setGrants((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item))
      );
      setRevokeGrantId("");
      setRevokeReason("");
      setSuccess("Consent revoked.");
    });
  };

  const onCanView = async (): Promise<void> => {
    await runAction(async () => {
      setCanViewResult(null);
      const selectedConnection = connectionPeople.find(
        (connection) => connection.connectionId === canViewConnectionId
      );
      if (!selectedConnection) {
        throw new Error("Choose a connected person first.");
      }
      const result = await canViewConsent(
        {
          ownerUserId: selectedConnection.memberId,
          field: canViewField
        },
        accessToken
      );
      setCanViewResult(result.allowed);
      setSuccess("Visibility check completed.");
    });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="consent-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Privacy</Text>
        <Text style={styles.screenTitle}>Share contact details safely</Text>
        <Text style={styles.screenSubtitle}>
          You decide who sees your details and for how long.
        </Text>
      </View>

      {error ? <Banner tone="error" message={error} testID="consent-error-banner" /> : null}
      {success ? <Banner tone="success" message={success} testID="consent-success-banner" /> : null}

      <SectionCard title="Request access">
        <Text style={styles.fieldLabel}>Choose person</Text>
        <View style={styles.roleRow}>
          {connectionPeople.length === 0 ? (
            <Text style={styles.cardBodyMuted}>No accepted connections yet.</Text>
          ) : null}
          {connectionPeople.map((item) => (
            <Pressable
              key={item.connectionId}
              style={[
                styles.roleChip,
                requestConnectionId === item.connectionId ? styles.roleChipSelected : null
              ]}
              onPress={() => setRequestConnectionId(item.connectionId)}
              testID={`consent-request-owner-${item.memberId}`}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  requestConnectionId === item.connectionId ? styles.roleChipLabelSelected : null
                ]}
              >
                {item.memberId}
              </Text>
            </Pressable>
          ))}
        </View>
        <InputField
          label="Why you need this"
          value={requestPurpose}
          onChangeText={setRequestPurpose}
          placeholder="Share phone and email for service coordination"
          testID="consent-request-purpose"
        />
        <View style={styles.roleRow}>
          {CONSENT_FIELDS.map((field) => (
            <Pressable
              key={field}
              style={[
                styles.roleChip,
                requestFields.includes(field) ? styles.roleChipSelected : null
              ]}
              onPress={() => toggleRequestField(field)}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  requestFields.includes(field) ? styles.roleChipLabelSelected : null
                ]}
              >
                {CONSENT_FIELD_LABELS[field]}
              </Text>
            </Pressable>
          ))}
        </View>
        <AppButton
          label={submitting ? "Submitting..." : "Request access"}
          onPress={() => {
            void onRequestAccess();
          }}
          disabled={submitting || requestFields.length === 0 || requestConnectionId.length === 0}
          testID="consent-request-submit"
        />
      </SectionCard>

      <SectionCard title="Grant access">
        <Text style={styles.fieldLabel}>Pending requests</Text>
        <View style={styles.roleRow}>
          {pendingIncomingRequests.length === 0 ? (
            <Text style={styles.cardBodyMuted}>No pending requests for you.</Text>
          ) : null}
          {pendingIncomingRequests.map((request) => (
            <Pressable
              key={request.id}
              style={[
                styles.roleChip,
                grantRequestId === request.id ? styles.roleChipSelected : null
              ]}
              onPress={() => setGrantRequestId(request.id)}
              testID={`consent-grant-request-${request.id}`}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  grantRequestId === request.id ? styles.roleChipLabelSelected : null
                ]}
              >
                {request.requesterUserId}
              </Text>
            </Pressable>
          ))}
        </View>
        <InputField
          label="Why you are approving"
          value={grantPurpose}
          onChangeText={setGrantPurpose}
          placeholder="Approved for one-time call"
          testID="consent-grant-purpose"
        />
        <InputField
          label="Ends on (ISO, optional)"
          value={grantExpiresAt}
          onChangeText={setGrantExpiresAt}
          placeholder="2026-12-31T23:59:59.000Z"
          testID="consent-grant-expires-at"
        />
        <View style={styles.roleRow}>
          {CONSENT_FIELDS.map((field) => (
            <Pressable
              key={field}
              style={[
                styles.roleChip,
                grantFields.includes(field) ? styles.roleChipSelected : null
              ]}
              onPress={() => toggleGrantField(field)}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  grantFields.includes(field) ? styles.roleChipLabelSelected : null
                ]}
              >
                {CONSENT_FIELD_LABELS[field]}
              </Text>
            </Pressable>
          ))}
        </View>
        <AppButton
          label={submitting ? "Submitting..." : "Grant"}
          onPress={() => {
            void onGrant();
          }}
          variant="secondary"
          disabled={submitting || grantFields.length === 0 || grantRequestId.length === 0}
          testID="consent-grant-submit"
        />
      </SectionCard>

      <SectionCard title="Stop sharing + access check">
        <Text style={styles.fieldLabel}>Active shares</Text>
        <View style={styles.roleRow}>
          {activeOwnedGrants.length === 0 ? (
            <Text style={styles.cardBodyMuted}>No active shares to revoke.</Text>
          ) : null}
          {activeOwnedGrants.map((grant) => (
            <Pressable
              key={grant.id}
              style={[
                styles.roleChip,
                revokeGrantId === grant.id ? styles.roleChipSelected : null
              ]}
              onPress={() => setRevokeGrantId(grant.id)}
              testID={`consent-revoke-grant-${grant.id}`}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  revokeGrantId === grant.id ? styles.roleChipLabelSelected : null
                ]}
              >
                {grant.granteeUserId}
              </Text>
            </Pressable>
          ))}
        </View>
        <InputField
          label="Revoke reason"
          value={revokeReason}
          onChangeText={setRevokeReason}
          placeholder="No longer required"
          testID="consent-revoke-reason"
        />
        <AppButton
          label={submitting ? "Submitting..." : "Revoke"}
          onPress={() => {
            void onRevoke();
          }}
          variant="secondary"
          disabled={submitting || revokeGrantId.length === 0}
          testID="consent-revoke-submit"
        />

        <Text style={styles.fieldLabel}>Check a connected person</Text>
        <View style={styles.roleRow}>
          {connectionPeople.map((item) => (
            <Pressable
              key={`check-${item.connectionId}`}
              style={[
                styles.roleChip,
                canViewConnectionId === item.connectionId ? styles.roleChipSelected : null
              ]}
              onPress={() => setCanViewConnectionId(item.connectionId)}
              testID={`consent-can-view-owner-${item.memberId}`}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  canViewConnectionId === item.connectionId ? styles.roleChipLabelSelected : null
                ]}
              >
                {item.memberId}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.roleRow}>
          {CONSENT_FIELDS.map((field) => (
            <Pressable
              key={field}
              style={[styles.roleChip, canViewField === field ? styles.roleChipSelected : null]}
              onPress={() => setCanViewField(field)}
              testID={`consent-can-view-field-${field}`}
            >
              <Text
                style={[
                  styles.roleChipLabel,
                  canViewField === field ? styles.roleChipLabelSelected : null
                ]}
              >
                {CONSENT_FIELD_LABELS[field]}
              </Text>
            </Pressable>
          ))}
        </View>
        <AppButton
          label={submitting ? "Submitting..." : "Can view check"}
          onPress={() => {
            void onCanView();
          }}
          disabled={submitting || canViewConnectionId.length === 0}
          testID="consent-can-view-submit"
        />
        {canViewResult !== null ? (
          <Banner
            tone={canViewResult ? "success" : "info"}
            message={
              canViewResult
                ? "This contact detail is available to you."
                : "This contact detail is not available right now."
            }
            testID={canViewResult ? "consent-can-view-allowed-banner" : "consent-can-view-denied-banner"}
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Recent privacy records">
        {loading ? <Text style={styles.cardBodyMuted}>Loading consent records...</Text> : null}
        {!loading && requests.length === 0 && grants.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No consent records yet.</Text>
        ) : null}
        {!loading && requests.length > MAX_RENDER_ROWS ? (
          <Text style={styles.cardBodyMuted}>
            Showing latest {MAX_RENDER_ROWS} of {requests.length} requests.
          </Text>
        ) : null}
        {!loading && grants.length > MAX_RENDER_ROWS ? (
          <Text style={styles.cardBodyMuted}>
            Showing latest {MAX_RENDER_ROWS} of {grants.length} grants.
          </Text>
        ) : null}
        {visibleRequests.map((request) => (
          <View key={request.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>Request · {request.status}</Text>
            <Text style={styles.dataMeta}>
              {request.requesterUserId} asked {request.ownerUserId}
            </Text>
            <Text style={styles.dataMeta}>
              Details:{" "}
              {request.requestedFields
                .map((field) => CONSENT_FIELD_LABELS[field])
                .join(", ")}
            </Text>
            <Text style={styles.dataMeta}>{formatDate(request.createdAt)}</Text>
          </View>
        ))}
        {visibleGrants.map((grant) => (
          <View key={grant.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>Grant · {grant.status}</Text>
            <Text style={styles.dataMeta}>
              {grant.ownerUserId} shared with {grant.granteeUserId}
            </Text>
            <Text style={styles.dataMeta}>
              Details: {grant.grantedFields.map((field) => CONSENT_FIELD_LABELS[field]).join(", ")}
            </Text>
            <Text style={styles.dataMeta}>{formatDate(grant.grantedAt)}</Text>
          </View>
        ))}
        <AppButton
          label={loading ? "Refreshing..." : "Refresh consent data"}
          onPress={() => {
            void load();
          }}
          variant="ghost"
          disabled={loading}
          testID="consent-refresh"
        />
      </SectionCard>
    </ScrollView>
  );
}

function ProfileScreen({
  accessToken,
  user,
  onSessionInvalid,
  onSignOut
}: {
  accessToken: string;
  user: AuthenticatedUser;
  onSessionInvalid: () => void;
  onSignOut: () => void;
}): JSX.Element {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaSuccess, setMediaSuccess] = useState<string | null>(null);
  const [publicGalleryOwner, setPublicGalleryOwner] = useState("");
  const [publicMediaAssets, setPublicMediaAssets] = useState<PublicMediaAssetRecord[]>([]);
  const [publicGalleryLoading, setPublicGalleryLoading] = useState(false);
  const [publicGalleryError, setPublicGalleryError] = useState<string | null>(null);

  const loadPublicGallery = useCallback(async (ownerUserId: string): Promise<void> => {
    const normalizedOwnerId = ownerUserId.trim().toLowerCase();
    if (!normalizedOwnerId) {
      setPublicGalleryError("Enter a member ID to load approved media.");
      setPublicMediaAssets([]);
      return;
    }

    setPublicGalleryLoading(true);
    setPublicGalleryError(null);
    try {
      const assets = await listPublicApprovedMedia(normalizedOwnerId);
      setPublicMediaAssets(assets);
    } catch (requestError) {
      setPublicGalleryError(asError(requestError, "Unable to load public media"));
      setPublicMediaAssets([]);
    } finally {
      setPublicGalleryLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [record, media] = await Promise.all([
        getMyProfile(accessToken),
        listMyMedia(accessToken)
      ]);
      setProfile(record);
      setForm(buildProfileForm(record));
      setMediaAssets(media);
      setPublicGalleryOwner(record.userId);
      await loadPublicGallery(record.userId);
    } catch (requestError) {
      const message = asError(requestError, "Unable to load profile");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, loadPublicGallery, onSessionInvalid]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onSaveProfile = useCallback(async (): Promise<void> => {
    if (!form) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateMyProfile(
        {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim() || undefined,
          city: form.city.trim() || undefined,
          area: form.area.trim() || undefined,
          serviceCategories: parseServiceCategories(form.serviceCategories),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          alternatePhone: form.alternatePhone.trim() || undefined,
          fullAddress: form.fullAddress.trim() || undefined
        },
        accessToken
      );
      setProfile(updated);
      setForm(buildProfileForm(updated));
      setSuccess("Profile updated.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to update profile");
      setError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setSaving(false);
    }
  }, [accessToken, form, onSessionInvalid]);

  const onUploadDemoMedia = useCallback(async (): Promise<void> => {
    setMediaUploading(true);
    setMediaError(null);
    setMediaSuccess(null);
    try {
      const contentType = "image/jpeg";
      const body = `IllamHelp service proof ${Date.now()}`;
      const ticket = await createMediaUploadTicket(
        {
          kind: "image",
          contentType,
          fileSizeBytes: body.length,
          checksumSha256: randomHex(64),
          originalFileName: `service-proof-${Date.now()}.jpg`
        },
        accessToken
      );

      const uploadResponse = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: ticket.requiredHeaders,
        body
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`);
      }

      const etag = uploadResponse.headers.get("etag")?.replace(/"/g, "");
      const completed = await completeMediaUpload(
        ticket.mediaId,
        { etag: etag || undefined },
        accessToken
      );

      setMediaAssets((previous) => [
        completed,
        ...previous.filter((item) => item.id !== completed.id)
      ]);
      setMediaSuccess("Upload received. Review started.");
    } catch (requestError) {
      const message = asError(requestError, "Unable to upload media");
      setMediaError(message);
      if (shouldForceSignOut(message)) {
        onSessionInvalid();
      }
    } finally {
      setMediaUploading(false);
    }
  }, [accessToken, onSessionInvalid]);

  return (
    <ScrollView
      contentContainerStyle={styles.screenScroll}
      testID="profile-scroll"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.screenHeader}>
        <Text style={styles.pill}>Profile</Text>
        <Text style={styles.screenTitle}>Your account</Text>
        <Text style={styles.screenSubtitle}>Manage your details and sharing preferences.</Text>
      </View>
      {error ? <Banner tone="error" message={error} /> : null}
      {success ? <Banner tone="success" message={success} /> : null}
      <SectionCard title="Identity">
        <Text style={styles.dataMeta} testID="profile-user-id">
          Member ID: {profile?.userId ?? user.publicUserId}
        </Text>
        <Text style={styles.dataMeta}>Name: {profile?.displayName ?? "-"}</Text>
        <Text style={styles.dataMeta}>Account: Member</Text>
      </SectionCard>
      {form ? (
        <SectionCard title="Edit profile">
          <InputField
            label="First name"
            value={form.firstName}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, firstName: value } : previous))}
            testID="profile-first-name"
          />
          <InputField
            label="Last name"
            value={form.lastName}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, lastName: value } : previous))}
            testID="profile-last-name"
          />
          <InputField
            label="City"
            value={form.city}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, city: value } : previous))}
            testID="profile-city"
          />
          <InputField
            label="Area"
            value={form.area}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, area: value } : previous))}
            testID="profile-area"
          />
          <InputField
            label="Services offered (comma separated)"
            value={form.serviceCategories}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, serviceCategories: value } : previous))}
            placeholder="maid, plumber, electrician"
            testID="profile-service-categories"
          />
          <InputField
            label="Email"
            value={form.email}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, email: value } : previous))}
            placeholder={profile?.contact.emailMasked ?? "email@example.com"}
            autoComplete="email"
            textContentType="emailAddress"
            testID="profile-email"
          />
          <InputField
            label="Phone"
            value={form.phone}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, phone: value } : previous))}
            placeholder={profile?.contact.phoneMasked ?? "+919876543210"}
            autoComplete="tel"
            textContentType="telephoneNumber"
            testID="profile-phone"
          />
          <InputField
            label="Alternate phone"
            value={form.alternatePhone}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, alternatePhone: value } : previous))}
            placeholder="+919812345678"
            autoComplete="tel"
            textContentType="telephoneNumber"
            testID="profile-alternate-phone"
          />
          <InputField
            label="Address"
            value={form.fullAddress}
            onChangeText={(value) => setForm((previous) => (previous ? { ...previous, fullAddress: value } : previous))}
            placeholder="Flat 10B, Green Meadows, Kakkanad, Kochi"
            multiline
            testID="profile-full-address"
          />
          <AppButton
            label={saving ? "Saving..." : "Save profile"}
            onPress={() => {
              void onSaveProfile();
            }}
            disabled={saving}
            testID="profile-save"
          />
        </SectionCard>
      ) : null}
      <SectionCard title="Privacy and media safety">
        <Text style={styles.cardBody}>
          Your contact details stay private until you approve sharing.
        </Text>
        <Text style={styles.cardBodyMuted}>
          You can stop sharing at any time from the Privacy tab.
        </Text>
      </SectionCard>
      <SectionCard title="Professional media">
        <Text style={styles.cardBody}>
          Upload service-related photos/videos only. Each upload goes through AI and human review
          before public display.
        </Text>
        {mediaError ? <Banner tone="error" message={mediaError} testID="profile-media-error" /> : null}
        {mediaSuccess ? (
          <Banner tone="success" message={mediaSuccess} testID="profile-media-success" />
        ) : null}
        <AppButton
          label={mediaUploading ? "Uploading..." : "Upload sample proof"}
          onPress={() => {
            void onUploadDemoMedia();
          }}
          disabled={mediaUploading}
          testID="profile-media-upload"
        />
        {mediaAssets.length === 0 ? (
          <Text style={styles.cardBodyMuted}>No media uploaded yet.</Text>
        ) : null}
        {mediaAssets.slice(0, 6).map((asset) => (
          <View key={asset.id} style={styles.dataRow}>
            <Text style={styles.dataTitle}>{asset.objectKey.split("/").slice(-1)[0]}</Text>
            <Text style={styles.dataMeta}>
              {asset.kind} · {asset.state.replace(/_/g, " ")}
            </Text>
            <Text style={styles.dataMeta}>{formatBytes(asset.fileSizeBytes)}</Text>
            <Text style={styles.dataMeta}>{formatDate(asset.createdAt)}</Text>
          </View>
        ))}
      </SectionCard>
      <SectionCard title="Public gallery preview">
        <Text style={styles.cardBody}>
          This view matches what other members can open publicly after moderation approval.
        </Text>
        {publicGalleryError ? (
          <Banner tone="error" message={publicGalleryError} testID="profile-public-media-error" />
        ) : null}
        <InputField
          label="Member ID"
          value={publicGalleryOwner}
          onChangeText={setPublicGalleryOwner}
          placeholder="anita_worker_01"
          testID="profile-public-owner-input"
        />
        <AppButton
          label={publicGalleryLoading ? "Loading..." : "Load approved media"}
          onPress={() => {
            void loadPublicGallery(publicGalleryOwner);
          }}
          disabled={publicGalleryLoading}
          testID="profile-public-load"
        />
        {publicMediaAssets.length === 0 ? (
          <Text style={styles.cardBodyMuted} testID="profile-public-empty">
            No approved media yet.
          </Text>
        ) : null}
        {publicMediaAssets.map((asset) => (
          <View key={asset.id} style={styles.dataRow} testID="profile-public-item">
            <Text style={styles.dataTitle}>
              {asset.kind} · {formatBytes(asset.fileSizeBytes)}
            </Text>
            <Text style={styles.dataMeta}>{formatDate(asset.createdAt)}</Text>
            <AppButton
              label="Open approved file"
              onPress={() => {
                void Linking.openURL(asset.downloadUrl);
              }}
              variant="ghost"
              testID={`profile-public-open-${asset.id}`}
            />
          </View>
        ))}
      </SectionCard>
      {loading ? <Text style={styles.cardBodyMuted}>Loading profile...</Text> : null}
      <AppButton label="Sign out" onPress={onSignOut} variant="ghost" testID="profile-signout" />
    </ScrollView>
  );
}

function mapSessionUser(session: AuthSessionResponse): AuthenticatedUser {
  return {
    userId: session.userId,
    publicUserId: session.publicUserId,
    roles: session.roles,
    userType: session.userType,
    tokenSubject: session.userId
  };
}

export default function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginForm);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(initialRegisterForm);

  const signOut = useCallback((): void => {
    setAccessToken(null);
    setUser(null);
    setAuthError(null);
    setActiveTab("home");
  }, []);

  const applySession = useCallback(async (session: AuthSessionResponse): Promise<void> => {
    setAccessToken(session.accessToken);
    setUser(mapSessionUser(session));
    try {
      const profile = await authMe(session.accessToken);
      setUser(profile);
    } catch (requestError) {
      signOut();
      throw requestError;
    }
  }, [signOut]);

  const onLogin = useCallback(async (): Promise<void> => {
    Keyboard.dismiss();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session = await login(loginForm);
      await applySession(session);
      setLoginForm(initialLoginForm);
      setActiveTab("home");
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
      await applySession(session);
      setRegisterForm(initialRegisterForm);
      setActiveTab("home");
    } catch (requestError) {
      setAuthError(asError(requestError, "Unable to register"));
    } finally {
      setAuthBusy(false);
    }
  }, [applySession, registerForm]);

  const onSelectTab = useCallback((tab: TabKey): void => {
    Keyboard.dismiss();
    setActiveTab(tab);
  }, []);

  const appContent = useMemo(() => {
    if (!accessToken || !user) {
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

    let content: JSX.Element;
    switch (activeTab) {
      case "jobs":
        content = <JobsScreen accessToken={accessToken} onSessionInvalid={signOut} />;
        break;
      case "connections":
        content = (
          <ConnectionsScreen
            accessToken={accessToken}
            user={user}
            onSessionInvalid={signOut}
          />
        );
        break;
      case "consent":
        content = (
          <ConsentScreen
            accessToken={accessToken}
            user={user}
            onSessionInvalid={signOut}
          />
        );
        break;
      case "profile":
        content = (
          <ProfileScreen
            accessToken={accessToken}
            user={user}
            onSessionInvalid={signOut}
            onSignOut={signOut}
          />
        );
        break;
      case "home":
      default:
        content = <HomeScreen accessToken={accessToken} onSessionInvalid={signOut} />;
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.appTopBar}>
          <View>
            <Text style={styles.appTitle}>IllamHelp</Text>
            <Text style={styles.appSubtitle}>member</Text>
          </View>
          <AppButton label="Sign out" onPress={signOut} variant="ghost" testID="app-signout" />
        </View>
        <View style={styles.appContent}>{content}</View>
        <TabBar activeTab={activeTab} onSelect={onSelectTab} />
      </SafeAreaView>
    );
  }, [
    accessToken,
    activeTab,
    authBusy,
    authError,
    authMode,
    loginForm,
    onLogin,
    onRegister,
    onSelectTab,
    registerForm,
    signOut,
    user
  ]);

  return appContent;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bg
  },
  authContainer: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 22,
    gap: 14
  },
  authHero: {
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(31, 29, 26, 0.08)"
  },
  authTitle: {
    fontSize: 30,
    fontWeight: "700",
    color: theme.colors.ink,
    marginTop: 8
  },
  authSubtitle: {
    color: theme.colors.muted,
    marginTop: 8,
    lineHeight: 20
  },
  apiHint: {
    color: theme.colors.muted,
    marginTop: 10,
    fontSize: 12
  },
  modeSwitch: {
    flexDirection: "row",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.75)",
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(31, 29, 26, 0.08)"
  },
  modeButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  modeButtonSelected: {
    backgroundColor: "rgba(44, 91, 78, 0.15)"
  },
  modeButtonLabel: {
    color: theme.colors.muted,
    fontWeight: "600"
  },
  modeButtonLabelSelected: {
    color: theme.colors.brand
  },
  appTopBar: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(31, 29, 26, 0.1)",
    backgroundColor: "rgba(247,242,234,0.92)"
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.ink
  },
  appSubtitle: {
    color: theme.colors.muted
  },
  appContent: {
    flex: 1,
    paddingHorizontal: 18
  },
  screenScroll: {
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12
  },
  screenHeader: {
    gap: 8,
    marginBottom: 4
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.colors.ink
  },
  screenSubtitle: {
    color: theme.colors.muted,
    lineHeight: 20
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(31, 29, 26, 0.1)",
    color: theme.colors.ink,
    overflow: "hidden"
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(31, 29, 26, 0.1)",
    padding: 14,
    gap: 8
  },
  cardTitle: {
    fontWeight: "700",
    color: theme.colors.ink,
    fontSize: 16
  },
  cardBody: {
    color: theme.colors.ink,
    lineHeight: 20
  },
  cardBodyMuted: {
    color: theme.colors.muted,
    lineHeight: 20
  },
  stackSmall: {
    gap: 8
  },
  formField: {
    gap: 6
  },
  fieldLabel: {
    fontWeight: "600",
    color: theme.colors.ink,
    fontSize: 13
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(31, 29, 26, 0.16)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: theme.colors.ink
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: "top"
  },
  button: {
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
    backgroundColor: theme.colors.brand
  },
  buttonSecondary: {
    backgroundColor: theme.colors.brandAlt
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(31, 29, 26, 0.16)"
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonLabel: {
    color: "#fff",
    fontWeight: "700"
  },
  buttonLabelGhost: {
    color: theme.colors.ink
  },
  banner: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1
  },
  bannerError: {
    backgroundColor: "rgba(179,38,30,0.10)",
    borderColor: "rgba(179,38,30,0.28)"
  },
  bannerSuccess: {
    backgroundColor: "rgba(44,91,78,0.12)",
    borderColor: "rgba(44,91,78,0.3)"
  },
  bannerInfo: {
    backgroundColor: "rgba(26,111,135,0.12)",
    borderColor: "rgba(26,111,135,0.3)"
  },
  bannerText: {
    fontSize: 13
  },
  bannerTextError: {
    color: "#8c1d18"
  },
  bannerTextSuccess: {
    color: "#1c483b"
  },
  bannerTextInfo: {
    color: "#104d5d"
  },
  kpiGrid: {
    flexDirection: "row",
    gap: 10
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(31,29,26,0.08)"
  },
  kpiLabel: {
    color: theme.colors.muted,
    fontSize: 12
  },
  kpiValue: {
    color: theme.colors.ink,
    fontWeight: "700",
    fontSize: 20,
    marginTop: 4
  },
  dataRow: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(31, 29, 26, 0.08)",
    gap: 3
  },
  dataTitle: {
    color: theme.colors.ink,
    fontWeight: "700"
  },
  dataMeta: {
    color: theme.colors.muted,
    fontSize: 12
  },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  roleChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(31,29,26,0.12)",
    backgroundColor: "rgba(255,255,255,0.75)"
  },
  roleChipSelected: {
    backgroundColor: "rgba(44, 91, 78, 0.15)",
    borderColor: "rgba(44, 91, 78, 0.4)"
  },
  roleChipLabel: {
    color: theme.colors.ink,
    fontSize: 12,
    fontWeight: "600"
  },
  roleChipLabelSelected: {
    color: theme.colors.brand
  },
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(31, 29, 26, 0.1)",
    backgroundColor: "rgba(247,242,234,0.95)",
    paddingHorizontal: 6,
    paddingVertical: 8
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 8
  },
  tabButtonSelected: {
    backgroundColor: "rgba(44, 91, 78, 0.12)"
  },
  tabButtonLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "600"
  },
  tabButtonLabelSelected: {
    color: theme.colors.brand
  }
});
