import type { RequestRegion } from "./types.js";

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

export function buildRegionDiagnostics(
  regions: readonly RequestRegion[],
  activeRegionId: string | null,
): ReadonlyArray<{
  line: number;
  startColumn: number;
  endColumn: number;
  severity: "info";
  message?: string;
}> {
  const markers: Array<{
    line: number;
    startColumn: number;
    endColumn: number;
    severity: "info";
    message?: string;
  }> = [];

  for (const region of regions) {
    if (!region.hasRequest || region.isGlobal) {
      continue;
    }
    markers.push({
      line: region.startLine,
      startColumn: 0,
      endColumn: 1,
      severity: "info",
      message: `${region.method ?? "REQ"} ${region.name}`,
    });
    if (region.id === activeRegionId) {
      for (let line = region.startLine; line <= region.endLine; line++) {
        markers.push({
          line,
          startColumn: 0,
          endColumn: 200,
          severity: "info",
        });
      }
    }
  }

  return markers;
}
