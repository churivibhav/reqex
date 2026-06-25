import type { CursorPosition, EditorSelection } from "@rezi-ui/core";

import type { ExecResult, ParsedFile, RequestRegion } from "../engine/types.js";
import type { WorkspaceFileNode } from "../workspace/types.js";

export type FocusPane = "files" | "editor" | "response";
export type ResponseTab = "pretty" | "raw" | "headers" | "variables" | "tests";
export type OverlayKind = "none" | "env" | "help" | "commandPalette" | "filePicker";
export type LayoutMode = "three-pane" | "sidebar-overlay" | "stacked";

export type AppState = Readonly<{
  workspaceRoot: string;
  fileTree: readonly WorkspaceFileNode[];
  expandedPaths: readonly string[];
  selectedFilePath: string | null;
  fileContent: string;
  fileLines: readonly string[];
  dirty: boolean;
  parseVersion: number;
  parsedFile: ParsedFile | null;
  activeRegion: RequestRegion | null;
  responseEditor: Readonly<{
    scrollTop: number;
    scrollLeft: number;
  }>;
  resultGeneration: number;
  editor: Readonly<{
    cursor: CursorPosition;
    selection: EditorSelection | null;
    scrollTop: number;
    scrollLeft: number;
    searchQuery: string;
  }>;
  request: Readonly<{
    sending: boolean;
    error: string | null;
    result: ExecResult | null;
    activeEnvironment: readonly string[];
    environments: readonly string[];
    variables: Record<string, unknown>;
  }>;
  ui: Readonly<{
    focusPane: FocusPane;
    zoomPane: FocusPane | null;
    sidebarVisible: boolean;
    layoutMode: LayoutMode;
    viewportWidth: number;
    viewportHeight: number;
    overlay: OverlayKind;
    responseTab: ResponseTab;
    splitSizes: readonly [number, number, number];
    envSelectedIndex: number;
    commandPalette: Readonly<{
      open: boolean;
      query: string;
      selectedIndex: number;
    }>;
    pendingPrompt: Readonly<{
      kind: "confirm" | "input" | "list";
      message: string;
      values?: readonly string[];
      defaultValue?: string;
      masked?: boolean;
    }> | null;
    statusMessage: string | null;
    quitConfirmPending: boolean;
    gitBranch: string | null;
  }>;
  settings: Readonly<{
    keymapPreset: "vscode" | "vim";
    keybindings: Readonly<Record<string, string>>;
  }>;
}>;

export type CommandContext = Readonly<{
  state: Readonly<AppState>;
  update: (updater: AppState | ((prev: Readonly<AppState>) => AppState)) => void;
  runSend: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  saveFile: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  reloadKeybindings: () => void;
  quit: () => void;
}>;

export type CommandId =
  | "request.send"
  | "pane.focusNext"
  | "pane.focusPrev"
  | "pane.focusFiles"
  | "pane.focusEditor"
  | "pane.focusResponse"
  | "sidebar.toggle"
  | "file.save"
  | "env.switcher"
  | "env.selectNext"
  | "env.selectPrev"
  | "env.apply"
  | "overlay.close"
  | "app.quit"
  | "palette.commands"
  | "palette.files"
  | "help.show"
  | "pane.zoom"
  | "response.tab.next"
  | "response.tab.prev"
  | "response.copy"
  | "response.search"
  | "editor.searchNext";

export const FOCUS_PANES: readonly FocusPane[] = ["files", "editor", "response"];
export const RESPONSE_TABS: readonly ResponseTab[] = [
  "pretty",
  "raw",
  "headers",
  "variables",
  "tests",
];

export function createInitialState(workspaceRoot: string): AppState {
  return {
    workspaceRoot,
    fileTree: [],
    expandedPaths: [],
    selectedFilePath: null,
    fileContent: "",
    fileLines: [""],
    dirty: false,
    parseVersion: 0,
    parsedFile: null,
    activeRegion: null,
    responseEditor: { scrollTop: 0, scrollLeft: 0 },
    resultGeneration: 0,
    editor: {
      cursor: { line: 0, column: 0 },
      selection: null,
      scrollTop: 0,
      scrollLeft: 0,
      searchQuery: "",
    },
    request: {
      sending: false,
      error: null,
      result: null,
      activeEnvironment: [],
      environments: [],
      variables: {},
    },
    ui: {
      focusPane: "editor",
      zoomPane: null,
      sidebarVisible: true,
      layoutMode: "three-pane",
      viewportWidth: 120,
      viewportHeight: 40,
      overlay: "none",
      responseTab: "pretty",
      splitSizes: [22, 40, 38],
      envSelectedIndex: 0,
      commandPalette: { open: false, query: "", selectedIndex: 0 },
      pendingPrompt: null,
      statusMessage: null,
      quitConfirmPending: false,
      gitBranch: null,
    },
    settings: {
      keymapPreset: "vscode",
      keybindings: {},
    },
  };
}

export function linesFromContent(content: string): string[] {
  if (content.length === 0) {
    return [""];
  }
  return content.split(/\r?\n/u);
}

export function contentFromLines(lines: readonly string[]): string {
  return lines.join("\n");
}

export function resolveLayoutMode(width: number): LayoutMode {
  if (width < 80) {
    return "stacked";
  }
  if (width < 120) {
    return "sidebar-overlay";
  }
  return "three-pane";
}

export function nextPane(current: FocusPane): FocusPane {
  const index = FOCUS_PANES.indexOf(current);
  return FOCUS_PANES[(index + 1) % FOCUS_PANES.length] ?? "editor";
}

export function prevPane(current: FocusPane): FocusPane {
  const index = FOCUS_PANES.indexOf(current);
  return FOCUS_PANES[(index + FOCUS_PANES.length - 1) % FOCUS_PANES.length] ?? "editor";
}

export function nextResponseTab(current: ResponseTab): ResponseTab {
  const index = RESPONSE_TABS.indexOf(current);
  return RESPONSE_TABS[(index + 1) % RESPONSE_TABS.length] ?? "pretty";
}

export function prevResponseTab(current: ResponseTab): ResponseTab {
  const index = RESPONSE_TABS.indexOf(current);
  return RESPONSE_TABS[(index + RESPONSE_TABS.length - 1) % RESPONSE_TABS.length] ?? "pretty";
}
