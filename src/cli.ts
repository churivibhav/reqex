import path from "node:path";
import process from "node:process";

import type { UiEvent, ZrevEvent } from "@rezi-ui/core";
import { ZR_MOD_CTRL, ZR_MOD_SHIFT } from "@rezi-ui/core/keybindings";

import { createNodeApp, type NodeApp } from "@rezi-ui/node";

import { loadConfig, watchConfig, type ThemePreference } from "./config/config.js";
import { loadKeybindings, watchKeybindings } from "./config/keybindings.js";
import { initEngineProviders } from "./engine/index.js";
import { buildBindingMap, commandFromPaletteId } from "./keymap/index.js";
import { createCommandContext, createInitialState, type CommandBus } from "./state/commands.js";
import { pasteIntoEditor } from "./state/editor-edit.js";
import type { AppState, CommandId, FocusPane, ThemeMode } from "./state/types.js";
import { contentFromLines, resolveLayoutMode } from "./state/types.js";
import { themeForMode } from "./ui/theme-colors.js";
import { focusPaneId, renderApp } from "./ui/app-view.js";
import {
  sourceCursorFromEditorPoint,
  sourceCursorFromEditor,
  sourceSelectionFromEditor,
  stripEditorLines,
  prefixEditorLines,
} from "./ui/editor-gutter.js";
import { resolveWheelScroll } from "./ui/scroll.js";
import { copyToClipboard, readFromClipboard } from "./utils/clipboard.js";
import { getGitBranch } from "./utils/git.js";
import { prettyJsonIfPossible } from "./utils/http-syntax.js";
import { buildFoldableJsonView } from "./utils/json-folding.js";
import { resolveThemeMode } from "./utils/terminal-theme.js";
import { Workspace, flattenFiles } from "./workspace/index.js";

type ElementRect = Readonly<{ x: number; y: number; w: number; h: number }>;

function isPointInRect(x: number, y: number, rect: ElementRect): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

function responseEditorId(state: AppState): string | null {
  switch (state.ui.responseTab) {
    case "pretty":
      return `response-pretty-${state.resultGeneration}`;
    case "raw":
      return `response-raw-${state.resultGeneration}`;
    case "variables":
      return `response-vars-${state.resultGeneration}`;
    case "headers":
    case "tests":
      return null;
  }
}

function responseEditorLines(state: AppState): readonly string[] | null {
  const result = state.request.result;
  if (!result) {
    return null;
  }

  switch (state.ui.responseTab) {
    case "pretty":
      return buildFoldableJsonView(
        prettyJsonIfPossible(result.prettyBody || result.body),
        state.responseEditor.foldedJsonPaths,
      ).lines;
    case "raw":
      return result.body ? result.body.split("\n") : [""];
    case "variables":
      return JSON.stringify(state.request.variables, null, 2).split("\n");
    case "headers":
    case "tests":
      return null;
  }
}

function handleWheelEvent(event: ZrevEvent, app: NodeApp<AppState>): boolean {
  if (event.kind !== "mouse" || event.mouseKind !== 5) {
    return false;
  }

  let handled = false;
  app.update((prev) => {
    const editorRect = app.measureElement("editor");
    if (editorRect && isPointInRect(event.x, event.y, editorRect)) {
      handled = true;
      const next = resolveWheelScroll(
        event,
        prev.editor,
        prefixEditorLines(prev.fileLines, null),
        { width: editorRect.w, height: editorRect.h },
      );
      return {
        ...prev,
        ui: { ...prev.ui, focusPane: "editor" },
        editor: next
          ? { ...prev.editor, scrollTop: next.scrollTop, scrollLeft: next.scrollLeft }
          : prev.editor,
      };
    }

    const id = responseEditorId(prev);
    const responseRect = id ? app.measureElement(id) : null;
    if (responseRect && isPointInRect(event.x, event.y, responseRect)) {
      handled = true;
      const lines = responseEditorLines(prev);
      const next = lines
        ? resolveWheelScroll(event, prev.responseEditor, lines, {
            width: responseRect.w,
            height: responseRect.h,
          })
        : null;
      return {
        ...prev,
        ui: { ...prev.ui, focusPane: "response" },
        responseEditor: next
          ? { ...prev.responseEditor, scrollTop: next.scrollTop, scrollLeft: next.scrollLeft }
          : prev.responseEditor,
      };
    }

    return prev;
  });

  return handled;
}

