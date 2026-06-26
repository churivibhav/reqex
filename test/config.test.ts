import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { loadConfig } from "../src/config/config.js";

describe("loadConfig", () => {
  let tempDir: string;
  let originalConfigDir: string | undefined;
  let originalThemeEnv: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reqex-config-"));
    originalConfigDir = process.env.REQEX_CONFIG_DIR;
    originalThemeEnv = process.env.REQEX_THEME;
    process.env.REQEX_CONFIG_DIR = tempDir;
    delete process.env.REQEX_THEME;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.REQEX_CONFIG_DIR;
    } else {
      process.env.REQEX_CONFIG_DIR = originalConfigDir;
    }
    if (originalThemeEnv === undefined) {
      delete process.env.REQEX_THEME;
    } else {
      process.env.REQEX_THEME = originalThemeEnv;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("defaults to auto theme", () => {
    assert.deepEqual(loadConfig("/tmp/workspace"), { theme: "auto" });
  });

  it("reads user config theme", () => {
    fs.writeFileSync(path.join(tempDir, "config.json"), JSON.stringify({ theme: "light" }));
    assert.deepEqual(loadConfig("/tmp/workspace"), { theme: "light" });
  });

  it("prefers project config over user config", () => {
    fs.writeFileSync(path.join(tempDir, "config.json"), JSON.stringify({ theme: "light" }));
    const projectDir = path.join(tempDir, "project", ".reqex");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "config.json"), JSON.stringify({ theme: "dark" }));
    assert.deepEqual(loadConfig(path.join(tempDir, "project")), { theme: "dark" });
  });

  it("prefers REQEX_THEME env over config files", () => {
    fs.writeFileSync(path.join(tempDir, "config.json"), JSON.stringify({ theme: "light" }));
    process.env.REQEX_THEME = "dark";
    assert.deepEqual(loadConfig("/tmp/workspace"), { theme: "dark" });
  });
});
