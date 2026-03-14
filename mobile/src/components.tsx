import { Pressable, Text, TextInput, View } from "react-native";
import type { TextInputProps, ViewStyle } from "react-native";

import { useAppStyles, useAppTheme } from "./theme-context";

export type BottomBarKey = "home" | "people" | "profile" | "verify";
export type AuthMode = "login" | "register";
export type ButtonVariant = "primary" | "secondary" | "ghost";

export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  testID,
  style
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
}): JSX.Element {
  const styles = useAppStyles();
  const theme = useAppTheme();
  const buttonStyles = [
    styles.button,
    variant === "secondary" ? styles.buttonSecondary : null,
    variant === "ghost" ? styles.buttonGhost : null,
    disabled ? styles.buttonDisabled : null,
    style
  ];
  const textStyles = [styles.buttonLabel, variant === "ghost" ? styles.buttonLabelGhost : null];

  return (
    <Pressable style={buttonStyles} disabled={disabled} onPress={onPress} testID={testID}>
      <Text style={textStyles}>{label}</Text>
    </Pressable>
  );
}

export function InputField({
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
  const styles = useAppStyles();
  const theme = useAppTheme();

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

export function SectionCard({
  title,
  subtitle,
  children,
  testID
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  testID?: string;
}): JSX.Element {
  const styles = useAppStyles();

  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardBodyMuted}>{subtitle}</Text> : null}
      <View style={styles.stackSmall}>{children}</View>
    </View>
  );
}

export function Banner({
  tone,
  message,
  testID
}: {
  tone: "error" | "success" | "info";
  message: string;
  testID?: string;
}): JSX.Element {
  const styles = useAppStyles();
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
