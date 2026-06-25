import path from "node:path";

import {
  rgb,
  ui,
  type CursorPosition,
  type EditorSelection,
  type VNode,
} from "@rezi-ui/core";

import { buildRegionDiagnostics, resolveRegionAtLine } from "../engine/index.js";
import { buildKeybindingsViewLines, footerHints, HELP_HINT_LINES } from "../config/keybindings.js";
import { COMMAND_ITEMS } from "../keymap/index.js";
import type { AppState, CommandId, FocusPane } from "../state/types.js";
import { contentFromLines, resolveLayoutMode } from "../state/types.js";
import type { WorkspaceFileNode } from "../workspace/types.js";
import { methodColor, prettyJsonIfPossible, statusTone, tokenizeHttpLine } from "../utils/http-syntax.js";

export type ViewDeps = Readonly<{
  onEditorChange: (lines: readonly string[], cursor: CursorPosition) => void;
  onEditorSelection: (selection: EditorSelection | null) => void;
  onEditorScroll: (scrollTop: number, scrollLeft: number) => void;
  onTreeSelect: (node: WorkspaceFileNode) => void;
  onTreeToggle: (node: WorkspaceFileNode, expanded: boolean) => void;
  onTreePress: (node: WorkspaceFileNode) => void;
  onResponseTab: (tab: AppState["ui"]["responseTab"]) => void;
  onResponseScroll: (scrollTop: number, scrollLeft: number) => void;
  onResponseSelection: (selection: EditorSelection | null) => void;
  onResponseChange: (cursor: CursorPosition) => void;
  onSplitChange: (sizes: readonly number[]) => void;
  onCommandPaletteChange: (query: string) => void;
  onCommandPaletteSelect: (id: string) => void;
  onCommandPaletteSelectionChange: (index: number) => void;
  onOverlayClose: () => void;
  onEnvSelect: (index: number) => void;
  onResponseSearch: (query: string) => void;
}>;

function paneStyle(focused: boolean): { fg?: ReturnType<typeof rgb>; bold?: boolean } {
  return focused ? { fg: rgb(180, 220, 255), bold: true } : { fg: rgb(120, 120, 120) };
}

function renderFileTree(state: AppState, deps: ViewDeps): VNode {
  return ui.panel(
    {
      id: "pane-files",
      title: state.ui.focusPane === "files" ? "● Files" : "Files",
      style: paneStyle(state.ui.focusPane === "files"),
    },
    [
      ui.tree({
        id: "file-tree",
        data: state.fileTree,
        expanded: state.expandedPaths,
        selected: state.selectedFilePath ?? undefined,
        getKey: (node: WorkspaceFileNode) => node.path,
        getChildren: (node) =>
          node.kind === "directory" ? (node.children as WorkspaceFileNode[] | undefined) : undefined,
        onChange: (node, expanded) => deps.onTreeToggle(node, expanded),
        onSelect: (node) => deps.onTreeSelect(node),
        onPress: (node) => deps.onTreePress(node),
        renderNode: (node, _depth, nodeState) =>
          ui.row({ gap: 1 }, [
            ui.text(nodeState.selected ? `▸ ${node.name}` : node.name, {
              style: nodeState.selected
                ? { fg: rgb(255, 220, 120), bold: true }
                : state.dirty && node.path === state.selectedFilePath
                  ? { fg: rgb(255, 180, 80) }
                  : undefined,
            }),
          ]),
        flex: 1,
        minHeight: 8,
      }),
    ],
  );
}