async function main(): Promise<void> {
  initEngineProviders();

  const workspaceRoot = path.resolve(process.argv[2] ?? process.cwd());
  const workspace = new Workspace(workspaceRoot);
  const tree = await workspace.open();

  const config = loadConfig(workspaceRoot);
  const initialThemeMode = await resolveThemeMode(config.theme);

  let currentState = createInitialState(workspaceRoot);
  currentState = {
    ...currentState,
    fileTree: tree,
    expandedPaths: tree.filter((n) => n.kind === "directory").map((n) => n.path),
    settings: {
      ...currentState.settings,
      theme: config.theme,
      themeMode: initialThemeMode,
    },
    ui: {
      ...currentState.ui,
      gitBranch: await getGitBranch(workspaceRoot),
    },
  };

  let app: NodeApp<AppState> | null = null;
  let bus: CommandBus | null = null;

  const refreshGitBranch = async () => {
    const branch = await getGitBranch(workspaceRoot);
    app?.update((prev) => ({
      ...prev,
      ui: { ...prev.ui, gitBranch: branch },
    }));
  };

  const reloadKeybindings = () => {
    if (!app || !bus) {
      return;
    }
    const loaded = loadKeybindings(workspaceRoot);
    app.keys({
      ...buildBindingMap(loaded.bindings, (command, ctx) => {
        currentState = ctx.state as AppState;
        if (command === "response.copy") {
          void handleCopy(app!, currentState);
        }
        bus!.execute(command);
      }),
      enter: {
        handler: (ctx) => {
          currentState = ctx.state as AppState;
          bus!.execute("env.apply");
        },
        when: (ctx) => ctx.state.ui.overlay === "env",
        description: "Apply selected environment",
      },
      up: {
        handler: (ctx) => {
          currentState = ctx.state as AppState;
          if (currentState.ui.overlay === "env") {
            bus!.execute("env.selectPrev");
          }
        },
        when: (ctx) =>
          ctx.state.ui.overlay === "env" || ctx.state.ui.overlay === "commandPalette",
      },
      down: {
        handler: (ctx) => {
          currentState = ctx.state as AppState;
          if (currentState.ui.overlay === "env") {
            bus!.execute("env.selectNext");
          }
        },
        when: (ctx) =>
          ctx.state.ui.overlay === "env" || ctx.state.ui.overlay === "commandPalette",
      },
    });
    app.update((state) => ({
      ...state,
      settings: {
        ...state.settings,
        keymapPreset: loaded.preset,
        keybindings: loaded.bindings,
      },
    }));
  };

  const applyTheme = async (preference: ThemePreference) => {
    if (!app) {
      return;
    }
    const themeMode: ThemeMode = await resolveThemeMode(preference, {
      allowProbe: false,
      fallbackMode: currentState.settings.themeMode,
    });
    app.setTheme(themeForMode(themeMode));
    app.update((state) => ({
      ...state,
      settings: {
        ...state.settings,
        theme: preference,
        themeMode,
      },
    }));
  };

  const reloadConfig = () => {
    void applyTheme(loadConfig(workspaceRoot).theme);
  };

  bus = createCommandContext({
    workspace,
    getState: () => currentState,
    update: (updater) => {
      app?.update((prev) => {
        currentState = typeof updater === "function" ? updater(prev) : updater;
        return currentState;
      });
    },
    quit: () => {
      void workspace.close().finally(async () => {
        await app?.stop();
        await app?.dispose();
        process.exit(0);
      });
    },
    reloadKeybindings,
  });

  app = createNodeApp({ initialState: currentState, theme: themeForMode(initialThemeMode) });
  reloadKeybindings();

  const executeCommand = (command: CommandId) => {
    if (!bus || !app) {
      return;
    }
    if (command === "response.copy") {
      void handleCopy(app, currentState);
    }
    bus.execute(command);
  };

  const stopKeybindingWatch = watchKeybindings(workspaceRoot, reloadKeybindings);
  const stopConfigWatch = watchConfig(workspaceRoot, reloadConfig);

  workspace.on("change", () => {
    void bus!.refreshWorkspace();
    void refreshGitBranch();
  });

  app.view((state) =>
    renderApp(state, {
      onEditorChange: (lines, cursor) => {
        app?.update((prev) => {
          const fileLines = stripEditorLines(lines);
          const sourceCursor = sourceCursorFromEditor(cursor);
          return {
            ...prev,
            fileLines,
            dirty: contentFromLines(fileLines) !== prev.fileContent,
            ui: { ...prev.ui, focusPane: "editor" },
            editor: { ...prev.editor, cursor: sourceCursor },
          };
        });
      },
      onEditorSelection: (selection) => {
        app?.update((prev) => {
          const sourceSelection = sourceSelectionFromEditor(selection);
          return {
            ...prev,
            ui: { ...prev.ui, focusPane: "editor" },
            editor: {
              ...prev.editor,
              selection: sourceSelection,
              cursor: sourceSelection?.active ?? prev.editor.cursor,
            },
          };
        });
      },
      onEditorScroll: (scrollTop, scrollLeft) => {
        app?.update((prev) => ({
          ...prev,
          editor: { ...prev.editor, scrollTop, scrollLeft },
        }));
      },
      onTreeSelect: (node) => {
        if (node.kind === "file") {
          void bus!.openFile(node.path);
        }
      },
      onTreeToggle: (node, expanded) => {
        app?.update((prev) => ({
          ...prev,
          expandedPaths: expanded
            ? [...prev.expandedPaths, node.path]
            : prev.expandedPaths.filter((p) => p !== node.path),
        }));
      },
      onTreePress: (node) => {
        if (node.kind === "file") {
          void bus!.openFile(node.path);
        }
      },
      onResponseTab: (tab) => {
        app?.update((prev) => ({
          ...prev,
          ui: { ...prev.ui, responseTab: tab },
          responseEditor: {
            ...prev.responseEditor,
            scrollTop: 0,
            scrollLeft: 0,
            cursor: { line: 0, column: 0 },
            selection: null,
          },
        }));
      },
      onResponseScroll: (scrollTop, scrollLeft) => {
        app?.update((prev) => ({
          ...prev,
          responseEditor: { ...prev.responseEditor, scrollTop, scrollLeft },
        }));
      },
      onResponseSelection: (selection) => {
        app?.update((prev) => ({
          ...prev,
          ui: { ...prev.ui, focusPane: "response" },
          responseEditor: {
            ...prev.responseEditor,
            selection,
            cursor: selection?.active ?? prev.responseEditor.cursor,
          },
        }));
      },
      onResponseChange: (cursor) => {
        app?.update((prev) => ({
          ...prev,
          ui: { ...prev.ui, focusPane: "response" },
          responseEditor: { ...prev.responseEditor, cursor },
        }));
      },
      onResponseJsonFoldToggle: () => {
        bus?.execute("response.jsonFoldToggle");
      },
      onResponseJsonUnfoldAll: () => {
        bus?.execute("response.jsonUnfoldAll");
      },
      onSplitChange: (sizes) => {
        if (sizes.length === 3) {
          app?.update((prev) => ({
            ...prev,
            ui: { ...prev.ui, splitSizes: [sizes[0]!, sizes[1]!, sizes[2]!] },
          }));
        }
      },
      onCommandPaletteChange: (query) => {
        app?.update((prev) => ({
          ...prev,
          ui: {
            ...prev.ui,
            commandPalette: { ...prev.ui.commandPalette, query, selectedIndex: 0 },
          },
        }));
      },
      onCommandPaletteSelectionChange: (index) => {
        app?.update((prev) => ({
          ...prev,
          ui: {
            ...prev.ui,
            commandPalette: { ...prev.ui.commandPalette, selectedIndex: index },
          },
        }));
      },
      onCommandPaletteSelect: (id) => {
        bus?.execute("overlay.close");
        const command = commandFromPaletteId(id);
        if (command && command !== "palette.commands") {
          bus?.execute(command);
        }
      },
      onOverlayClose: () => {
        bus?.execute("overlay.close");
      },
      onEnvSelect: (index) => {
        app?.update((prev) => {
          currentState = {
            ...prev,
            ui: { ...prev.ui, envSelectedIndex: index },
          };
          return currentState;
        });
        bus?.execute("env.apply");
      },
      onResponseSearch: (query) => {
        app?.update((prev) => ({
          ...prev,
          editor: { ...prev.editor, searchQuery: query },
        }));
      },
      onCommand: executeCommand,
    }),
  );

  app.onEvent((event) => {
    void handleUiEvent(event, app!);
  });

  const files = flattenFiles(tree).filter((node) => node.kind === "file");
  if (files[0]) {
    await bus.openFile(files[0].path);
  }

  await app.run();
  stopKeybindingWatch();
  stopConfigWatch();
}

