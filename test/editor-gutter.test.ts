import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITOR_GUTTER_WIDTH,
  editorCursorFromSource,
  prefixEditorLines,
  sourceCursorFromEditor,
  sourceCursorFromEditorPoint,
  sourceSelectionFromEditor,
  stripEditorLines,
} from "../src/ui/editor-gutter.js";

test("prefixEditorLines adds active gutter only for active region lines", () => {
  const lines = ["@base = 1", "### Users", "GET /users", "Accept: json", "### Posts", "POST /posts"];
  const prefixed = prefixEditorLines(lines, { startLine: 2, endLine: 3 });

  assert.equal(prefixed[0]?.[0], " ");
  assert.equal(prefixed[1]?.[0], " ");
  assert.equal(prefixed[2]?.[0], "▎");
  assert.equal(prefixed[2]?.slice(EDITOR_GUTTER_WIDTH), "GET /users");
  assert.equal(prefixed[3]?.[0], "▎");
  assert.equal(prefixed[4]?.[0], " ");
  assert.equal(prefixed[5]?.[0], " ");
});

test("stripEditorLines removes gutter column", () => {
  const lines = [" GET /users", "▎Accept: json"];
  assert.deepEqual(stripEditorLines(lines), ["GET /users", "Accept: json"]);
});

test("cursor mapping round-trips source coordinates", () => {
  const source = { line: 4, column: 3 };
  const editor = editorCursorFromSource(source);
  assert.deepEqual(editor, { line: 4, column: 4 });
  assert.deepEqual(sourceCursorFromEditor(editor), source);
});

test("sourceCursorFromEditor clamps gutter column to zero", () => {
  assert.deepEqual(sourceCursorFromEditor({ line: 2, column: 0 }), { line: 2, column: 0 });
});

test("sourceSelectionFromEditor maps both endpoints", () => {
  const selection = sourceSelectionFromEditor({
    anchor: { line: 1, column: 2 },
    active: { line: 1, column: 6 },
  });
  assert.deepEqual(selection, {
    anchor: { line: 1, column: 1 },
    active: { line: 1, column: 5 },
  });
});

test("sourceCursorFromEditorPoint maps editor viewport clicks to source coordinates", () => {
  const cursor = sourceCursorFromEditorPoint({
    x: 7,
    y: 4,
    rect: { x: 2, y: 3, w: 20, h: 5 },
    lines: ["GET /users", "Header: value"],
    scrollTop: 0,
    scrollLeft: 0,
  });

  assert.deepEqual(cursor, { line: 1, column: 2 });
});

test("sourceCursorFromEditorPoint treats line numbers and gutter as source column zero", () => {
  assert.deepEqual(
    sourceCursorFromEditorPoint({
      x: 3,
      y: 3,
      rect: { x: 2, y: 3, w: 20, h: 5 },
      lines: ["GET /users"],
      scrollTop: 0,
      scrollLeft: 0,
    }),
    { line: 0, column: 0 },
  );
});

test("sourceCursorFromEditorPoint returns null outside editor bounds", () => {
  assert.equal(
    sourceCursorFromEditorPoint({
      x: 1,
      y: 3,
      rect: { x: 2, y: 3, w: 20, h: 5 },
      lines: ["GET /users"],
      scrollTop: 0,
      scrollLeft: 0,
    }),
    null,
  );
});
