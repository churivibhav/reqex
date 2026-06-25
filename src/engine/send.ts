import { getEnvironments, getVariables, send } from "httpyac";
import type { HttpResponse } from "httpyac/dist/models/httpResponse.js";

import { getHttpFile, getHttpRegion } from "./store.js";
import type { ExecResult, ResponseHeaderRow, TestResultDto } from "./types.js";

function formatBody(body: unknown): string {
  if (body === undefined || body === null) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

function prettyBody(response: HttpResponse | undefined): string {
  if (!response) {
    return "";
  }
  if (response.prettyPrintBody) {
    return response.prettyPrintBody;
  }
  return formatBody(response.body);
}

function toHeaders(response: HttpResponse | undefined): ResponseHeaderRow[] {
  if (!response?.headers) {
    return [];
  }
  return Object.entries(response.headers).map(([name, value]) => ({
    name,
    value: Array.isArray(value) ? value.join(", ") : String(value ?? ""),
  }));
}

function toTestResults(region: { testResults?: Array<{ message: string; status: string; error?: { displayMessage?: string } }> }): TestResultDto[] {
  if (!region.testResults) {
    return [];
  }
  return region.testResults.map((result) => ({
    message: result.message,
    status: result.status as TestResultDto["status"],
    detail: result.error?.displayMessage,
  }));
}

export async function sendRegion(options: {
  filePath: string;
  regionId: string;
  workingDir: string;
  activeEnvironment?: string[];
  variables?: Record<string, unknown>;
}): Promise<ExecResult> {
  const httpFile = getHttpFile(options.filePath);
  const httpRegion = getHttpRegion(options.filePath, options.regionId);

  if (!httpFile || !httpRegion) {
    return {
      headers: [],
      body: "",
      prettyBody: "",
      testResults: [],
      error: "Request region not found",
    };
  }

  let capturedResponse: HttpResponse | undefined;
  const logResponse = async (response: HttpResponse | undefined) => {
    capturedResponse = response;
  };

  try {
    await send({
      httpFile,
      httpRegion,
      activeEnvironment: options.activeEnvironment,
      variables: options.variables,
      logResponse,
    });

    const response = capturedResponse ?? httpRegion.response;
    return {
      statusCode: response?.statusCode,
      statusMessage: response?.statusMessage,
      protocol: response?.protocol,
      headers: toHeaders(response),
      body: formatBody(response?.body),
      prettyBody: prettyBody(response),
      durationMs: response?.timings?.total,
      testResults: toTestResults(httpRegion),
    };
  } catch (error) {
    return {
      headers: [],
      body: "",
      prettyBody: "",
      testResults: toTestResults(httpRegion),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function listEnvironments(filePath: string): Promise<string[]> {
  const httpFile = getHttpFile(filePath);
  if (!httpFile) {
    return [];
  }
  return getEnvironments({ httpFile });
}

export async function listVariables(
  filePath: string,
  activeEnvironment: string[] | undefined,
): Promise<Record<string, unknown>> {
  const httpFile = getHttpFile(filePath);
  if (!httpFile) {
    return {};
  }
  return getVariables({ httpFile, activeEnvironment });
}
