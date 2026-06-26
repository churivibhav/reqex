import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  envNameFromSelectedIndex,
  envSelectedIndexFromActive,
} from "../src/state/commands.js";

describe("env selection helpers", () => {
  const environments = ["dev", "staging", "prod"] as const;

  it("maps selected index 0 to no environment", () => {
    assert.equal(envNameFromSelectedIndex(environments, 0), undefined);
  });

  it("maps selected index to environment name with offset", () => {
    assert.equal(envNameFromSelectedIndex(environments, 1), "dev");
    assert.equal(envNameFromSelectedIndex(environments, 2), "staging");
    assert.equal(envNameFromSelectedIndex(environments, 3), "prod");
  });

  it("initializes selected index from active environment", () => {
    assert.equal(envSelectedIndexFromActive(environments, []), 0);
    assert.equal(envSelectedIndexFromActive(environments, ["dev"]), 1);
    assert.equal(envSelectedIndexFromActive(environments, ["staging"]), 2);
    assert.equal(envSelectedIndexFromActive(environments, ["prod"]), 3);
  });

  it("falls back to none when active environment is unknown", () => {
    assert.equal(envSelectedIndexFromActive(environments, ["qa"]), 0);
  });
});
