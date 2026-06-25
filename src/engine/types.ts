export type RequestRegion = Readonly<{
  id: string;
  name: string;
  method?: string;
  url?: string;
  startLine: number;
  endLine: number;
  isGlobal: boolean;
  hasRequest: boolean;
}>;

export type ParsedFile = Readonly<{
  path: string;
  regions: readonly RequestRegion[];
  version: number;
}>;

export type ResponseHeaderRow = Readonly<{
  name: string;
  value: string;
}>;

export type ExecResult = Readonly<{
  statusCode?: number;
  statusMessage?: string;
  protocol?: string;
  headers: readonly ResponseHeaderRow[];
  body: string;
  prettyBody: string;
  durationMs?: number;
  testResults: readonly TestResultDto[];
  error?: string;
}>;

export type TestResultDto = Readonly<{
  message: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED" | "ERROR";
  detail?: string;
}>;

export type PromptRequest =
  | Readonly<{ kind: "confirm"; message: string }>
  | Readonly<{ kind: "input"; message: string; defaultValue?: string; masked?: boolean }>
  | Readonly<{ kind: "list"; message: string; values: readonly string[] }>;

export type PromptResult = string | boolean | undefined;

export type PromptHandler = (request: PromptRequest) => Promise<PromptResult>;
