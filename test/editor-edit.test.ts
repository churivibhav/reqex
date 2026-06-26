import assert from "node:assert/strict";
import test from "node:test";

import { pasteIntoEditor } from "../src/state/editor-edit.js";

test("pasteIntoEditor inserts text at cursor", () => {
  const result = pasteIntoEditor({
    lines: ["GET /users"],
    cursor: { line: 0, column: 4 },
    selection: null,
    text: "https://example.com",
  });

  assert.deepEqual(result, {
    lines: ["GET https://example.com/users"],
    cursor: { line: 0, column: 23 },
    selection: null,
  });
});

test("pasteIntoEditor replaces a selection", () => {
  const result = pasteIntoEditor({
    lines: ["GET /users"],
    cursor: { line: 0, column: 10 },
    selection: {
      anchor: { line: 0, column: 4 },
      active: { line: 0, column: 10 },
    },
    text: "/posts",
  });

  assert.deepEqual(result, {
    lines: ["GET /posts"],
    cursor: { line: 0, column: 10 },
    selection: null,
  });
});

test("pasteIntoEditor normalizes multiline clipboard text", () => {
  const result = pasteIntoEditor({
    lines: ["POST /users", ""],
    cursor: { line: 1, column: 0 },
    selection: null,
    text: "{\r\n  \"name\": \"Ada\"\r\n}",
  });

  assert.deepEqual(result, {
    lines: ["POST /users", "{", "  \"name\": \"Ada\"", "}"],
    cursor: { line: 3, column: 1 },
    selection: null,
  });
});
