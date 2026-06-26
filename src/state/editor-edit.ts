import type { CursorPosition, EditorSelection } from "@rezi-ui/core";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampCursor(lines: readonly string[], cursor: CursorPosition): CursorPosition {
  const lineCount = Math.max(1, lines.length);
  const line = clamp(cursor.line, 0, lineCount - 1);
  const text = lines[line] ?? "";
  return { line, column: clamp(cursor.column, 0, text.length) };
}

function normalizeSelection(selection: EditorSelection): readonly [CursorPosition, CursorPosition] {
  const { anchor, active } = selection;
  if (anchor.line < active.line || (anchor.line === active.line && anchor.column <= active.column)) {
    return [anchor, active];
  }
  return [active, anchor];
}

function deleteSelection(
  lines: readonly string[],
  selection: EditorSelection,
): Readonly<{ lines: readonly string[]; cursor: CursorPosition }> {
  const nextLines = [...lines];
  if (nextLines.length === 0) {
    nextLines.push("");
  }

  const [rawStart, rawEnd] = normalizeSelection(selection);
  const start = clampCursor(nextLines, rawStart);
  const end = clampCursor(nextLines, rawEnd);
  const startLine = nextLines[start.line] ?? "";
  const endLine = nextLines[end.line] ?? "";

  if (start.line === end.line) {
    nextLines[start.line] = startLine.slice(0, start.column) + startLine.slice(end.column);
    return { lines: nextLines, cursor: start };
  }

  nextLines.splice(
    start.line,
    end.line - start.line + 1,
    startLine.slice(0, start.column) + endLine.slice(end.column),
  );
  return { lines: nextLines, cursor: start };
}

function insertText(
  lines: readonly string[],
  cursor: CursorPosition,
  text: string,
): Readonly<{ lines: readonly string[]; cursor: CursorPosition }> {
  const nextLines = [...lines];
  if (nextLines.length === 0) {
    nextLines.push("");
  }

  const safeCursor = clampCursor(nextLines, cursor);
  const currentLine = nextLines[safeCursor.line] ?? "";
  const before = currentLine.slice(0, safeCursor.column);
  const after = currentLine.slice(safeCursor.column);
  const insertLines = text.replace(/\r\n?/gu, "\n").split("\n");

  if (insertLines.length === 1) {
    const inserted = insertLines[0] ?? "";
    nextLines[safeCursor.line] = before + inserted + after;
    return {
      lines: nextLines,
      cursor: { line: safeCursor.line, column: safeCursor.column + inserted.length },
    };
  }

  const first = before + (insertLines[0] ?? "");
  const lastInsert = insertLines[insertLines.length - 1] ?? "";
  const last = lastInsert + after;
  nextLines.splice(safeCursor.line, 1, first, ...insertLines.slice(1, -1), last);

  return {
    lines: nextLines,
    cursor: {
      line: safeCursor.line + insertLines.length - 1,
      column: lastInsert.length,
    },
  };
}

export function pasteIntoEditor(args: Readonly<{
  lines: readonly string[];
  cursor: CursorPosition;
  selection: EditorSelection | null;
  text: string;
}>): Readonly<{ lines: readonly string[]; cursor: CursorPosition; selection: null }> {
  const base = args.selection
    ? deleteSelection(args.lines, args.selection)
    : { lines: args.lines, cursor: args.cursor };
  const next = insertText(base.lines, base.cursor, args.text);
  return { ...next, selection: null };
}