async function handleCopy(app: NodeApp<AppState>, state: AppState): Promise<void> {
  const result = state.request.result;
  if (!result) {
    return;
  }
  let text = result.body;
  if (state.ui.responseTab === "pretty") {
    text = result.prettyBody || result.body;
  } else if (state.ui.responseTab === "headers") {
    text = result.headers.map((h) => `${h.name}: ${h.value}`).join("\n");
  }
  const ok = await copyToClipboard(text);
  app.update((prev) => ({
    ...prev,
    ui: { ...prev.ui, statusMessage: ok ? "Copied" : "Copy failed" },
  }));
}

async function handlePaste(app: NodeApp<AppState>): Promise<void> {
  const text = await readFromClipboard();
  app.update((prev) => {
    if (prev.ui.overlay !== "none" || prev.ui.focusPane !== "editor") {
      return prev;
    }
    if (!text) {
      return {
        ...prev,
        ui: { ...prev.ui, statusMessage: text === "" ? "Clipboard empty" : "Paste failed" },
      };
    }

    const next = pasteIntoEditor({
      lines: prev.fileLines,
      cursor: prev.editor.cursor,
      selection: prev.editor.selection,
      text,
    });
    return {
      ...prev,
      fileLines: next.lines,
      dirty: contentFromLines(next.lines) !== prev.fileContent,
      editor: {
        ...prev.editor,
        cursor: next.cursor,
        selection: next.selection,
      },
      ui: { ...prev.ui, focusPane: "editor", statusMessage: "Pasted" },
    };
  });
}

