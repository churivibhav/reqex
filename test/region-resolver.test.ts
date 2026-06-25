import assert from "node:assert/strict";
import test from "node:test";

import { regionContainsLine, resolveRegionAtLine } from "../src/engine/region-resolver.js";
import type { RequestRegion } from "../src/engine/types.js";

const regions: RequestRegion[] = [
  {
    id: "a",
    name: "Get users",
    method: "GET",
    url: "https://example.com/users",
    startLine: 1,
    endLine: 2,
    isGlobal: false,
    hasRequest: true,
  },
  {
    id: "b",
    name: "Create user",
    method: "POST",
    url: "https://example.com/users",
    startLine: 4,
    endLine: 9,
    isGlobal: false,
    hasRequest: true,
  },
  {
    id: "c",
    name: "Global",
    startLine: 0,
    endLine: 20,
    isGlobal: true,
    hasRequest: false,
  },
];

test("resolveRegionAtLine ignores global regions", () => {
  assert.equal(resolveRegionAtLine(regions, 0), null);
});

test("resolveRegionAtLine returns innermost region", () => {
  assert.equal(resolveRegionAtLine(regions, 1)?.id, "a");
  assert.equal(resolveRegionAtLine(regions, 6)?.id, "b");
});

test("regionContainsLine", () => {
  assert.equal(regionContainsLine(regions[1]!, 5), true);
  assert.equal(regionContainsLine(regions[1]!, 10), false);
});
