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
  "ctrl+/": "keybindings.show",
  escape: "overlay.close",
  "ctrl+q": "app.quit",
  "ctrl+x": "request.cancel",
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

export const COMMAND_LABELS: Record<CommandId, string> = {
  "request.send": "Send request",
  "request.cancel": "Cancel request",
  "pane.focusNext": "Focus next pane",
  "pane.focusPrev": "Focus previous pane",
  "pane.focusFiles": "Focus files pane",
  "pane.focusEditor": "Focus editor pane",
  "pane.focusResponse": "Focus response pane",
  "sidebar.toggle": "Toggle sidebar",
  "file.save": "Save file",
  "env.switcher": "Environment switcher",
  "env.selectNext": "Next environment",
  "env.selectPrev": "Previous environment",
  "env.apply": "Apply environment",
  "overlay.close": "Close overlay",
  "app.quit": "Quit",
  "palette.commands": "Command palette",
  "palette.files": "Open file",
  "help.show": "Help",
  "keybindings.show": "Show keybindings",
  "pane.zoom": "Zoom pane",
  "response.tab.next": "Next response tab",
  "response.tab.prev": "Previous response tab",
  "response.copy": "Copy response",
  "response.search": "Search response",
  "editor.searchNext": "Find next in editor",
};

const CHORD_PART_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  meta: "Meta",
  escape: "Esc",
  tab: "Tab",
  enter: "Enter",
  space: "Space",
  backspace: "Backspace",
  delete: "Delete",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
};

export function formatKeyChord(key: string): string {
  if (/^F\d+$/u.test(key)) {
    return key;
  }
  if (key.length === 1) {
    return key === "?" ? "?" : key.toUpperCase();
  }

  return key
    .split("+")
    .map((part) => CHORD_PART_LABELS[part] ?? part.toUpperCase())
    .join("+");
}

export function buildKeybindingsViewLines(
  bindings: Record<string, CommandId>,
  maxLines?: number,
): string[] {
  const byCommand = new Map<CommandId, string[]>();
  for (const [key, command] of Object.entries(bindings)) {
    const keys = byCommand.get(command) ?? [];
    keys.push(key);
    byCommand.set(command, keys);
  }

  const rows = [...byCommand.entries()]
    .map(([command, keys]) => {
      const formattedKeys = keys
        .sort((a, b) => a.localeCompare(b))
        .map(formatKeyChord)
        .join(" / ");
      const label = COMMAND_LABELS[command] ?? command;
      return { label, row: `${formattedKeys.padEnd(28)}  ${label}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((entry) => entry.row);

  if (maxLines !== undefined && rows.length > maxLines) {
    const hidden = rows.length - maxLines + 1;
    return [...rows.slice(0, maxLines - 1), `… ${hidden} more`];
  }
  return rows;
}

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

export type FooterHintContext = Readonly<{
  focusPane: "files" | "editor" | "response";
  overlay: "none" | "env" | "help" | "commandPalette" | "filePicker" | "keybindings";
  viewportWidth: number;
  sending?: boolean;
}>;

const FOOTER_HINTS: Record<string, readonly string[]> = {
  editor: ["F5 Send", "Ctrl+S Save", "Tab Panes", "F2 Palette"],
  response: ["Tab Panes", "Ctrl+Shift+C Copy", "F5 Send", "F2 Palette"],
  files: ["Enter Open", "Tab Panes", "Ctrl+P Files", "F2 Palette"],
  overlay: ["↑↓ Navigate", "Enter Select", "Esc Close"],
  sending: ["Ctrl+X Cancel", "Tab Panes", "Ctrl+Q Quit"],
};

export function footerHints(context: FooterHintContext): string {
  let hints: readonly string[];
  if (context.overlay !== "none") {
    hints = FOOTER_HINTS.overlay!;
  } else if (context.sending) {
    hints = FOOTER_HINTS.sending!;
  } else {
    hints = FOOTER_HINTS[context.focusPane] ?? FOOTER_HINTS.editor!;
  }

  const leftBudget = 48;
  const maxWidth = Math.max(20, context.viewportWidth - leftBudget);
  let text = hints.join(" · ");
  if (text.length > maxWidth) {
    text = `${text.slice(0, maxWidth - 1)}…`;
  }
  return text;
}

export const HELP_HINT_LINES: readonly string[] = [
  "F5 Send request under cursor",
  "Tab / Shift+Tab Cycle panes",
  "Ctrl+S Save file",
  "Ctrl+E Environment switcher",
  "F2 / Ctrl+Shift+P Command palette",
  "Ctrl+Shift+C Copy response tab",
  "Ctrl+X Cancel request · Ctrl+Q Quit",
  "Ctrl+/ Full keybindings · F1 Quick help",
];
