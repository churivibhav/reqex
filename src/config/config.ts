import fs from "node:fs";
import path from "node:path";

import { getConfigDir, getProjectConfigDir } from "./paths.js";

export type ThemePreference = "auto" | "light" | "dark";

export type AppConfig = Readonly<{
  theme?: ThemePreference;
}>;

const DEFAULT_THEME: ThemePreference = "auto";

function readJsonIfExists(filePath: string): AppConfig | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    return null;
  }
}

function parseThemePreference(value: string | undefined): ThemePreference | null {
  if (value === "auto" || value === "light" || value === "dark") {
    return value;
  }
  return null;
}

export function loadConfig(workspaceRoot: string): { theme: ThemePreference } {
  const userConfig = readJsonIfExists(path.join(getConfigDir(), "config.json"));
  const projectConfig = readJsonIfExists(
    path.join(getProjectConfigDir(workspaceRoot), "config.json"),
  );

  const envTheme = parseThemePreference(process.env.REQEX_THEME);
  const fileTheme = projectConfig?.theme ?? userConfig?.theme ?? DEFAULT_THEME;

  return {
    theme: envTheme ?? fileTheme,
  };
}

export function watchConfig(workspaceRoot: string, onChange: () => void): () => void {
  const files = [
    path.join(getConfigDir(), "config.json"),
    path.join(getProjectConfigDir(workspaceRoot), "config.json"),
  ];
  const watchers = files.map((filePath) => {
    const dir = path.dirname(filePath);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
    return fs.watch(dir, { persistent: false }, (_event, filename) => {
      if (filename === "config.json") {
        onChange();
      }
    });
  });
  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}
