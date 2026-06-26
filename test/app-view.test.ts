import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ViewDeps } from "../src/ui/app-view.js";
import { renderApp } from "../src/ui/app-view.js";
import { colorsForMode } from "../src/ui/theme-colors.js";
import { createInitialState, type AppState } from "../src/state/types.js";

const noopDeps: ViewDeps = {
  onEditorChange: () => {},
  onEditorSelection: () => {},
  onEditorScroll: () => {},
  onTreeSelect: () => {},
  onTreeToggle: () => {},
  onTreePress: () => {},
  onResponseTab: () => {},
  onResponseScroll: () => {},
  onResponseSelection: () => {},
  onResponseChange: () => {},
  onResponseJsonFoldToggle: () => {},
  onResponseJsonUnfoldAll: () => {},
  onSplitChange: () => {},
  onCommandPaletteChange: () => {},
  onCommandPaletteSelect: () => {},
  onCommandPaletteSelectionChange: () => {},
  onOverlayClose: () => {},
  onEnvSelect: () => {},
  onResponseSearch: () => {},
  onCommand: () => {},
};

function stateWithThemeMode(themeMode: AppState["settings"]["themeMode"]): AppState {
  const state = createInitialState("/tmp/workspace");
  return {
    ...state,
    settings: {
      ...state.settings,
      themeMode,
    },
  };
}

function collectNodes(node: unknown): Array<{ kind?: string; props?: Record<string, unknown> }> {
  if (!node || typeof node !== "object") {
    return [];
  }
  const current = node as {
    kind?: string;
    props?: Record<string, unknown>;
    children?: unknown[];
  };
  const props = current.props ?? {};
  return [
    current,
    ...Object.values(props).flatMap((value) =>
      Array.isArray(value) ? value.flatMap(collectNodes) : collectNodes(value),
    ),
    ...(current.children ?? []).flatMap(collectNodes),
  ];
}

function statusButton(view: unknown, id: string) {
  return collectNodes(view).find((node) => node.kind === "button" && node.props?.id === id);
}

describe("renderApp", () => {
  it("uses the terminal theme background for the app canvas", () => {
    const light = renderApp(stateWithThemeMode("light"), noopDeps);
    const dark = renderApp(stateWithThemeMode("dark"), noopDeps);

    assert.equal(light.kind, "column");
    assert.equal(dark.kind, "column");
    assert.equal(light.props.style?.bg, colorsForMode("light").bgBase);
    assert.equal(dark.props.style?.bg, colorsForMode("dark").bgBase);
    assert.notEqual(light.props.style?.bg, dark.props.style?.bg);
  });

  it("renders clickable footer actions with F1 last", () => {
    const state = createInitialState("/tmp/workspace");
    const view = renderApp({
      ...state,
      settings: {
        ...state.settings,
        keybindings: {
          F5: "request.send",
          "ctrl+x": "request.cancel",
          F1: "help.show",
        },
      },
    }, noopDeps);

    const send = statusButton(view, "status-request.send");
    const help = statusButton(view, "status-help.show");
    const buttons = collectNodes(view).filter((node) => node.kind === "button");
    assert.equal(send?.props?.label, "F5 Send");
    assert.equal(help?.props?.label, "F1 Help");
    assert.equal(buttons.at(-1)?.props?.id, "status-help.show");
    assert.equal(typeof send?.props?.onPress, "function");
  });

  it("keeps send and cancel in the same footer slot", () => {
    const state = createInitialState("/tmp/workspace");
    const base = {
      ...state,
      settings: {
        ...state.settings,
        keybindings: {
          F5: "request.send",
          "ctrl+x": "request.cancel",
          F1: "help.show",
        },
      },
    };

    const ready = renderApp(base, noopDeps);
    const sending = renderApp({
      ...base,
      request: { ...base.request, sending: true },
    }, noopDeps);

    assert.equal(statusButton(ready, "status-request.send")?.props?.label, "F5 Send");
    assert.equal(
      statusButton(sending, "status-request.cancel")?.props?.label,
      "Ctrl+X Cancel",
    );
  });
});
