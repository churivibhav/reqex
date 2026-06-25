import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRegionDiagnostics,
  regionContainsLine,
  resolveRegionAtLine,
} from "../src/engine/region-resolver.js";
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

test("buildRegionDiagnostics uses narrow gutter markers only", () => {
  const lines = [
    "",
    "GET https://example.com/users",
    "",
    "",
    "POST https://example.com/users",
  ];
  const markers = buildRegionDiagnostics(regions, "b", lines);
  assert.ok(markers.length >= 2);
  for (const marker of markers) {
    assert.ok(marker.endColumn - marker.startColumn <= 2);
  }
});

test("buildRegionDiagnostics places markers after HTTP method", () => {
  const lines = [
    "",
    "GET https://example.com/users",
    "",
    "",
    "POST https://example.com/users",
  ];
  const markers = buildRegionDiagnostics(regions, "a", lines);
  const getMarker = markers.find((marker) => marker.line === 1);
  assert.ok(getMarker);
  assert.equal(getMarker.startColumn, 3);
  assert.equal(getMarker.endColumn, 4);

  const postMarker = markers.find((marker) => marker.line === 4);
  assert.ok(postMarker);
  assert.equal(postMarker.startColumn, 4);
  assert.equal(postMarker.endColumn, 5);
});
