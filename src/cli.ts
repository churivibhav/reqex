import path from "node:path";
import process from "node:process";

import { createNodeApp, type NodeApp } from "@rezi-ui/node";
import type { UiEvent } from "@rezi-ui/core";

import { loadKeybindings, watchKeybindings } from "./config/keybindings.js";
import { initEngineProviders, resolveRegionAtLine } from "./engine/index.js";
import { buildBindingMap, commandFromPaletteId } from "./keymap/index.js";
import { createCommandContext, createInitialState, type CommandBus } from "./state/commands.js";
import type { AppState, FocusPane } from "./state/types.js";
import { contentFromLines, resolveLayoutMode } from "./state/types.js";
import { focusPaneId, renderApp } from "./ui/app-view.js";
import { copyToClipboard, disableFlowControl } from "./utils/clipboard.js";
import { getGitBranch } from "./utils/git.js";
import { Workspace, flattenFiles } from "./workspace/index.js";

async function main(): Promise<void> {
  initEngineProviders();

  const workspaceRoot = path.resolve(process.argv[2] ?? process.cwd());
  const workspace = new Workspace(workspaceRoot);
  const tree = await workspace.open();

  let currentState = createInitialState(workspaceRoot);
  currentState = {
    ...currentState,
    fileTree: tree,
    expandedPaths: tree.filter((n) => n.kind === "directory").map((n) => n.path),
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
      ...buildBindingMap(loaded.bindings, (command) => {
        if (command === "response.copy") {
          void handleCopy(app!, currentState);
        }
        bus!.execute(command);
      }),
      enter: {
        handler: () => bus!.execute("env.apply"),
        when: (ctx) => ctx.state.ui.overlay === "env",
        description: "Apply selected environment",
      },
      up: {
        handler: () => {
          if (currentState.ui.overlay === "env") {
            bus!.execute("env.selectPrev");
          }
        },
        when: (ctx) =>
          ctx.state.ui.overlay === "env" || ctx.state.ui.overlay === "commandPalette",
      },
      down: {
        handler: () => {
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
        keymapPreset: loaded.preset,
        keybindings: loaded.bindings,
      },
    }));
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
      void workspace.close().finally(() => {
        app?.stop().finally(() => process.exit(0));
      });
    },
    reloadKeybindings,
  });

  app = createNodeApp({ initialState: currentState });
  reloadKeybindings();
  disableFlowControl();

  const stopWatch = watchKeybindings(workspaceRoot, reloadKeybindings);

  workspace.on("change", () => {
    void bus!.refreshWorkspace();
    void refreshGitBranch();
  });

  app.view((state) =>
    renderApp(state, {
      onEditorChange: (lines, cursor) => {
        app?.update((prev) => {
          const activeRegion = prev.parsedFile
            ? resolveRegionAtLine(prev.parsedFile.regions, cursor.line)
            : null;
          return {
            ...prev,
            fileLines: [...lines],
            dirty: contentFromLines(lines) !== prev.fileContent,
            activeRegion,
            ui: { ...prev.ui, focusPane: "editor" },
            editor: { ...prev.editor, cursor },
          };
        });
      },
      onEditorSelection: (selection) => {
        app?.update((prev) => {
          const cursorLine = selection?.active.line ?? prev.editor.cursor.line;
          const activeRegion = prev.parsedFile
            ? resolveRegionAtLine(prev.parsedFile.regions, cursorLine)
            : null;
          return {
            ...prev,
            activeRegion,
            ui: { ...prev.ui, focusPane: "editor" },
            editor: {
              ...prev.editor,
              selection,
              cursor: selection?.active ?? prev.editor.cursor,
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
        app?.update((prev) => ({
          ...prev,
          ui: { ...prev.ui, envSelectedIndex: index },
        }));
      },
      onResponseSearch: (query) => {
        app?.update((prev) => ({
          ...prev,
          editor: { ...prev.editor, searchQuery: query },
        }));
      },
    }),
  );

  app.onEvent((event) => handleUiEvent(event, app!));

  const files = flattenFiles(tree).filter((node) => node.kind === "file");
  if (files[0]) {
    await bus.openFile(files[0].path);
  }

  await app.run();
  stopWatch();
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

function handleUiEvent(event: UiEvent, app: NodeApp<AppState>): void {
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

  if (event.kind !== "engine" || event.event.kind !== "mouse") {
    return;
  }

  const { x, y } = event.event;
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
    if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) {
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
