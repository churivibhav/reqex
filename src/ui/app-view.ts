import path from "node:path";

import {
  ui,
  type CursorPosition,
  type EditorSelection,
  type VNode,
} from "@rezi-ui/core";

import { resolveActiveRegion } from "../engine/index.js";
import {
  buildKeybindingsViewLines,
  footerHintItems,
  HELP_HINT_LINES,
} from "../config/keybindings.js";
import { COMMAND_ITEMS } from "../keymap/index.js";
import type { AppState, CommandId, FocusPane } from "../state/types.js";
import { contentFromLines, resolveLayoutMode } from "../state/types.js";
import type { WorkspaceFileNode } from "../workspace/types.js";
import { colorsForMode, statusColorForTone, type ThemeColors } from "./theme-colors.js";
import {
  createRegionAwareTokenizer,
  editorCursorFromSource,
  editorSelectionFromSource,
  prefixEditorLines,
} from "./editor-gutter.js";
import { methodColor, prettyJsonIfPossible, statusTone } from "../utils/http-syntax.js";
import { buildFoldableJsonView } from "../utils/json-folding.js";

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
  onResponseJsonFoldToggle: () => void;
  onResponseJsonUnfoldAll: () => void;
  onSplitChange: (sizes: readonly number[]) => void;
  onCommandPaletteChange: (query: string) => void;
  onCommandPaletteSelect: (id: string) => void;
  onCommandPaletteSelectionChange: (index: number) => void;
  onOverlayClose: () => void;
  onEnvSelect: (index: number) => void;
  onResponseSearch: (query: string) => void;
  onCommand: (command: CommandId) => void;
}>;

function paneStyle(colors: ThemeColors, focused: boolean) {
  return {
    bg: colors.bgElevated,
    ...(focused ? { fg: colors.paneFocused, bold: true } : { fg: colors.paneMuted }),
  };
}

function renderFileTree(state: AppState, deps: ViewDeps, colors: ThemeColors): VNode {
  return ui.panel(
    {
      id: "pane-files",
      title: state.ui.focusPane === "files" ? "● Files" : "Files",
      style: paneStyle(colors, state.ui.focusPane === "files"),
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
                ? { fg: colors.selected, bold: true }
                : state.dirty && node.path === state.selectedFilePath
                  ? { fg: colors.dirty }
                  : undefined,
            }),
          ]),
        flex: 1,
        minHeight: 8,
      }),
    ],
  );
}