function renderEditor(state: AppState, deps: ViewDeps, readOnly: boolean): VNode {
  const activeRegion =
    state.activeRegion ??
    (state.parsedFile
      ? resolveRegionAtLine(state.parsedFile.regions, state.editor.cursor.line)
      : null);

  const titleParts = [
    state.ui.focusPane === "editor" ? "● Editor" : "Editor",
    state.selectedFilePath ? state.selectedFilePath.split("/").pop() : "No file",
    state.dirty ? " ●" : "",
    activeRegion ? ` | ${activeRegion.method ?? "?"} ${activeRegion.name}` : "",
  ];

  const diagnostics = state.parsedFile
    ? buildRegionDiagnostics(
        state.parsedFile.regions,
        activeRegion?.id ?? null,
        state.fileLines,
      )
    : [];

  return ui.panel(
    {
      id: "pane-editor",
      title: titleParts.join(""),
      style: paneStyle(state.ui.focusPane === "editor"),
    },
    [
      ui.codeEditor({
        id: "editor",
        lines: state.fileLines,
        cursor: state.editor.cursor,
        selection: state.editor.selection,
        scrollTop: state.editor.scrollTop,
        scrollLeft: state.editor.scrollLeft,
        readOnly,
        lineNumbers: true,
        syntaxLanguage: "plain",
        tokenizeLine: tokenizeHttpLine,
        diagnostics,
        onChange: (lines, cursor) => deps.onEditorChange(lines, cursor),
        onSelectionChange: deps.onEditorSelection,
        onScroll: deps.onEditorScroll,
        flex: 1,
        minHeight: 8,
      }),
    ],
  );
}

function responseScrollProps(state: AppState, deps: ViewDeps) {
  return {
    scrollTop: state.responseEditor.scrollTop,
    scrollLeft: state.responseEditor.scrollLeft,
    onScroll: deps.onResponseScroll,
  };
}

function responseCursorProps(state: AppState, deps: ViewDeps) {
  return {
    cursor: state.responseEditor.cursor,
    selection: state.responseEditor.selection,
    onChange: (_lines: readonly string[], cursor: CursorPosition) => {
      deps.onResponseChange(cursor);
    },
    onSelectionChange: deps.onResponseSelection,
  };
}

function renderResponseBody(state: AppState, deps: ViewDeps): VNode {
  const result = state.request.result;
  const scroll = responseScrollProps(state, deps);
  const cursor = responseCursorProps(state, deps);
  const gen = state.resultGeneration;

  if (state.request.sending) {
    return ui.center(ui.spinner({ label: "Waiting for response…" }));
  }
  if (state.request.error && !result) {
    return ui.errorDisplay(state.request.error);
  }
  if (!result) {
    return ui.empty("No response", {
      description: "Press F5 to send the request under cursor",
    });
  }

  switch (state.ui.responseTab) {
    case "headers":
      return ui.table({
        id: `response-headers-${gen}`,
        columns: [
          { key: "name", header: "Header", width: 24 },
          { key: "value", header: "Value", flex: 1 },
        ],
        data: [...result.headers],
        getRowKey: (row) => row.name,
        flex: 1,
        minHeight: 6,
      });
    case "raw":
      return ui.codeEditor({
        id: `response-raw-${gen}`,
        lines: result.body ? result.body.split("\n") : [""],
        readOnly: true,
        lineNumbers: true,
        syntaxLanguage: "plain",
        ...cursor,
        ...scroll,
        flex: 1,
      });
    case "variables":
      return ui.codeEditor({
        id: `response-vars-${gen}`,
        lines: [JSON.stringify(state.request.variables, null, 2)],
        readOnly: true,
        syntaxLanguage: "json",
        ...cursor,
        ...scroll,
        flex: 1,
      });
    case "tests":
      return ui.column({ gap: 1, flex: 1 }, [
        ...result.testResults.map((test) =>
          ui.text(`${test.status === "SUCCESS" ? "✓" : "✗"} ${test.message}`, {
            style: {
              fg:
                test.status === "SUCCESS"
                  ? rgb(120, 220, 120)
                  : test.status === "SKIPPED"
                    ? rgb(220, 220, 120)
                    : rgb(220, 120, 120),
            },
          }),
        ),
      ]);
    case "pretty":
    default:
      return ui.codeEditor({
        id: `response-pretty-${gen}`,
        lines: prettyJsonIfPossible(result.prettyBody || result.body).split("\n"),
        readOnly: true,
        lineNumbers: true,
        syntaxLanguage: "json",
        searchQuery: state.editor.searchQuery || undefined,
        ...cursor,
        ...scroll,
        flex: 1,
      });
  }
}

