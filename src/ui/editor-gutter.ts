import type {
  CodeEditorLineTokenizer,
  CodeEditorSyntaxToken,
  CodeEditorSyntaxTokenKind,
  CursorPosition,
  EditorSelection,
} from "@rezi-ui/core";

import type { RequestRegion } from "../engine/types.js";
import { tokenizeHttpLine } from "../utils/http-syntax.js";

export const EDITOR_GUTTER_WIDTH = 1;

const ACTIVE_GUTTER = "▎";
const INACTIVE_GUTTER = " ";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function gutterTokenKind(
  method: string | undefined,
  highlighted: boolean,
): CodeEditorSyntaxTokenKind {
  if (!highlighted) {
    return "plain";
  }

  switch ((method ?? "GET").toUpperCase()) {
    case "GET":
    case "HEAD":
    case "OPTIONS":
      return "string";
    case "POST":
    case "PUT":
    case "PATCH":
      return "type";
    case "DELETE":
      return "operator";
    default:
      return "keyword";
  }
}

export function prefixEditorLines(
  lines: readonly string[],
  activeRegion: Pick<RequestRegion, "startLine" | "endLine"> | null,
): string[] {
  return lines.map((line, index) => {
    const highlighted =
      activeRegion !== null &&
      index >= activeRegion.startLine &&
      index <= activeRegion.endLine;
    return `${highlighted ? ACTIVE_GUTTER : INACTIVE_GUTTER}${line}`;
  });
}

export function stripEditorLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.slice(EDITOR_GUTTER_WIDTH));
}

export function editorCursorFromSource(cursor: CursorPosition): CursorPosition {
  return {
    line: cursor.line,
    column: cursor.column + EDITOR_GUTTER_WIDTH,
  };
}

export function sourceCursorFromEditor(cursor: CursorPosition): CursorPosition {
  return {
    line: cursor.line,
    column: Math.max(0, cursor.column - EDITOR_GUTTER_WIDTH),
  };
}

export function sourceCursorFromEditorPoint(args: Readonly<{
  x: number;
  y: number;
  rect: Readonly<{ x: number; y: number; w: number; h: number }>;
  lines: readonly string[];
  scrollTop: number;
  scrollLeft: number;
  lineNumbers?: boolean;
}>): CursorPosition | null {
  const { x, y, rect, lines, scrollTop, scrollLeft } = args;
  if (rect.w <= 0 || rect.h <= 0 || x < rect.x || x >= rect.x + rect.w || y < rect.y || y >= rect.y + rect.h) {
    return null;
  }

  const lineCount = Math.max(1, lines.length);
  const lineNumberWidth = args.lineNumbers === false ? 0 : String(lineCount).length + 1;
  const line = clamp(scrollTop + (y - rect.y), 0, lineCount - 1);
  const lineText = lines[line] ?? "";
  const localTextColumn = x - rect.x - lineNumberWidth;
  const editorColumn = Math.max(0, scrollLeft + localTextColumn);
  const sourceColumn = clamp(editorColumn - EDITOR_GUTTER_WIDTH, 0, lineText.length);

  return { line, column: sourceColumn };
}

export function editorSelectionFromSource(
  selection: EditorSelection | null,
): EditorSelection | null {
  if (!selection) {
    return null;
  }
  return {
    anchor: editorCursorFromSource(selection.anchor),
    active: editorCursorFromSource(selection.active),
  };
}

export function sourceSelectionFromEditor(
  selection: EditorSelection | null,
): EditorSelection | null {
  if (!selection) {
    return null;
  }
  return {
    anchor: sourceCursorFromEditor(selection.anchor),
    active: sourceCursorFromEditor(selection.active),
  };
}

export function createRegionAwareTokenizer(
  activeRegion: RequestRegion | null,
): CodeEditorLineTokenizer {
  return (line, context) => {
    const gutter = line[0] ?? INACTIVE_GUTTER;
    const body = line.slice(EDITOR_GUTTER_WIDTH);
    const highlighted =
      activeRegion !== null &&
      context.lineNumber >= activeRegion.startLine &&
      context.lineNumber <= activeRegion.endLine;

    const tokens: CodeEditorSyntaxToken[] = [
      {
        text: gutter,
        kind: gutterTokenKind(activeRegion?.method, highlighted && gutter !== INACTIVE_GUTTER),
      },
    ];

    if (body.length > 0) {
      tokens.push(...tokenizeHttpLine(body, context));
    }

    return tokens;
  };
}