function renderEditor(state: AppState, deps: ViewDeps, readOnly: boolean, colors: ThemeColors): VNode {
  const activeRegion = resolveActiveRegion(state.parsedFile, state.editor.cursor.line);

  const titleParts = [
    state.ui.focusPane === "editor" ? "● Editor" : "Editor",
    state.selectedFilePath ? state.selectedFilePath.split("/").pop() : "No file",
    state.dirty ? " ●" : "",
    activeRegion ? ` | ${activeRegion.method ?? "?"} ${activeRegion.name}` : "",
  ];

  return ui.panel(
    {
      id: "pane-editor",
      title: titleParts.join(""),
      style: paneStyle(colors, state.ui.focusPane === "editor"),
    },
    [
      ui.codeEditor({
        id: "editor",
        lines: prefixEditorLines(state.fileLines, activeRegion),
        cursor: editorCursorFromSource(state.editor.cursor),
        selection: editorSelectionFromSource(state.editor.selection),
        scrollTop: state.editor.scrollTop,
        scrollLeft: state.editor.scrollLeft,
        readOnly,
        lineNumbers: true,
        syntaxLanguage: "plain",
        tokenizeLine: createRegionAwareTokenizer(activeRegion),
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

function renderResponseBody(state: AppState, deps: ViewDeps, colors: ThemeColors): VNode {
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
                  ? colors.success
                  : test.status === "SKIPPED"
                    ? colors.warning
                    : colors.error,
            },
          }),
        ),
      ]);
    case "pretty":
    default: {
      const prettyView = buildFoldableJsonView(
        prettyJsonIfPossible(result.prettyBody || result.body),
        state.responseEditor.foldedJsonPaths,
      );
      return ui.codeEditor({
        id: `response-pretty-${gen}`,
        lines: prettyView.lines,
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
}

function renderResponse(state: AppState, deps: ViewDeps, colors: ThemeColors): VNode {
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
      style: paneStyle(colors, state.ui.focusPane === "response"),
    },
    [
      ui.row({ gap: 2 }, [
        state.request.sending
          ? ui.spinner({ label: "Sending request…" })
          : ui.text(statusLine ?? "Ready", {
              style: {
                fg: statusColorForTone(colors, statusTone(result?.statusCode)),
                bold: true,
              },
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
        state.ui.responseTab === "pretty" && result
          ? ui.button({
              id: "response-json-fold",
              label: "Fold/Unfold",
              disabled: state.request.sending,
              onPress: deps.onResponseJsonFoldToggle,
            })
          : null,
        state.ui.responseTab === "pretty" && state.responseEditor.foldedJsonPaths.length > 0
          ? ui.button({
              id: "response-json-unfold-all",
              label: "Unfold all",
              disabled: state.request.sending,
              onPress: deps.onResponseJsonUnfoldAll,
            })
          : null,
      ]),
      renderResponseBody(state, deps, colors),
    ],
  );
}

function renderMainLayout(state: AppState, deps: ViewDeps, colors: ThemeColors): VNode {
  const layoutMode = resolveLayoutMode(state.ui.viewportWidth);
  const zoom = state.ui.zoomPane;

  if (zoom) {
    if (zoom === "files") return renderFileTree(state, deps, colors);
    if (zoom === "editor") return renderEditor(state, deps, false, colors);
    return renderResponse(state, deps, colors);
  }

  if (layoutMode === "stacked") {
    const pane =
      state.ui.focusPane === "files"
        ? renderFileTree(state, deps, colors)
        : state.ui.focusPane === "response"
          ? renderResponse(state, deps, colors)
          : renderEditor(state, deps, false, colors);
    return pane;
  }

  if (layoutMode === "sidebar-overlay") {
    return ui.row({ gap: 1, flex: 1 }, [
      state.ui.sidebarVisible
        ? ui.box({ width: 28, flex: 0 }, [renderFileTree(state, deps, colors)])
        : null,
      ui.column({ gap: 1, flex: 1 }, [
        renderEditor(state, deps, false, colors),
        renderResponse(state, deps, colors),
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
        renderFileTree(state, deps, colors),
        renderEditor(state, deps, false, colors),
        renderResponse(state, deps, colors),
      ],
    ),
  ]);
}

function renderFooter(state: AppState, deps: ViewDeps, colors: ThemeColors): VNode {
  const env =
    state.request.activeEnvironment.length > 0
      ? state.request.activeEnvironment.join(",")
      : "none";
  const dirName = path.basename(state.workspaceRoot);
  const branch = state.ui.gitBranch ?? "—";
  const fileName = state.selectedFilePath
    ? path.basename(state.selectedFilePath)
    : null;

  const hints = footerHintItems({
    focusPane: state.ui.focusPane,
    overlay: state.ui.overlay,
    viewportWidth: state.ui.viewportWidth,
    sending: state.request.sending,
    bindings: state.settings.keybindings,
    responseTab: state.ui.responseTab,
    hasResponse: Boolean(state.request.result),
    hasFoldedJson: state.responseEditor.foldedJsonPaths.length > 0,
  });

  return ui.statusBar({
    id: "status-bar",
    style: { bg: colors.bgSubtle, fg: colors.fgPrimary },
    left: [
      ui.text(dirName, { style: { fg: colors.paneFocused, bold: true } }),
      ui.text(` ⎇ ${branch}`, { style: { fg: colors.success } }),
      fileName ? ui.text(` | ${fileName}`) : null,
      state.dirty ? ui.text(" ●", { style: { fg: colors.dirty } }) : null,
      ui.text(` | env: ${env}`, { style: { fg: colors.info } }),
      state.ui.statusMessage ? ui.text(` | ${state.ui.statusMessage}`) : null,
    ].filter(Boolean) as VNode[],
    right: hints.map((hint) =>
      ui.button({
        id: `status-${hint.command}`,
        label: hint.label,
        onPress: () => deps.onCommand(hint.command),
      }),
    ),
  });
}

function renderOverlayContent(state: AppState, deps: ViewDeps, colors: ThemeColors): VNode {
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
                ? { fg: colors.selected, bold: true }
                : undefined,
          }),
          ...state.request.environments.map((env, index) =>
            ui.text(env, {
              style:
                index + 1 === state.ui.envSelectedIndex
                  ? { fg: colors.selected, bold: true }
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
  const colors = colorsForMode(state.settings.themeMode);
  const base = ui.column({ gap: 1, flex: 1, style: { bg: colors.bgBase } }, [
    renderMainLayout(state, deps, colors),
    renderFooter(state, deps, colors),
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
      content: renderOverlayContent(state, deps, colors),
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
