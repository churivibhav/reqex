export type WorkspaceFileKind = "http" | "rest" | "env" | "env-json";

export type WorkspaceFileNode = Readonly<{
  name: string;
  path: string;
  kind: "file" | "directory";
  fileKind?: WorkspaceFileKind;
  children?: readonly WorkspaceFileNode[];
}>;

export type WorkspaceChangeEvent =
  | Readonly<{ type: "add"; path: string }>
  | Readonly<{ type: "change"; path: string }>
  | Readonly<{ type: "unlink"; path: string }>
  | Readonly<{ type: "ready" }>;

export type WorkspaceEvents = {
  change: (event: WorkspaceChangeEvent) => void;
  error: (error: Error) => void;
};
