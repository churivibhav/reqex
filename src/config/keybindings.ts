import fs from "node:fs";
import path from "node:path";

import type { CommandId } from "../state/types.js";
import { getConfigDir, getProjectConfigDir } from "./paths.js";

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
  "ctrl+/": "keybindings.show",
  escape: "overlay.close",
  "ctrl+q": "app.quit",
  "ctrl+x": "request.cancel",
  "ctrl+shift+c": "response.copy",
  "ctrl+f": "response.search",
  "ctrl+[": "response.jsonFoldToggle",
  "ctrl+]": "response.jsonUnfoldAll",
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
  "response.jsonFoldToggle": "Fold/unfold JSON node",
  "response.jsonUnfoldAll": "Unfold all JSON",
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

export { getConfigDir, getProjectConfigDir } from "./paths.js";

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
  bindings?: Readonly<Record<string, string>>;
  responseTab?: "pretty" | "raw" | "headers" | "variables" | "tests";
  hasResponse?: boolean;
  hasFoldedJson?: boolean;
}>;

export type FooterHintItem = Readonly<{
  command: CommandId;
  label: string;
  key: string;
}>;

const FOOTER_COMMANDS: Record<string, readonly CommandId[]> = {
  editor: ["file.save", "env.switcher", "palette.commands"],
  response: ["response.copy", "response.jsonFoldToggle", "response.jsonUnfoldAll"],
  files: ["palette.files", "pane.focusNext", "palette.commands"],
  overlay: ["overlay.close"],
  sending: ["pane.focusNext", "app.quit"],
};

const FOOTER_LABELS: Record<CommandId, string> = {
  "request.send": "Send",
  "request.cancel": "Cancel",
  "pane.focusNext": "Panes",
  "pane.focusPrev": "Prev pane",
  "pane.focusFiles": "Files pane",
  "pane.focusEditor": "Editor pane",
  "pane.focusResponse": "Response pane",
  "sidebar.toggle": "Sidebar",
  "file.save": "Save",
  "env.switcher": "Env",
  "env.selectNext": "Next env",
  "env.selectPrev": "Prev env",
  "env.apply": "Select",
  "overlay.close": "Close",
  "app.quit": "Quit",
  "palette.commands": "Palette",
  "palette.files": "Files",
  "help.show": "Help",
  "keybindings.show": "Keys",
  "pane.zoom": "Zoom",
  "response.tab.next": "Next tab",
  "response.tab.prev": "Prev tab",
  "response.copy": "Copy",
  "response.search": "Search",
  "response.jsonFoldToggle": "Fold",
  "response.jsonUnfoldAll": "Unfold",
  "editor.searchNext": "Find next",
};

const PREFERRED_FOOTER_KEYS: Record<CommandId, readonly string[]> = {
  "request.send": ["F5", "ctrl+enter", "alt+enter"],
  "request.cancel": ["ctrl+x"],
  "pane.focusNext": ["tab"],
  "pane.focusPrev": ["shift+tab"],
  "pane.focusFiles": ["ctrl+1", "alt+1"],
  "pane.focusEditor": ["ctrl+2", "alt+2"],
  "pane.focusResponse": ["ctrl+3", "alt+3"],
  "sidebar.toggle": ["ctrl+b"],
  "file.save": ["ctrl+s"],
  "env.switcher": ["ctrl+e"],
  "env.selectNext": ["down"],
  "env.selectPrev": ["up"],
  "env.apply": ["enter"],
  "overlay.close": ["escape"],
  "app.quit": ["ctrl+q"],
  "palette.commands": ["F2", "ctrl+shift+p"],
  "palette.files": ["ctrl+p"],
  "help.show": ["F1"],
  "keybindings.show": ["ctrl+/"],
  "pane.zoom": ["F11", "z"],
  "response.tab.next": ["ctrl+tab"],
  "response.tab.prev": ["ctrl+shift+tab"],
  "response.copy": ["ctrl+shift+c"],
  "response.search": ["ctrl+f"],
  "response.jsonFoldToggle": ["ctrl+["],
  "response.jsonUnfoldAll": ["ctrl+]"],
  "editor.searchNext": [],
};

