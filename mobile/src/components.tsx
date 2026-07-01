import React, { useEffect, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { PressableProps, StyleProp, TextInputProps, ViewProps, ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming
} from "react-native-reanimated";

import { useAppStyles, useAppTheme } from "./theme-context";

export type BottomBarKey = "home" | "people" | "profile" | "verify";
export type AuthMode = "login" | "register";
export type ButtonVariant = "primary" | "secondary" | "ghost";
const AnimatedView = Animated.View as React.ComponentType<
  ViewProps & {
    style?: StyleProp<ViewStyle>;
    testID?: string;
  }
>;

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

export type MotionVariant = "none" | "fade" | "rise" | "slide" | "banner";

export function MotionView({
  children,
  style,
  testID,
  variant = "none",
  delay = 0,
  disabled,
  ...viewProps
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: MotionVariant;
  delay?: number;
  disabled?: boolean;
} & Pick<
  ViewProps,
  | "accessible"
  | "accessibilityElementsHidden"
  | "accessibilityLabel"
  | "accessibilityLiveRegion"
  | "accessibilityRole"
  | "importantForAccessibility"
>): JSX.Element {
  const reduceMotion = useReduceMotion();
  const theme = useAppTheme();
  const progress = useSharedValue(reduceMotion || disabled || variant === "none" ? 1 : 0);

  useEffect(() => {
    if (reduceMotion || disabled || variant === "none") {
      progress.value = 1;
      return;
    }

    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: theme.motion.duration.enter,
        easing: Easing.out(Easing.cubic)
      })
    );
  }, [delay, disabled, progress, reduceMotion, theme.motion.duration.enter, variant]);

  const motionStyle = useAnimatedStyle(() => {
    if (reduceMotion || disabled || variant === "none") {
      return {};
    }

    if (variant === "fade") {
      return { opacity: progress.value };
    }

    if (variant === "slide") {
      return {
        opacity: progress.value,
        transform: [{ translateX: interpolate(progress.value, [0, 1], [-14, 0]) }]
      };
    }

    if (variant === "banner") {
      return {
        opacity: progress.value,
        transform: [
          { translateY: interpolate(progress.value, [0, 1], [-10, 0]) },
          { scale: interpolate(progress.value, [0, 1], [0.98, 1]) }
        ]
      };
    }

    return {
      opacity: progress.value,
      transform: [{ translateY: interpolate(progress.value, [0, 1], [10, 0]) }]
    };
  }, [disabled, reduceMotion, variant]);

  return (
    <AnimatedView style={[style, motionStyle]} testID={testID} {...viewProps}>
      {children}
    </AnimatedView>
  );
}

export function MotionPressable({
  children,
  disabled,
  style,
  ...props
}: PressableProps): JSX.Element {
  const styles = useAppStyles();

  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={(state) => [
        typeof style === "function" ? style(state) : style,
        state.pressed && !disabled ? styles.buttonPressed : null
      ]}
    >
      {children}
    </Pressable>
  );
}

export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  testID,
  style
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: ViewStyle;
}): JSX.Element {
  const styles = useAppStyles();
  const theme = useAppTheme();
  const buttonStyles = [
    styles.button,
    variant === "secondary" ? styles.buttonSecondary : null,
    variant === "ghost" ? styles.buttonGhost : null,
    disabled || loading ? styles.buttonDisabled : null,
    style
  ];
  const textStyles = [styles.buttonLabel, variant === "ghost" ? styles.buttonLabelGhost : null];

  return (
    <MotionPressable
      style={() => buttonStyles}
      disabled={disabled || loading}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
    >
      {loading ? <ActivityIndicator size="small" color={variant === "ghost" ? theme.colors.ink : theme.colors.onStrong} /> : null}
      <Text style={textStyles}>{label}</Text>
    </MotionPressable>
  );
}

export function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoComplete,
  textContentType,
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
        accessibilityLabel={label}
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
  testID,
  motion = "none"
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  testID?: string;
  motion?: MotionVariant;
}): JSX.Element {
  const styles = useAppStyles();

  return (
    <MotionView style={styles.card} testID={testID} variant={motion}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardBodyMuted}>{subtitle}</Text> : null}
      <View style={styles.stackSmall}>{children}</View>
    </MotionView>
  );
}

export function StatusLabel({
  label,
  tone = "info",
  testID
}: {
  label: string;
  tone?: "info" | "success" | "warning" | "error" | "neutral";
  testID?: string;
}): JSX.Element {
  const styles = useAppStyles();

  return (
    <View
      style={[
        styles.statusLabel,
        tone === "success" ? styles.statusLabelSuccess : null,
        tone === "warning" ? styles.statusLabelWarning : null,
        tone === "error" ? styles.statusLabelError : null,
        tone === "info" ? styles.statusLabelInfo : null
      ]}
      testID={testID}
      accessible
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.statusLabelText,
          tone === "success" ? styles.statusLabelTextSuccess : null,
          tone === "warning" ? styles.statusLabelTextWarning : null,
          tone === "error" ? styles.statusLabelTextError : null,
          tone === "info" ? styles.statusLabelTextInfo : null
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function SkeletonRow({ testID }: { testID?: string }): JSX.Element {
  const styles = useAppStyles();
  return (
    <View style={styles.skeletonRow} testID={testID} accessible={false}>
      <View style={[styles.skeletonLine, { width: "72%" }]} />
      <View style={[styles.skeletonLine, { width: "48%" }]} />
    </View>
  );
}

export function SkeletonCard({ testID }: { testID?: string }): JSX.Element {
  const styles = useAppStyles();
  return (
    <View style={styles.card} testID={testID} accessible={false}>
      <SkeletonRow />
      <SkeletonRow />
    </View>
  );
}

export function ActionEmptyState({
  title,
  message,
  actionLabel,
  onAction,
  testID
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}): JSX.Element {
  return (
    <SectionCard title={title} subtitle={message} testID={testID} motion="rise">
      {actionLabel && onAction ? <AppButton label={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </SectionCard>
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
    <MotionView
      style={[
        styles.banner,
        tone === "error" ? styles.bannerError : null,
        tone === "success" ? styles.bannerSuccess : null,
        tone === "info" ? styles.bannerInfo : null
      ]}
      testID={testID}
      variant="banner"
      accessible
      accessibilityRole={tone === "error" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "error" ? "assertive" : "polite"}
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
    </MotionView>
  );
}
