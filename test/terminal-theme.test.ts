import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import {
  detectTerminalThemeMode,
  parseOsc11BackgroundColor,
  resolveThemeMode,
  themeModeForBackgroundColor,
  themeModeFromColorFgbg,
} from "../src/utils/terminal-theme.js";

describe("parseOsc11BackgroundColor", () => {
  it("parses 16-bit rgb responses", () => {
    const color = parseOsc11BackgroundColor("\x1b]11;rgb:ffff/ffff/ffff\x07");
    assert.deepEqual(color, { red: 255, green: 255, blue: 255 });
  });

  it("parses hex responses", () => {
    const color = parseOsc11BackgroundColor("\x1b]11;#000000\x07");
    assert.deepEqual(color, { red: 0, green: 0, blue: 0 });
  });
});

describe("themeModeForBackgroundColor", () => {
  it("classifies white as light", () => {
    assert.equal(themeModeForBackgroundColor({ red: 255, green: 255, blue: 255 }), "light");
  });

  it("classifies black as dark", () => {
    assert.equal(themeModeForBackgroundColor({ red: 0, green: 0, blue: 0 }), "dark");
  });
});

describe("themeModeFromColorFgbg", () => {
  it("returns null when unset", () => {
    const original = process.env.COLORFGBG;
    delete process.env.COLORFGBG;
    assert.equal(themeModeFromColorFgbg(), null);
    if (original === undefined) {
      delete process.env.COLORFGBG;
    } else {
      process.env.COLORFGBG = original;
    }
  });

  it("uses the background component", () => {
    const original = process.env.COLORFGBG;
    process.env.COLORFGBG = "0;15";
    assert.equal(themeModeFromColorFgbg(), "light");
    if (original === undefined) {
      delete process.env.COLORFGBG;
    } else {
      process.env.COLORFGBG = original;
    }
  });
});

describe("resolveThemeMode", () => {
  it("returns explicit light without probing", async () => {
    assert.equal(await resolveThemeMode("light"), "light");
  });

  it("returns explicit dark without probing", async () => {
    assert.equal(await resolveThemeMode("dark"), "dark");
  });

  it("detects theme from OSC 11 response", async () => {
    const input = new EventEmitter() as EventEmitter & {
      isTTY: boolean;
      isRaw?: boolean;
      setRawMode?: (mode: boolean) => void;
    };
    const output = {
      isTTY: true,
      write: () => {
        queueMicrotask(() => {
          input.emit("data", "\x1b]11;rgb:0000/0000/0000\x07");
        });
        return true;
      },
    };

    input.isTTY = true;
    input.setRawMode = (mode: boolean) => {
      input.isRaw = mode;
    };

    assert.equal(
      await detectTerminalThemeMode({
        input,
        output,
      }),
      "dark",
    );
  });

  it("falls back to COLORFGBG for auto mode", async () => {
    const original = process.env.COLORFGBG;
    process.env.COLORFGBG = "15;0";
    assert.equal(await resolveThemeMode("auto", { allowProbe: false }), "dark");
    if (original === undefined) {
      delete process.env.COLORFGBG;
    } else {
      process.env.COLORFGBG = original;
    }
  });

  it("uses fallbackMode when auto probe is disabled", async () => {
    assert.equal(
      await resolveThemeMode("auto", { allowProbe: false, fallbackMode: "light" }),
      "light",
    );
  });
});
