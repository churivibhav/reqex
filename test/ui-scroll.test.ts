import assert from "node:assert/strict";
import test from "node:test";

import type { ZrevEvent } from "@rezi-ui/core";

import { resolveWheelScroll } from "../src/ui/scroll.js";

function wheelEvent(wheelX: number, wheelY: number): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: 0,
    x: 0,
    y: 0,
    mouseKind: 5,
    mods: 0,
    buttons: 0,
    wheelX,
    wheelY,
  };
}

test("resolveWheelScroll applies vertical and horizontal wheel deltas", () => {
  const next = resolveWheelScroll(
    wheelEvent(1, 2),
    { scrollTop: 0, scrollLeft: 0 },
    ["short", "this line is wider than the viewport", "tail"],
    { width: 12, height: 2 },
  );

  assert.deepEqual(next, { scrollTop: 1, scrollLeft: 3 });
});

test("resolveWheelScroll clamps to content bounds", () => {
  const next = resolveWheelScroll(
    wheelEvent(10, 10),
    { scrollTop: 4, scrollLeft: 25 },
    ["012345678901234567890123456789", "1", "2", "3", "4", "5"],
    { width: 10, height: 3 },
  );

  assert.deepEqual(next, { scrollTop: 3, scrollLeft: 22 });
});

test("resolveWheelScroll returns null when content cannot scroll", () => {
  const next = resolveWheelScroll(
    wheelEvent(1, 1),
    { scrollTop: 0, scrollLeft: 0 },
    ["short"],
    { width: 20, height: 5 },
  );

  assert.equal(next, null);
});