function commandKey(
  bindings: Readonly<Record<string, string>>,
  command: CommandId,
): string | null {
  const keys = Object.entries(bindings)
    .filter(([, boundCommand]) => boundCommand === command)
    .map(([key]) => key);
  if (command === "help.show" && keys.length === 0) {
    return "F1";
  }
  if (keys.length === 0) {
    return null;
  }
  const preferred = PREFERRED_FOOTER_KEYS[command] ?? [];
  keys.sort((a, b) => {
    const aPreferred = preferred.indexOf(a);
    const bPreferred = preferred.indexOf(b);
    if (aPreferred !== -1 || bPreferred !== -1) {
      return (aPreferred === -1 ? Number.MAX_SAFE_INTEGER : aPreferred) -
        (bPreferred === -1 ? Number.MAX_SAFE_INTEGER : bPreferred);
    }
    return formatKeyChord(a).length - formatKeyChord(b).length || a.localeCompare(b);
  });
  return keys[0] ?? null;
}

function footerCommandList(context: FooterHintContext): CommandId[] {
  const action: CommandId = context.sending ? "request.cancel" : "request.send";
  let contextual: readonly CommandId[];
  if (context.overlay !== "none") {
    contextual = FOOTER_COMMANDS.overlay!;
  } else if (context.sending) {
    contextual = FOOTER_COMMANDS.sending!;
  } else {
    contextual = FOOTER_COMMANDS[context.focusPane] ?? FOOTER_COMMANDS.editor!;
  }

  const commands = [action, ...contextual];
  if (!context.hasResponse) {
    return commands.filter(
      (command) =>
        command !== "response.copy" &&
        command !== "response.jsonFoldToggle" &&
        command !== "response.jsonUnfoldAll",
    );
  }
  if (context.responseTab !== "pretty") {
    return commands.filter(
      (command) =>
        command !== "response.jsonFoldToggle" && command !== "response.jsonUnfoldAll",
    );
  }
  if (!context.hasFoldedJson) {
    return commands.filter((command) => command !== "response.jsonUnfoldAll");
  }
  return commands;
}

export function footerHintItems(context: FooterHintContext): FooterHintItem[] {
  const bindings = context.bindings ?? {};
  const seen = new Set<CommandId>();
  const commands = [...footerCommandList(context), "help.show" as const].filter((command) => {
    if (command === "help.show") {
      seen.delete(command);
    }
    if (seen.has(command)) {
      return false;
    }
    seen.add(command);
    return true;
  });

  const items = commands.flatMap((command): FooterHintItem[] => {
    const key = commandKey(bindings, command);
    if (!key) {
      return [];
    }
    const formattedKey = command === "help.show" ? "F1" : formatKeyChord(key);
    return [{ command, key: formattedKey, label: `${formattedKey} ${FOOTER_LABELS[command]}` }];
  });

  const leftBudget = 48;
  const maxWidth = Math.max(20, context.viewportWidth - leftBudget);
  const pinned = items.filter(
    (item) => item.command === "request.send" || item.command === "request.cancel" || item.command === "help.show",
  );
  const middle = items.filter((item) => !pinned.includes(item));
  const selected: FooterHintItem[] = [];
  const append = (item: FooterHintItem) => {
    selected.push(item);
  };
  append(pinned[0] ?? items[0]!);
  for (const item of middle) {
    const candidate = [...selected, item, pinned[pinned.length - 1]!].filter(Boolean);
    if (candidate.map((entry) => entry.label).join(" · ").length <= maxWidth) {
      append(item);
    }
  }
  const help = pinned.find((item) => item.command === "help.show");
  if (help && selected[selected.length - 1]?.command !== "help.show") {
    append(help);
  }
  return selected.filter(Boolean);
}

export function footerHints(context: FooterHintContext): string {
  return footerHintItems(context)
    .map((item) => item.label)
    .join(" · ");
}

export const HELP_HINT_LINES: readonly string[] = [
  "F5 Send request under cursor",
  "Tab / Shift+Tab Cycle panes",
  "Ctrl+S Save file",
  "Mouse click Place editor cursor · Shift+click Select",
  "Ctrl+A/C/X/V Select all, copy, cut, paste in editor",
  "Ctrl+E Environment switcher",
  "F2 / Ctrl+Shift+P Command palette",
  "Ctrl+Shift+C Copy response tab",
  "Ctrl+X Cancel request · Ctrl+Q Quit",
  "Ctrl+/ Full keybindings · F1 Quick help",
];
