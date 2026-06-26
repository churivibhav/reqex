import { routeWheel, type ZrevEvent } from "@rezi-ui/core";

export type ScrollState = Readonly<{
  scrollTop: number;
  scrollLeft: number;
}>;

export type ScrollViewport = Readonly<{
  width: number;
  height: number;
  lineNumbers?: boolean;
}>;

export type ScrollResult = Readonly<{
  scrollTop: number;
  scrollLeft: number;
}>;

function lineNumberWidth(lines: readonly string[], lineNumbers: boolean): number {
  if (!lineNumbers) {
    return 0;
  }
  return String(Math.max(1, lines.length)).length + 1;
}

function maxLineWidth(lines: readonly string[]): number {
  return lines.reduce((max, line) => Math.max(max, line.length), 0);
}

export function resolveWheelScroll(
  event: ZrevEvent,
  state: ScrollState,
  lines: readonly string[],
  viewport: ScrollViewport,
): ScrollResult | null {
  const routed = routeWheel(event, {
    scrollX: state.scrollLeft,
    scrollY: state.scrollTop,
    contentWidth: maxLineWidth(lines),
    contentHeight: Math.max(1, lines.length),
    viewportWidth: Math.max(0, viewport.width - lineNumberWidth(lines, viewport.lineNumbers ?? true)),
    viewportHeight: Math.max(0, viewport.height),
  });

  if (routed.nextScrollX === undefined && routed.nextScrollY === undefined) {
    return null;
  }

  return {
    scrollTop: routed.nextScrollY ?? state.scrollTop,
    scrollLeft: routed.nextScrollX ?? state.scrollLeft,
  };
}