function renderResponse(state: AppState, deps: ViewDeps): VNode {
  const result = state.request.result;
  const statusLine =
    state.request.sending || !result
      ? null
      : `${result.protocol ?? "HTTP"} ${result.statusCode ?? "?"} ${result.statusMessage ?? ""} · ${result.durationMs ?? "?"} ms`;

  const tabItems = [
    { key: "pretty", label: "Pretty" },
    { key: "raw", label: "Raw" },
    { key: "headers", label: "Headers" },
    { key: "variables", label: "Vars" },
    { key: "tests", label: "Tests" },
  ] as const;

  return ui.panel(
    {
      id: "pane-response",
      title: state.ui.focusPane === "response" ? "● Response" : "Response",
      style: paneStyle(state.ui.focusPane === "response"),
    },
    [
      ui.row({ gap: 2 }, [
        state.request.sending
          ? ui.spinner({ label: "Sending request…" })
          : ui.text(statusLine ?? "Ready", {
              style: { fg: rgb(...statusColor(result?.statusCode)), bold: true },
            }),
        result?.error && !state.request.sending
          ? ui.badge(result.error, { variant: "error" })
          : null,
      ]),
      ui.row({ gap: 1 }, [
        ...tabItems.map((tab) =>
          ui.button({
            id: `tab-${tab.key}`,
            label: tab.label,
            disabled: state.request.sending,
            onPress: () => deps.onResponseTab(tab.key),
          }),
        ),
      ]),
      renderResponseBody(state, deps),
    ],
  );
}

function statusColor(code: number | undefined): [number, number, number] {
  const tone = statusTone(code);
  switch (tone) {
    case "green":
      return [120, 220, 140];
    case "yellow":
      return [240, 200, 100];
    case "red":
      return [240, 120, 120];
    default:
      return [140, 200, 240];
  }
}

function renderMainLayout(state: AppState, deps: ViewDeps): VNode {
  const layoutMode = resolveLayoutMode(state.ui.viewportWidth);
  const zoom = state.ui.zoomPane;

  if (zoom) {
    if (zoom === "files") return renderFileTree(state, deps);
    if (zoom === "editor") return renderEditor(state, deps, false);
    return renderResponse(state, deps);
  }

  if (layoutMode === "stacked") {
    const pane =
      state.ui.focusPane === "files"
        ? renderFileTree(state, deps)
        : state.ui.focusPane === "response"
          ? renderResponse(state, deps)
          : renderEditor(state, deps, false);
    return pane;
  }

  if (layoutMode === "sidebar-overlay") {
    return ui.row({ gap: 1, flex: 1 }, [
      state.ui.sidebarVisible
        ? ui.box({ width: 28, flex: 0 }, [renderFileTree(state, deps)])
        : null,
      ui.column({ gap: 1, flex: 1 }, [
        renderEditor(state, deps, false),
        renderResponse(state, deps),
      ]),
    ]);
  }

  return ui.column({ gap: 1, flex: 1 }, [
    ui.splitPane(
      {
        id: "main-split",
        direction: "horizontal",
        sizes: [...state.ui.splitSizes],
        minSizes: [18, 24, 24],
        onChange: deps.onSplitChange,
      },
      [
        renderFileTree(state, deps),
        renderEditor(state, deps, false),
        renderResponse(state, deps),
      ],
    ),
  ]);
}

function renderFooter(state: AppState): VNode {
  const env =
    state.request.activeEnvironment.length > 0
      ? state.request.activeEnvironment.join(",")
      : "none";
  const dirName = path.basename(state.workspaceRoot);
  const branch = state.ui.gitBranch ?? "—";
  const fileName = state.selectedFilePath
    ? path.basename(state.selectedFilePath)
    : null;

  const hints = footerHints({
    focusPane: state.ui.focusPane,
    overlay: state.ui.overlay,
    viewportWidth: state.ui.viewportWidth,
    sending: state.request.sending,
  });

  return ui.statusBar({
    id: "status-bar",
    left: [
      ui.text(dirName, { style: { fg: rgb(180, 220, 255), bold: true } }),
      ui.text(` ⎇ ${branch}`, { style: { fg: rgb(160, 220, 160) } }),
      fileName ? ui.text(` | ${fileName}`) : null,
      state.dirty ? ui.text(" ●", { style: { fg: rgb(255, 180, 80) } }) : null,
      ui.text(` | env: ${env}`, { style: { fg: rgb(160, 200, 255) } }),
      state.ui.statusMessage ? ui.text(` | ${state.ui.statusMessage}`) : null,
    ].filter(Boolean) as VNode[],
    right: [ui.text(hints)],
  });
}

