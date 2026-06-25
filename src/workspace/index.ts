import { readFile, writeFile } from "node:fs/promises";

import chokidar, { type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";

import { discoverFileTree } from "./discovery.js";
import type { WorkspaceChangeEvent, WorkspaceFileNode } from "./types.js";

export class Workspace extends EventEmitter {
  readonly rootDir: string;
  private watcher: FSWatcher | null = null;
  private tree: WorkspaceFileNode[] = [];

  constructor(rootDir: string) {
    super();
    this.rootDir = rootDir;
  }

  async open(): Promise<WorkspaceFileNode[]> {
    this.tree = await discoverFileTree(this.rootDir);
    await this.startWatcher();
    this.emitChange({ type: "ready" });
    return this.tree;
  }

  getTree(): readonly WorkspaceFileNode[] {
    return this.tree;
  }

  async refresh(): Promise<WorkspaceFileNode[]> {
    this.tree = await discoverFileTree(this.rootDir);
    return this.tree;
  }

  async readFile(filePath: string): Promise<string> {
    return readFile(filePath, "utf8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await writeFile(filePath, content, "utf8");
  }

  async close(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
  }

  private async startWatcher(): Promise<void> {
    await this.watcher?.close();
    this.watcher = chokidar.watch(this.rootDir, {
      ignoreInitial: true,
      ignored: [
        /(^|[/\\])\../,
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
      ],
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    const handle = async (type: WorkspaceChangeEvent["type"], path: string) => {
      try {
        this.tree = await discoverFileTree(this.rootDir);
        this.emitChange({ type, path });
      } catch (error) {
        this.emit("error", error instanceof Error ? error : new Error(String(error)));
      }
    };

    this.watcher.on("add", (path) => void handle("add", path));
    this.watcher.on("change", (path) => void handle("change", path));
    this.watcher.on("unlink", (path) => void handle("unlink", path));
    this.watcher.on("error", (error) => {
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    });
  }

  private emitChange(event: WorkspaceChangeEvent): void {
    this.emit("change", event);
  }
}

export { discoverFileTree, flattenFiles, findNodeByPath, isWorkspaceFile } from "./discovery.js";
