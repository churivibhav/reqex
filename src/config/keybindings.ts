import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CommandId } from "../state/types.js";

export type KeymapPreset = "vscode" | "vim";

export type KeybindingConfig = Readonly<{
  preset?: KeymapPreset;
  bindings?: Readonly<Record<string, CommandId>>;
}>;

const VSCODE_DEFAULTS: Record<string, CommandId> = {
  F5: "request.send",
  "ctrl+enter": "request.send",
  "alt+enter": "request.send",
  tab: "pane.focusNext",
  "shift+tab": "pane.focusPrev",
  "ctrl+1": "pane.focusFiles",
  "ctrl+2": "pane.focusEditor",
  "ctrl+3": "pane.focusResponse",
  "alt+1": "pane.focusFiles",
  "alt+2": "pane.focusEditor",
  "alt+3": "pane.focusResponse",
  "ctrl+b": "sidebar.toggle",
  "ctrl+p": "palette.files",
  "ctrl+shift+p": "palette.commands",
  F2: "palette.commands",
  "ctrl+s": "file.save",
  "ctrl+e": "env.switcher",
  F11: "pane.zoom",
  z: "pane.zoom",
  F1: "help.show",
  "?": "help.show",
  escape: "overlay.close",
  "ctrl+c": "app.quit",
  "ctrl+shift+c": "response.copy",
  "ctrl+f": "response.search",
  "ctrl+tab": "response.tab.next",
  "ctrl+shift+tab": "response.tab.prev",
};

const VIM_DEFAULTS: Record<string, CommandId> = {
  ...VSCODE_DEFAULTS,
  "ctrl+w h": "pane.focusFiles",
  "ctrl+w l": "pane.focusResponse",
  "ctrl+w k": "pane.focusEditor",
};

export function getConfigDir(): string {
  if (process.env.REQEX_CONFIG_DIR) {
    return process.env.REQEX_CONFIG_DIR;
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "reqex");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "reqex");
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(xdg, "reqex");
}

export function getProjectConfigDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".reqex");
}

function readJsonIfExists(filePath: string): KeybindingConfig | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as KeybindingConfig;
  } catch {
    return null;
  }
}

export function loadKeybindings(workspaceRoot: string): {
  preset: KeymapPreset;
  bindings: Record<string, CommandId>;
} {
  const userConfig = readJsonIfExists(path.join(getConfigDir(), "keybindings.json"));
  const projectConfig = readJsonIfExists(
    path.join(getProjectConfigDir(workspaceRoot), "keybindings.json"),
  );

  const preset =
    projectConfig?.preset ?? userConfig?.preset ?? ("vscode" as KeymapPreset);
  const defaults = preset === "vim" ? VIM_DEFAULTS : VSCODE_DEFAULTS;

  return {
    preset,
    bindings: {
      ...defaults,
      ...userConfig?.bindings,
      ...projectConfig?.bindings,
    },
  };
}

export function watchKeybindings(
  workspaceRoot: string,
  onChange: () => void,
): () => void {
  const dirs = [getConfigDir(), getProjectConfigDir(workspaceRoot)];
  const watchers = dirs.map((dir) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
    return fs.watch(dir, { persistent: false }, () => onChange());
  });
  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

export function describeBindings(bindings: Record<string, CommandId>): string[] {
  const preferred: Array<[string, CommandId]> = [
    ["F5", "request.send"],
    ["tab", "pane.focusNext"],
    ["ctrl+s", "file.save"],
    ["ctrl+e", "env.switcher"],
    ["ctrl+shift+p", "palette.commands"],
    ["F1", "help.show"],
  ];
  return preferred
    .filter(([key]) => bindings[key])
    .map(([key, command]) => `${key} ${command.replace("request.", "").replace("pane.", "")}`);
}
