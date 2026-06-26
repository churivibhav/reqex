import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildKeybindingsViewLines,
  formatKeyChord,
  loadKeybindings,
} from "../src/config/keybindings.js";
import { createSendController } from "../src/state/send-controller.js";

describe("formatKeyChord", () => {
  it("formats modifier chords", () => {
    assert.equal(formatKeyChord("ctrl+shift+p"), "Ctrl+Shift+P");
    assert.equal(formatKeyChord("ctrl+/"), "Ctrl+/");
    assert.equal(formatKeyChord("ctrl+q"), "Ctrl+Q");
  });

  it("formats function keys and single keys", () => {
    assert.equal(formatKeyChord("F5"), "F5");
    assert.equal(formatKeyChord("z"), "Z");
    assert.equal(formatKeyChord("?"), "?");
    assert.equal(formatKeyChord("escape"), "Esc");
  });
});

describe("buildKeybindingsViewLines", () => {
  it("groups multiple keys for the same command", () => {
    const lines = buildKeybindingsViewLines({
      F5: "request.send",
      "ctrl+enter": "request.send",
      "ctrl+q": "app.quit",
    });

    const sendLine = lines.find((line) => line.includes("Send request"));
    assert.ok(sendLine);
    assert.match(sendLine!, /F5/);
    assert.match(sendLine!, /Ctrl\+Enter/);
  });

  it("includes new default bindings", () => {
    const { bindings } = loadKeybindings("/tmp");
    const lines = buildKeybindingsViewLines(bindings);

    assert.ok(lines.some((line) => line.includes("Quit") && line.includes("Ctrl+Q")));
    assert.ok(lines.some((line) => line.includes("Cancel request") && line.includes("Ctrl+X")));
    assert.ok(
      lines.some((line) => line.includes("Show keybindings") && line.includes("Ctrl+/")),
    );
    assert.ok(
      lines.some((line) => line.includes("Fold/unfold JSON node") && line.includes("Ctrl+[")),
    );
    assert.ok(lines.some((line) => line.includes("Unfold all JSON") && line.includes("Ctrl+]")));
    assert.equal(bindings.F1, "help.show");
    assert.equal(bindings["?"], undefined);
  });

  it("truncates when maxLines is exceeded", () => {
    const lines = buildKeybindingsViewLines(
      {
        a: "app.quit",
        b: "file.save",
        c: "help.show",
      },
      2,
    );

    assert.equal(lines.length, 2);
    assert.match(lines[1]!, /more/);
  });
});

describe("createSendController", () => {
  it("invalidates in-flight sends on cancel", () => {
    const controller = createSendController();
    const gen = controller.beginSend();
    assert.ok(controller.isCurrent(gen));

    controller.cancelSend();
    assert.equal(controller.isCurrent(gen), false);
  });

  it("starts a new generation on each send", () => {
    const controller = createSendController();
    const first = controller.beginSend();
    const second = controller.beginSend();

    assert.notEqual(first, second);
    assert.equal(controller.isCurrent(first), false);
    assert.ok(controller.isCurrent(second));
  });
});
