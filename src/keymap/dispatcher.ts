import type { BindingMap, KeyContext } from "@rezi-ui/core";

import type { AppState, CommandId } from "../state/types.js";

export type CommandExecutor<S extends AppState> = (command: CommandId, ctx: KeyContext<S>) => void;

export function buildBindingMap<S extends AppState>(
  bindings: Record<string, CommandId>,
  execute: CommandExecutor<S>,
): BindingMap<KeyContext<S>> {
  const map: Record<string, (ctx: KeyContext<S>) => void> = {};

  for (const [key, command] of Object.entries(bindings)) {
    map[key] = (ctx) => execute(command, ctx);
  }

  return map;
}

export function commandFromPaletteId(id: string): CommandId | null {
  const known: Record<string, CommandId> = {
    "request.send": "request.send",
    "request.cancel": "request.cancel",
    "file.save": "file.save",
    "env.switcher": "env.switcher",
    "palette.commands": "palette.commands",
    "help.show": "help.show",
    "keybindings.show": "keybindings.show",
    "response.jsonFoldToggle": "response.jsonFoldToggle",
    "response.jsonUnfoldAll": "response.jsonUnfoldAll",
    "pane.zoom": "pane.zoom",
    "sidebar.toggle": "sidebar.toggle",
  };
  return known[id] ?? null;
}

export const COMMAND_ITEMS: ReadonlyArray<{
  id: CommandId;
  label: string;
  description: string;
  shortcut?: string;
}> = [
  { id: "request.send", label: "Send Request", description: "Send request under cursor", shortcut: "F5" },
  { id: "request.cancel", label: "Cancel Request", description: "Cancel in-flight request", shortcut: "Ctrl+X" },
  { id: "file.save", label: "Save File", description: "Write editor to disk", shortcut: "Ctrl+S" },
  { id: "env.switcher", label: "Switch Environment", description: "Choose active environment", shortcut: "Ctrl+E" },
  { id: "sidebar.toggle", label: "Toggle Sidebar", description: "Show/hide file tree", shortcut: "Ctrl+B" },
  { id: "response.jsonFoldToggle", label: "Fold/Unfold JSON", description: "Toggle JSON node in pretty response", shortcut: "Ctrl+[" },
  { id: "response.jsonUnfoldAll", label: "Unfold All JSON", description: "Expand folded pretty response JSON", shortcut: "Ctrl+]" },
  { id: "pane.zoom", label: "Zoom Pane", description: "Zoom focused pane", shortcut: "F11" },
  { id: "help.show", label: "Help", description: "Show quick help", shortcut: "F1" },
  { id: "keybindings.show", label: "Keybindings", description: "Show all keybindings", shortcut: "Ctrl+/" },
];
