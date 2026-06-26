import {
  darkTheme,
  lightTheme,
  resolveColorToken,
  type ThemeDefinition,
} from "@rezi-ui/core";

import type { ThemeMode } from "../utils/terminal-theme.js";

function token(theme: ThemeDefinition, path: Parameters<typeof resolveColorToken>[1]): number {
  return resolveColorToken(theme, path) ?? 0;
}

export function themeForMode(mode: ThemeMode): ThemeDefinition {
  return mode === "light" ? lightTheme : darkTheme;
}

export type ThemeColors = Readonly<{
  bgBase: number;
  bgElevated: number;
  bgSubtle: number;
  fgPrimary: number;
  paneFocused: number;
  paneMuted: number;
  selected: number;
  dirty: number;
  success: number;
  warning: number;
  error: number;
  info: number;
}>;

export function colorsFor(theme: ThemeDefinition): ThemeColors {
  return {
    bgBase: token(theme, "bg.base"),
    bgElevated: token(theme, "bg.elevated"),
    bgSubtle: token(theme, "bg.subtle"),
    fgPrimary: token(theme, "fg.primary"),
    paneFocused: token(theme, "accent.secondary"),
    paneMuted: token(theme, "fg.muted"),
    selected: token(theme, "accent.primary"),
    dirty: token(theme, "warning"),
    success: token(theme, "success"),
    warning: token(theme, "warning"),
    error: token(theme, "error"),
    info: token(theme, "info"),
  };
}

export function colorsForMode(mode: ThemeMode): ThemeColors {
  return colorsFor(themeForMode(mode));
}

export function statusColorForTone(
  colors: ThemeColors,
  tone: "green" | "yellow" | "red" | "cyan",
): number {
  switch (tone) {
    case "green":
      return colors.success;
    case "yellow":
      return colors.warning;
    case "red":
      return colors.error;
    default:
      return colors.info;
  }
}
