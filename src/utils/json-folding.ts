export type FoldableJsonView = Readonly<{
  lines: readonly string[];
  lineToFoldPath: readonly (string | null)[];
}>;

const INDENT = 2;

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/gu, "~0").replace(/\//gu, "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function primitiveToJson(value: unknown): string {
  return JSON.stringify(value);
}

function summarizeFolded(value: unknown): string {
  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  }
  if (isRecord(value)) {
    const count = Object.keys(value).length;
    return `${count} ${count === 1 ? "property" : "properties"}`;
  }
  return "";
}

function renderValue(args: {
  value: unknown;
  path: string;
  parentPath: string | null;
  key?: string;
  indent: number;
  isLast: boolean;
  foldedPaths: ReadonlySet<string>;
  lines: string[];
  lineToFoldPath: Array<string | null>;
}): void {
  const { value, path, parentPath, key, indent, isLast, foldedPaths, lines, lineToFoldPath } = args;
  const leading = " ".repeat(indent);
  const keyPrefix = key === undefined ? "" : `${JSON.stringify(key)}: `;
  const comma = isLast ? "" : ",";

  if (Array.isArray(value) || isRecord(value)) {
    const isArray = Array.isArray(value);
    const open = isArray ? "[" : "{";
    const close = isArray ? "]" : "}";
    const entries = isArray ? value.map((item, index) => [String(index), item] as const) : Object.entries(value);

    if (entries.length === 0) {
      lines.push(`${leading}${keyPrefix}${open}${close}${comma}`);
      lineToFoldPath.push(parentPath);
      return;
    }

    if (foldedPaths.has(path)) {
      lines.push(`${leading}${keyPrefix}${open} ... ${summarizeFolded(value)} ${close}${comma}`);
      lineToFoldPath.push(path);
      return;
    }

    lines.push(`${leading}${keyPrefix}${open}`);
    lineToFoldPath.push(path);

    entries.forEach(([entryKey, entryValue], index) => {
      const childPath = `${path}/${escapeJsonPointerSegment(entryKey)}`;
      renderValue({
        value: entryValue,
        path: childPath,
        parentPath: path,
        key: isArray ? undefined : entryKey,
        indent: indent + INDENT,
        isLast: index === entries.length - 1,
        foldedPaths,
        lines,
        lineToFoldPath,
      });
    });

    lines.push(`${leading}${close}${comma}`);
    lineToFoldPath.push(path);
    return;
  }

  lines.push(`${leading}${keyPrefix}${primitiveToJson(value)}${comma}`);
  lineToFoldPath.push(parentPath);
}

export function buildFoldableJsonView(
  text: string,
  foldedPaths: readonly string[],
): FoldableJsonView {
  try {
    const value = JSON.parse(text.trim()) as unknown;
    const lines: string[] = [];
    const lineToFoldPath: Array<string | null> = [];
    renderValue({
      value,
      path: "",
      parentPath: null,
      indent: 0,
      isLast: true,
      foldedPaths: new Set(foldedPaths),
      lines,
      lineToFoldPath,
    });
    return { lines, lineToFoldPath };
  } catch {
    return { lines: text.split("\n"), lineToFoldPath: text.split("\n").map(() => null) };
  }
}

export function toggleJsonFoldAtLine(
  text: string,
  foldedPaths: readonly string[],
  line: number,
): readonly string[] {
  const view = buildFoldableJsonView(text, foldedPaths);
  const path = view.lineToFoldPath[line] ?? null;
  if (path === null) {
    return foldedPaths;
  }

  const next = new Set(foldedPaths);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  return [...next].sort();
}
