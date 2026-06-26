import type { ParsedFile, RequestRegion } from "./types.js";

/** Resolve the innermost request region containing a 0-based editor line. */
export function resolveRegionAtLine(
  regions: readonly RequestRegion[],
  line: number,
): RequestRegion | null {
  const candidates = regions.filter(
    (region) =>
      region.hasRequest &&
      !region.isGlobal &&
      region.startLine <= line &&
      line <= region.endLine,
  );

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, current) => {
    const bestSpan = best.endLine - best.startLine;
    const currentSpan = current.endLine - current.startLine;
    if (currentSpan < bestSpan) {
      return current;
    }
    if (currentSpan === bestSpan && current.startLine > best.startLine) {
      return current;
    }
    return best;
  });
}

export function regionContainsLine(region: RequestRegion, line: number): boolean {
  return line >= region.startLine && line <= region.endLine;
}

/** Active request region under the editor cursor. */
export function resolveActiveRegion(
  parsedFile: ParsedFile | null,
  cursorLine: number,
): RequestRegion | null {
  if (!parsedFile) {
    return null;
  }
  return resolveRegionAtLine(parsedFile.regions, cursorLine);
}

const HTTP_METHOD_PREFIX =
  /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE|GRAPHQL)\b/u;

/** First HTTP method line in the file, for initial editor placement. */
export function firstRequestLine(
  regions: readonly RequestRegion[],
  fileLines: readonly string[],
): number | null {
  const firstRegion = regions.find((region) => region.hasRequest && !region.isGlobal);
  if (!firstRegion) {
    return null;
  }

  for (let line = firstRegion.startLine; line <= firstRegion.endLine; line++) {
    if (HTTP_METHOD_PREFIX.test(fileLines[line] ?? "")) {
      return line;
    }
  }

  return firstRegion.startLine;
}

function markerColumnAfterMethod(line: string): number {
  const match = HTTP_METHOD_PREFIX.exec(line);
  return match ? match[0].length : 0;
}

export function buildRegionDiagnostics(
  regions: readonly RequestRegion[],
  activeRegionId: string | null,
  fileLines: readonly string[],
): ReadonlyArray<{
  line: number;
  startColumn: number;
  endColumn: number;
  severity: "info" | "hint";
  message?: string;
}> {
  const markers: Array<{
    line: number;
    startColumn: number;
    endColumn: number;
    severity: "info" | "hint";
    message?: string;
  }> = [];

  for (const region of regions) {
    if (!region.hasRequest || region.isGlobal) {
      continue;
    }
    const isActive = region.id === activeRegionId;
    const line = fileLines[region.startLine] ?? "";
    const markerCol = markerColumnAfterMethod(line);
    markers.push({
      line: region.startLine,
      startColumn: markerCol,
      endColumn: markerCol + 1,
      severity: isActive ? "hint" : "info",
      message: `${region.method ?? "REQ"} ${region.name}`,
    });
  }

  return markers;
}
