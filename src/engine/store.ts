import { store as httpyacStoreModule } from "httpyac";
import type { HttpFile, HttpRegion } from "httpyac/dist/models/index.js";

import type { ParsedFile, RequestRegion } from "./types.js";

const store = new httpyacStoreModule.HttpFileStore();
const versions = new Map<string, number>();

function toRegion(region: HttpRegion): RequestRegion {
  return {
    id: region.id,
    name: region.symbol.name,
    method: region.request?.method,
    url: region.request?.url,
    startLine: region.symbol.startLine,
    endLine: region.symbol.endLine,
    isGlobal: region.isGlobal(),
    hasRequest: Boolean(region.request),
  };
}

export function bumpParseVersion(filePath: string): number {
  const next = (versions.get(filePath) ?? 0) + 1;
  versions.set(filePath, next);
  return next;
}

export function getParseVersion(filePath: string): number {
  return versions.get(filePath) ?? 0;
}

export async function parseFile(
  filePath: string,
  getText: () => Promise<string>,
  workingDir: string,
  version?: number,
): Promise<ParsedFile> {
  const parseVersion = version ?? getParseVersion(filePath);
  const httpFile = await store.getOrCreate(filePath, getText, parseVersion, {
    workingDir,
  });

  const regions = httpFile.httpRegions.map(toRegion);
  return {
    path: filePath,
    regions,
    version: parseVersion,
  };
}

export function getHttpFile(filePath: string): HttpFile | undefined {
  return store.get(filePath);
}

export function getHttpRegion(filePath: string, regionId: string): HttpRegion | undefined {
  const httpFile = store.get(filePath);
  return httpFile?.httpRegions.find((region: HttpRegion) => region.id === regionId);
}

export { store as httpFileStore };
