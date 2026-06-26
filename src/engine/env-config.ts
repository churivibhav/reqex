import fs from "node:fs/promises";
import path from "node:path";

import type { EnvironmentConfig, Variables } from "httpyac/dist/models/index.js";

const ENV_FILE_NAMES = [
  ".env.json",
  "http-client.env.json",
  "http-client.private.env.json",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeVariables(
  target: Record<string, Variables>,
  source: Record<string, unknown>,
): void {
  for (const [envName, variables] of Object.entries(source)) {
    if (!isRecord(variables)) {
      continue;
    }
    target[envName] = {
      ...(target[envName] ?? {}),
      ...variables,
    };
  }
}

function directoriesToSearch(filePath: string, workingDir: string): string[] {
  const root = path.resolve(workingDir);
  const dirs: string[] = [];
  let current = path.dirname(path.resolve(filePath));

  while (current.startsWith(root)) {
    dirs.unshift(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return dirs.length > 0 ? dirs : [path.dirname(path.resolve(filePath))];
}

async function readEnvFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return null;
    }
    return null;
  }
}

export async function loadEnvironmentConfig(
  filePath: string,
  workingDir: string,
): Promise<EnvironmentConfig> {
  const environments: Record<string, Variables> = {};

  for (const dir of directoriesToSearch(filePath, workingDir)) {
    for (const fileName of ENV_FILE_NAMES) {
      const parsed = await readEnvFile(path.join(dir, fileName));
      if (parsed) {
        mergeVariables(environments, parsed);
      }
    }
  }

  return Object.keys(environments).length > 0 ? { environments } : {};
}
