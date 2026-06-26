import os from "node:os";
import path from "node:path";

export function getConfigDir(): string {
  if (process.env.REQEX_CONFIG_DIR) {
    return process.env.REQEX_CONFIG_DIR;
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "reqex");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "reqex");
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(xdg, "reqex");
}

export function getProjectConfigDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".reqex");
}
