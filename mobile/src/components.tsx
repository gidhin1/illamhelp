import type { JSX } from "react";
import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, Text, useWindowDimensions, View } from "react-native";
import type { PressableProps, StyleProp, TextInputProps, ViewProps, ViewStyle } from "react-native";
import { ActivityIndicator, Button as PaperButton, TextInput as PaperTextInput, Surface, Chip, TouchableRipple } from "react-native-paper";
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
  accessibilityLabel,
  expanded,
  selected,
  onPress,
  variant = "primary",
  disabled,
  loading,
  testID,
  style
}: {
  label: string;
  accessibilityLabel?: string;
  expanded?: boolean;
  selected?: boolean;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: ViewStyle;
}): JSX.Element {
  const theme = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const inactive = !!disabled || !!loading;
  const state = { disabled: inactive, busy: !!loading, expanded, selected };

  if (fontScale > 1.2) {
    const filled = variant === "primary";
    const color = inactive ? theme.colors.muted : filled ? theme.colors.onStrong : theme.colors.brandText;
    return (
      <TouchableRipple
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={state}
        disabled={inactive}
        onPress={onPress}
        testID={testID}
        style={[{
          minHeight: 44,
          maxWidth: "100%",
          borderRadius: theme.radii.pill,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: theme.colors.line,
          backgroundColor: filled ? (inactive ? theme.colors.surfaceAlt : theme.colors.brand) : undefined,
          justifyContent: "center"
        }, style]}
      >
        <View style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 9
        }}>
          {loading ? <ActivityIndicator size={16} color={color} /> : null}
          <Text style={{ color, fontSize: theme.typography.sm, fontWeight: "600", textAlign: "center", flexShrink: 1 }}>
            {label}
          </Text>
        </View>
      </TouchableRipple>
    );
  }

  return (
    <PaperButton
      mode={variant === "primary" ? "contained" : variant === "secondary" ? "outlined" : "text"}
      buttonColor={variant === "primary" ? theme.colors.brand : undefined}
      textColor={variant === "primary" ? theme.colors.onStrong : theme.colors.brandText}
      style={[{ borderRadius: theme.radii.pill }, style]}
      contentStyle={{ minHeight: 44 }}
      disabled={inactive}
      loading={loading}
      onPress={onPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
    >{label}</PaperButton>
  );
}

export function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  autoComplete,
  textContentType,
  autoCapitalize = "none",
  multiline = false,
  returnKeyType,
  onSubmitEditing,
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
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
  testID?: string;
}): JSX.Element {
  const styles = useAppStyles();
  const theme = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const showExternalLabel = fontScale > 1.2;
  const minHeight = Math.max(multiline ? 96 : 44, showExternalLabel ? Math.ceil(theme.typography.md * fontScale * 1.4 + 24) : 0);

  return (
    <View style={styles.formField}>
      {showExternalLabel ? (
        <Text importantForAccessibility="no" accessibilityElementsHidden style={{ color: theme.colors.ink, fontSize: theme.typography.sm, fontWeight: "600" }}>
          {label}
        </Text>
      ) : null}
      <PaperTextInput
        mode="outlined"
        label={showExternalLabel ? undefined : label}
        style={{ backgroundColor: theme.colors.surface }}
        contentStyle={{ minHeight }}
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
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        testID={testID}
      />
    </View>
  );
}

type CardVariant = "record" | "summary" | "action" | "review";

export function CardSurface({
  children,
  variant = "action",
  style,
  testID
}: {
  children: React.ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): JSX.Element {
  const styles = useAppStyles();
  return (
    <Surface
      elevation={0}
      style={[styles.card, variant === "summary" ? styles.summaryCard : null, style]}
      testID={testID}
    >
      {children}
    </Surface>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
  testID,
  motion = "none",
  variant = "action"
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  testID?: string;
  motion?: MotionVariant;
  variant?: CardVariant;
}): JSX.Element {
  const styles = useAppStyles();

  return (
    <MotionView testID={testID} variant={motion}>
      <CardSurface variant={variant}>
        <Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardBodyMuted}>{subtitle}</Text> : null}
        <View style={styles.stackSmall}>{children}</View>
      </CardSurface>
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
  const theme = useAppTheme();
  const color = tone === "neutral" ? theme.colors.muted : tone === "info" ? theme.colors.brandText : theme.colors[`${tone}Text`];
  return <Chip accessibilityRole="text" testID={testID} mode="outlined" accessibilityLabel={label} textStyle={{ color, fontSize: theme.typography.xs }} style={{ alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line }}>{label}</Chip>;
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
    <Surface elevation={0} style={styles.card} testID={testID} accessible={false}>
      <SkeletonRow />
      <SkeletonRow />
    </Surface>
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
      <Surface elevation={0} style={{ backgroundColor: "transparent" }}>
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
      </Surface>
    </MotionView>
  );
}
