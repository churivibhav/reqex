import {
  bumpParseVersion,
  listEnvironments,
  listVariables,
  parseFile,
  firstRequestLine,
  resolveActiveRegion,
  sendRegion,
  setPromptHandler,
} from "../engine/index.js";
import { flattenFiles, type Workspace } from "../workspace/index.js";
import {
  contentFromLines,
  createInitialState,
  linesFromContent,
  nextPane,
  prevPane,
  prevResponseTab,
  nextResponseTab,
  type AppState,
  type CommandContext,
  type CommandId,
  type FocusPane,
} from "./types.js";
import { createSendController } from "./send-controller.js";
import { prettyJsonIfPossible } from "../utils/http-syntax.js";
import { buildFoldableJsonView, toggleJsonFoldAtLine } from "../utils/json-folding.js";

export function createCommandContext(deps: {
  workspace: Workspace;
  update: CommandContext["update"];
  getState: () => AppState;
  quit: () => void;
  reloadKeybindings: () => void;
}): CommandBus {
  setPromptHandler(async (request) => {
    return new Promise((resolve) => {
      deps.update((state) => ({
        ...state,
        ui: {
          ...state.ui,
          overlay: "none",
          pendingPrompt: {
            kind: request.kind,
            message: request.message,
            values: request.kind === "list" ? request.values : undefined,
            defaultValue: request.kind === "input" ? request.defaultValue : undefined,
            masked: request.kind === "input" ? request.masked : undefined,
          },
        },
      }));
      promptResolvers.push(resolve);
    });
  });

  const promptResolvers: Array<(value: string | boolean | undefined) => void> = [];
  const sendController = createSendController();

  const resolvePrompt = (value: string | boolean | undefined) => {
    const resolver = promptResolvers.pop();
    resolver?.(value);
    deps.update((state) => ({
      ...state,
      ui: { ...state.ui, pendingPrompt: null },
    }));
  };

  const openFile = async (path: string) => {
    const content = await deps.workspace.readFile(path);
    const lines = linesFromContent(content);
    const parsed = await parseFile(path, async () => content, deps.workspace.rootDir);
    const environments = await listEnvironments(path);
    const variables = await listVariables(path, [...deps.getState().request.activeEnvironment]);
    const initialLine = firstRequestLine(parsed.regions, lines) ?? 0;

    deps.update((state) => ({
      ...state,
      selectedFilePath: path,
      fileContent: content,
      fileLines: lines,
      dirty: false,
      parseVersion: parsed.version,
      parsedFile: parsed,
      editor: {
        ...state.editor,
        cursor: { line: initialLine, column: 0 },
        selection: null,
        scrollTop: initialLine,
      },
      request: {
        ...state.request,
        error: null,
        result: null,
        environments,
        variables,
      },
      ui: {
        ...state.ui,
        focusPane: "editor",
        statusMessage: null,
      },
    }));
  };

  const refreshWorkspace = async () => {
    const tree = await deps.workspace.refresh();
    deps.update((state) => ({ ...state, fileTree: tree }));
  };

  const saveFile = async () => {
    const state = deps.getState();
    if (!state.selectedFilePath || !state.dirty) {
      return;
    }
    const content = contentFromLines(state.fileLines);
    await deps.workspace.writeFile(state.selectedFilePath, content);
    const version = bumpParseVersion(state.selectedFilePath);
    const parsed = await parseFile(
      state.selectedFilePath,
      async () => content,
      deps.workspace.rootDir,
      version,
    );
    deps.update((s) => ({
      ...s,
      fileContent: content,
      dirty: false,
      parsedFile: parsed,
      ui: { ...s.ui, statusMessage: "Saved" },
    }));
  };

  const runSend = async () => {
    const state = deps.getState();
    if (!state.selectedFilePath) {
      return;
    }

    const cursorLine = state.editor.cursor.line;
    const content = contentFromLines(state.fileLines);
    let parsedFile = state.parsedFile;
    if (!parsedFile || state.dirty) {
      const version = bumpParseVersion(state.selectedFilePath);
      parsedFile = await parseFile(
        state.selectedFilePath,
        async () => content,
        deps.workspace.rootDir,
        version,
      );
      deps.update((s) => ({
        ...s,
        parsedFile,
        parseVersion: parsedFile!.version,
      }));
    }

    const region = resolveActiveRegion(parsedFile, cursorLine);
    if (!region) {
      deps.update((s) => ({
        ...s,
        request: { ...s.request, error: "No request region under cursor" },
        ui: { ...s.ui, focusPane: "response" },
      }));
      return;
    }

    const gen = sendController.beginSend();

    deps.update((s) => ({
      ...s,
      request: { ...s.request, sending: true, error: null, result: null },
      responseEditor: {
        scrollTop: 0,
        scrollLeft: 0,
        cursor: { line: 0, column: 0 },
        selection: null,
        foldedJsonPaths: [],
      },
      resultGeneration: s.resultGeneration + 1,
      ui: { ...s.ui, focusPane: "response", responseTab: "pretty" },
    }));

    await new Promise<void>((resolve) => setImmediate(resolve));

    const result = await sendRegion({
      filePath: state.selectedFilePath,
      regionId: region.id,
      workingDir: deps.workspace.rootDir,
      activeEnvironment: [...state.request.activeEnvironment],
      variables: state.request.variables,
    });

    if (!sendController.isCurrent(gen)) {
      return;
    }

    const variables = await listVariables(state.selectedFilePath, [
      ...deps.getState().request.activeEnvironment,
    ]);

    if (!sendController.isCurrent(gen)) {
      return;
    }

    deps.update((s) => ({
      ...s,
      request: {
        ...s.request,
        sending: false,
        result,
        error: result.error ?? null,
        variables,
      },
    }));
  };

  const focusPane = (pane: FocusPane) => {
    deps.update((state) => ({
      ...state,
      ui: { ...state.ui, focusPane: pane },
    }));
  };

  const execute = (command: CommandId) => {
    const state = deps.getState();

    switch (command) {
      case "request.send":
        void runSend();
        break;
      case "request.cancel":
        if (!state.request.sending) {
          break;
        }
        sendController.cancelSend();
        deps.update((s) => ({
          ...s,
          request: {
            ...s.request,
            sending: false,
            error: "Request cancelled",
            result: null,
          },
          ui: { ...s.ui, statusMessage: "Request cancelled" },
        }));
        break;
      case "pane.focusNext":
        focusPane(nextPane(state.ui.focusPane));
        break;
      case "pane.focusPrev":
        focusPane(prevPane(state.ui.focusPane));
        break;
      case "pane.focusFiles":
        focusPane("files");
        break;
      case "pane.focusEditor":
        focusPane("editor");
        break;
      case "pane.focusResponse":
        focusPane("response");
        break;
      case "sidebar.toggle":
        deps.update((s) => ({
          ...s,
          ui: { ...s.ui, sidebarVisible: !s.ui.sidebarVisible },
        }));
        break;
      case "file.save":
        void saveFile();
        break;
      case "env.switcher":
        deps.update((s) => ({
          ...s,
          ui: {
            ...s.ui,
            overlay: s.ui.overlay === "env" ? "none" : "env",
            envSelectedIndex: Math.max(
              0,
              s.request.environments.indexOf(s.request.activeEnvironment.join(",")) || 0,
            ),
          },
        }));
        break;
      case "env.selectNext":
        if (state.ui.overlay === "env") {
          deps.update((s) => ({
            ...s,
            ui: {
              ...s.ui,
              envSelectedIndex: Math.min(
                s.request.environments.length,
                s.ui.envSelectedIndex + 1,
              ),
            },
          }));
        }
        break;
      case "env.selectPrev":
        if (state.ui.overlay === "env") {
          deps.update((s) => ({
            ...s,
            ui: {
              ...s.ui,
              envSelectedIndex: Math.max(0, s.ui.envSelectedIndex - 1),
            },
          }));
        }
        break;
      case "env.apply": {
        const envName = state.request.environments[state.ui.envSelectedIndex];
        void (async () => {
          const activeEnvironment = envName ? [envName] : [];
          const variables = state.selectedFilePath
            ? await listVariables(state.selectedFilePath, activeEnvironment)
            : {};
          deps.update((s) => ({
            ...s,
            request: { ...s.request, activeEnvironment, variables },
            ui: { ...s.ui, overlay: "none" },
          }));
        })();
        break;
      }
      case "overlay.close":
        deps.update((s) => ({
          ...s,
          ui: {
            ...s.ui,
            overlay: "none",
            commandPalette: { ...s.ui.commandPalette, open: false },
            pendingPrompt: null,
          },
        }));
        resolvePrompt(undefined);
        break;
      case "app.quit":
        deps.quit();
        break;
      case "palette.commands":
        deps.update((s) => ({
          ...s,
          ui: {
            ...s.ui,
            overlay: "commandPalette",
            commandPalette: { open: true, query: "", selectedIndex: 0 },
          },
        }));
        break;
      case "palette.files": {
        const files = flattenFiles(state.fileTree).filter((node) => node.kind === "file");
        const first = files[0]?.path;
        if (first) {
          void openFile(first);
        }
        break;
      }
      case "help.show":
        deps.update((s) => ({
          ...s,
          ui: { ...s.ui, overlay: s.ui.overlay === "help" ? "none" : "help" },
        }));
        break;
      case "keybindings.show":
        deps.update((s) => ({
          ...s,
          ui: {
            ...s.ui,
            overlay: s.ui.overlay === "keybindings" ? "none" : "keybindings",
          },
        }));
        break;
      case "pane.zoom":
        deps.update((s) => ({
          ...s,
          ui: {
            ...s.ui,
            zoomPane: s.ui.zoomPane ? null : s.ui.focusPane,
          },
        }));
        break;
      case "response.tab.next":
        deps.update((s) => ({
          ...s,
          ui: { ...s.ui, responseTab: nextResponseTab(s.ui.responseTab) },
        }));
        break;
      case "response.tab.prev":
        deps.update((s) => ({
          ...s,
          ui: { ...s.ui, responseTab: prevResponseTab(s.ui.responseTab) },
        }));
        break;
      case "response.copy":
        deps.update((s) => ({
          ...s,
          ui: { ...s.ui, statusMessage: "Copy requested (see clipboard handler)" },
        }));
        break;
      case "response.search":
        deps.update((s) => ({
          ...s,
          ui: { ...s.ui, focusPane: "response", responseTab: "pretty" },
        }));
        break;
      case "response.jsonFoldToggle": {
        const result = state.request.result;
        if (!result || state.ui.responseTab !== "pretty") {
          break;
        }
        const text = prettyJsonIfPossible(result.prettyBody || result.body);
        const foldedJsonPaths = toggleJsonFoldAtLine(
          text,
          state.responseEditor.foldedJsonPaths,
          state.responseEditor.cursor.line,
        );
        if (foldedJsonPaths === state.responseEditor.foldedJsonPaths) {
          deps.update((s) => ({
            ...s,
            ui: { ...s.ui, statusMessage: "No foldable JSON node" },
          }));
          break;
        }
        const visibleLineCount = buildFoldableJsonView(text, foldedJsonPaths).lines.length;
        deps.update((s) => ({
          ...s,
          responseEditor: {
            ...s.responseEditor,
            foldedJsonPaths,
            cursor: {
              ...s.responseEditor.cursor,
              line: Math.min(s.responseEditor.cursor.line, Math.max(0, visibleLineCount - 1)),
            },
          },
          ui: { ...s.ui, focusPane: "response", statusMessage: "JSON fold toggled" },
        }));
        break;
      }
      case "response.jsonUnfoldAll":
        deps.update((s) => ({
          ...s,
          responseEditor: { ...s.responseEditor, foldedJsonPaths: [] },
          ui: { ...s.ui, focusPane: "response", statusMessage: "JSON unfolded" },
        }));
        break;
      case "editor.searchNext":
        break;
      default:
        break;
    }
  };

  const context: CommandContext & { execute: (command: CommandId) => void } = {
    get state() {
      return deps.getState();
    },
    update: deps.update,
    runSend,
    openFile,
    saveFile,
    refreshWorkspace,
    reloadKeybindings: deps.reloadKeybindings,
    quit: deps.quit,
    execute,
  };

  return context;
}

export type CommandBus = CommandContext & { execute: (command: CommandId) => void };

export { createInitialState };
