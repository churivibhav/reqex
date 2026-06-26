import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFoldableJsonView, toggleJsonFoldAtLine } from "../src/utils/json-folding.js";

describe("buildFoldableJsonView", () => {
  it("renders JSON unchanged when nothing is folded", () => {
    const view = buildFoldableJsonView('{"user":{"id":1,"name":"Ada"},"ok":true}', []);

    assert.deepEqual(view.lines, [
      "{",
      '  "user": {',
      '    "id": 1,',
      '    "name": "Ada"',
      "  },",
      '  "ok": true',
      "}",
    ]);
  });

  it("collapses folded object paths", () => {
    const view = buildFoldableJsonView('{"user":{"id":1,"name":"Ada"},"ok":true}', ["/user"]);

    assert.deepEqual(view.lines, ["{", '  "user": { ... 2 properties },', '  "ok": true', "}"]);
  });
});

describe("toggleJsonFoldAtLine", () => {
  it("folds and unfolds the JSON node at the visible line", () => {
    const text = '{"user":{"id":1,"name":"Ada"},"ok":true}';

    const folded = toggleJsonFoldAtLine(text, [], 1);
    assert.deepEqual(folded, ["/user"]);

    const unfolded = toggleJsonFoldAtLine(text, folded, 1);
    assert.deepEqual(unfolded, []);
  });
});
