import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { WorkspaceFileKind, WorkspaceFileNode } from "./types.js";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".reqex",
  "dist",
  ".cursor",
]);

const FILE_KINDS: ReadonlyArray<{ ext: string; kind: WorkspaceFileKind }> = [
  { ext: ".http", kind: "http" },
  { ext: ".rest", kind: "rest" },
  { ext: ".env", kind: "env" },
  { ext: ".env.json", kind: "env-json" },
];

export function classifyFile(filePath: string): WorkspaceFileKind | null {
  const base = path.basename(filePath);
  for (const { ext, kind } of FILE_KINDS) {
    if (base === ext || base.endsWith(ext)) {
      return kind;
    }
  }
  if (base.endsWith(".env.json")) {
    return "env-json";
  }
  return null;
}

export function isWorkspaceFile(filePath: string): boolean {
  return classifyFile(filePath) !== null;
}

export async function discoverFileTree(rootDir: string): Promise<WorkspaceFileNode[]> {
  return discoverDirectory(rootDir, rootDir);
}

async function discoverDirectory(
  rootDir: string,
  currentDir: string,
): Promise<WorkspaceFileNode[]> {
  let entries: string[];
  try {
    entries = await readdir(currentDir);
  } catch {
    return [];
  }

  entries.sort((a, b) => a.localeCompare(b));
  const nodes: WorkspaceFileNode[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".") && entry !== ".env" && !entry.endsWith(".env.json")) {
      if (SKIP_DIRS.has(entry)) {
        continue;
      }
    }

    const fullPath = path.join(currentDir, entry);
    let entryStat;
    try {
      entryStat = await stat(fullPath);
    } catch {
      continue;
    }

    if (entryStat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) {
        continue;
      }
      const children = await discoverDirectory(rootDir, fullPath);
      if (children.length > 0) {
        nodes.push({
          name: entry,
          path: fullPath,
          kind: "directory",
          children,
        });
      }
      continue;
    }

    const fileKind = classifyFile(fullPath);
    if (!fileKind) {
      continue;
    }

    nodes.push({
      name: entry,
      path: fullPath,
      kind: "file",
      fileKind,
    });
  }

  return nodes;
}

export function flattenFiles(nodes: readonly WorkspaceFileNode[]): WorkspaceFileNode[] {
  const files: WorkspaceFileNode[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      files.push(node);
    } else if (node.children) {
      files.push(...flattenFiles(node.children));
    }
  }
  return files;
}

export function findNodeByPath(
  nodes: readonly WorkspaceFileNode[],
  targetPath: string,
): WorkspaceFileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }
    if (node.children) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function collectDirectoryPaths(nodes: readonly WorkspaceFileNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind === "directory") {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectDirectoryPaths(node.children));
      }
    }
  }
  return paths;
}