async function handleUiEvent(event: UiEvent, app: NodeApp<AppState>): Promise<void> {
  if (event.kind === "engine" && event.event.kind === "resize") {
    const resize = event.event;
    app.update((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        viewportWidth: resize.cols,
        viewportHeight: resize.rows,
        layoutMode: resolveLayoutMode(resize.cols),
        sidebarVisible:
          resolveLayoutMode(resize.cols) === "sidebar-overlay"
            ? prev.ui.sidebarVisible
            : true,
      },
    }));
    return;
  }

  if (
    event.kind === "engine" &&
    event.event.kind === "key" &&
    event.event.action === "down" &&
    (event.event.mods & ZR_MOD_CTRL) !== 0 &&
    event.event.key === 86
  ) {
    await handlePaste(app);
    return;
  }

  if (event.kind !== "engine" || event.event.kind !== "mouse") {
    return;
  }

  if (handleWheelEvent(event.event, app)) {
    return;
  }

  const { x, y, mouseKind, mods } = event.event;
  if (mouseKind === 3) {
    const editorRect = app.measureElement("editor");
    if (
      editorRect &&
      isPointInRect(x, y, editorRect)
    ) {
      app.update((prev) => {
        const cursor = sourceCursorFromEditorPoint({
          x,
          y,
          rect: editorRect,
          lines: prev.fileLines,
          scrollTop: prev.editor.scrollTop,
          scrollLeft: prev.editor.scrollLeft,
        });
        if (!cursor) {
          return prev;
        }
        const extendSelection = (mods & ZR_MOD_SHIFT) !== 0;
        return {
          ...prev,
          ui: { ...prev.ui, focusPane: "editor" },
          editor: {
            ...prev.editor,
            cursor,
            selection: extendSelection ? { anchor: prev.editor.cursor, active: cursor } : null,
          },
        };
      });
      return;
    }
  }

  const panes: Array<{ id: string; pane: FocusPane }> = [
    { id: "pane-files", pane: "files" },
    { id: "pane-editor", pane: "editor" },
    { id: "pane-response", pane: "response" },
  ];

  for (const entry of panes) {
    const rect = app.measureElement(entry.id);
    if (!rect) {
      continue;
    }
    if (isPointInRect(x, y, rect)) {
      app.update((prev) => ({
        ...prev,
        ui: { ...prev.ui, focusPane: entry.pane },
      }));
      break;
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export { focusPaneId };