function renderOverlayContent(state: AppState, deps: ViewDeps): VNode {
  switch (state.ui.overlay) {
    case "env":
      return ui.modal({
        id: "env-modal",
        title: "Environment",
        content: ui.column({ gap: 1 }, [
          ui.text("Select environment (Enter to apply, Esc to close)"),
          ui.text("(none)", {
            style:
              state.ui.envSelectedIndex === 0
                ? { fg: rgb(255, 220, 120), bold: true }
                : undefined,
          }),
          ...state.request.environments.map((env, index) =>
            ui.text(env, {
              style:
                index + 1 === state.ui.envSelectedIndex
                  ? { fg: rgb(255, 220, 120), bold: true }
                  : undefined,
            }),
          ),
        ]),
        onClose: deps.onOverlayClose,
        width: 50,
        height: 16,
      });
    case "help":
      return ui.modal({
        id: "help-modal",
        title: "reqex help",
        content: ui.column({ gap: 1 }, HELP_HINT_LINES.map((line) => ui.text(line))),
        onClose: deps.onOverlayClose,
        width: 70,
        height: 14,
      });
    case "keybindings": {
      const maxLines = Math.max(8, Math.min(26, state.ui.viewportHeight - 8));
      const lines = buildKeybindingsViewLines(
        state.settings.keybindings as Record<string, CommandId>,
        maxLines,
      );
      return ui.modal({
        id: "keybindings-modal",
        title: "Keybindings",
        content: ui.column({ gap: 0 }, lines.map((line) => ui.text(line))),
        onClose: deps.onOverlayClose,
        width: 72,
        height: Math.min(maxLines + 4, 28),
      });
    }
    case "commandPalette":
      return ui.center(
        ui.commandPalette({
          id: "command-palette",
          open: true,
          query: state.ui.commandPalette.query,
          selectedIndex: state.ui.commandPalette.selectedIndex,
          sources: [
            {
              id: "commands",
              name: "Commands",
              getItems: (query) =>
                COMMAND_ITEMS.filter((item) =>
                  item.label.toLowerCase().includes(query.toLowerCase()),
                ).map((item) => ({
                  id: item.id,
                  label: item.label,
                  description: item.description,
                  shortcut: item.shortcut,
                  sourceId: "commands",
                })),
            },
          ],
          onChange: deps.onCommandPaletteChange,
          onSelect: (item) => deps.onCommandPaletteSelect(item.id),
          onClose: deps.onOverlayClose,
          onSelectionChange: deps.onCommandPaletteSelectionChange,
          width: 60,
        }),
      );
    default:
      return ui.text("");
  }
}

export function renderApp(state: AppState, deps: ViewDeps): VNode {
  const base = ui.column({ gap: 1, flex: 1 }, [
    renderMainLayout(state, deps),
    renderFooter(state),
  ]);

  if (state.ui.overlay === "none") {
    return base;
  }

  return ui.layers([
    base,
    ui.layer({
      id: "overlay-layer",
      modal: true,
      backdrop: "dim",
      closeOnEscape: true,
      onClose: deps.onOverlayClose,
      content: renderOverlayContent(state, deps),
    }),
  ]);
}

export function focusPaneId(pane: FocusPane): string {
  switch (pane) {
    case "files":
      return "pane-files";
    case "editor":
      return "pane-editor";
    case "response":
      return "pane-response";
  }
}

export { contentFromLines, methodColor };
