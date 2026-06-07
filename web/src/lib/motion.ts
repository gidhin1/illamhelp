"use client";

export type MotionPreset = "bannerIn" | "rowIn" | "dialogIn" | "contentSwap";

const presetKeyframes: Record<MotionPreset, Keyframe[]> = {
  bannerIn: [
    { opacity: 0, transform: "translateY(-8px) scale(0.98)" },
    { opacity: 1, transform: "translateY(0) scale(1)" }
  ],
  rowIn: [
    { opacity: 0, transform: "translateY(6px)" },
    { opacity: 1, transform: "translateY(0)" }
  ],
  dialogIn: [
    { opacity: 0, transform: "translateY(10px) scale(0.98)" },
    { opacity: 1, transform: "translateY(0) scale(1)" }
  ],
  contentSwap: [
    { opacity: 0.72, transform: "scale(0.99)" },
    { opacity: 1, transform: "scale(1)" }
  ]
};

const presetOptions: Record<MotionPreset, KeyframeAnimationOptions> = {
  bannerIn: { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" },
  rowIn: { duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" },
  dialogIn: { duration: 240, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "both" },
  contentSwap: { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" }
};

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function animateElement(element: HTMLElement | null, preset: MotionPreset): Animation | null {
  if (!element || typeof element.animate !== "function" || prefersReducedMotion()) {
    return null;
  }

  const animation = element.animate(presetKeyframes[preset], presetOptions[preset]);
  return animation;
}
