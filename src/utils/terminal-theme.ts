import process from "node:process";
import { Readable } from "node:stream";

export type ThemeMode = "light" | "dark";

const OSC_11_BACKGROUND_QUERY = "\x1b]11;?\x07";

type RgbColor = Readonly<{ red: number; green: number; blue: number }>;

function parseHexComponent(value: string): number | null {
  const parsed = Number.parseInt(value, 16);
  if (Number.isNaN(parsed)) {
    return null;
  }
  if (value.length <= 2) {
    return parsed;
  }
  return Math.round((parsed * 255) / 65535);
}

export function parseOsc11BackgroundColor(sequence: string): RgbColor | null {
  const rgbMatch =
    /\x1b\]11;rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})(?:\x07|\x1b\\)/iu.exec(
      sequence,
    );
  if (rgbMatch) {
    const red = parseHexComponent(rgbMatch[1] ?? "");
    const green = parseHexComponent(rgbMatch[2] ?? "");
    const blue = parseHexComponent(rgbMatch[3] ?? "");
    if (red === null || green === null || blue === null) {
      return null;
    }
    return { red, green, blue };
  }

  const hexMatch = /\x1b\]11;#([0-9a-f]{6})(?:\x07|\x1b\\)/iu.exec(sequence);
  if (hexMatch) {
    const hex = hexMatch[1] ?? "";
    const red = parseHexComponent(hex.slice(0, 2));
    const green = parseHexComponent(hex.slice(2, 4));
    const blue = parseHexComponent(hex.slice(4, 6));
    if (red === null || green === null || blue === null) {
      return null;
    }
    return { red, green, blue };
  }

  return null;
}

export function themeModeForBackgroundColor({ red, green, blue }: RgbColor): ThemeMode {
  const linear = [red, green, blue].map((component) => {
    const normalized = component / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  return luminance > 0.5 ? "light" : "dark";
}

export function themeModeFromColorFgbg(): ThemeMode | null {
  const colorFgbg = process.env.COLORFGBG;
  if (!colorFgbg) {
    return null;
  }
  const parts = colorFgbg.split(";");
  const background = Number.parseInt(parts[parts.length - 1] ?? "", 10);
  if (Number.isNaN(background)) {
    return null;
  }
  return background > 7 ? "light" : "dark";
}

type DetectTerminalThemeOptions = Readonly<{
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  timeoutMs?: number;
}>;

export async function detectTerminalThemeMode(
  options: DetectTerminalThemeOptions = {},
): Promise<ThemeMode | null> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const timeoutMs = options.timeoutMs ?? 150;

  if (!("isTTY" in input && input.isTTY) || !("isTTY" in output && output.isTTY)) {
    return null;
  }

  const wasRaw = "isRaw" in input ? input.isRaw : undefined;
  let settled = false;
  let buffer = "";

  return await new Promise<ThemeMode | null>((resolve) => {
    const drainInput = () => {
      if (!(input instanceof Readable)) {
        return;
      }
      while (input.readableLength > 0) {
        input.read();
      }
      input.pause();
    };

    const cleanup = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      input.removeListener("data", onData);
      if (wasRaw !== undefined && "setRawMode" in input) {
        input.setRawMode?.(wasRaw);
      }
      drainInput();
    };

    const finish = (mode: ThemeMode | null) => {
      cleanup();
      resolve(mode);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    const onData = (chunk: Buffer | string) => {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      const color = parseOsc11BackgroundColor(buffer);
      if (color) {
        finish(themeModeForBackgroundColor(color));
      }
    };

    input.setRawMode?.(true);
    if (input instanceof Readable) {
      input.resume();
    }
    input.on("data", onData);
    output.write(OSC_11_BACKGROUND_QUERY);
  });
}

type ResolveThemeOptions = Readonly<{
  allowProbe?: boolean;
  fallbackMode?: ThemeMode;
}>;

export async function resolveThemeMode(
  preference: "auto" | "light" | "dark",
  options: ResolveThemeOptions = {},
): Promise<ThemeMode> {
  const { allowProbe = true, fallbackMode = "dark" } = options;

  if (preference === "light") {
    return "light";
  }
  if (preference === "dark") {
    return "dark";
  }

  if (allowProbe) {
    const detected = await detectTerminalThemeMode();
    if (detected) {
      return detected;
    }
  }

  return themeModeFromColorFgbg() ?? fallbackMode;
}
