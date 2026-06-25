import type { CodeEditorSyntaxToken, CodeEditorTokenizeContext } from "@rezi-ui/core";

const KEYWORDS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "CONNECT",
  "TRACE",
  "GRAPHQL",
]);

export function tokenizeHttpLine(
  line: string,
  _context: CodeEditorTokenizeContext,
): readonly CodeEditorSyntaxToken[] {
  const tokens: CodeEditorSyntaxToken[] = [];
  const methodMatch = /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE|GRAPHQL)\b/u.exec(
    line,
  );
  if (methodMatch) {
    const method = methodMatch[1] ?? "";
    tokens.push({ text: method, kind: "keyword" });
    const rest = line.slice(methodMatch[0].length);
    if (rest.length > 0) {
      tokens.push({ text: rest, kind: "string" });
    }
    return tokens;
  }

  if (/^\s*#/u.test(line)) {
    return [{ text: line, kind: "comment" }];
  }
  if (/^\s*\/\//u.test(line)) {
    return [{ text: line, kind: "comment" }];
  }
  if (/^\s*@/u.test(line)) {
    return [{ text: line, kind: "type" }];
  }

  const headerMatch = /^\s*([!#$%&'*+\-.^_`|~0-9A-Za-z]+)(\s*:\s*)(.*)$/u.exec(line);
  if (headerMatch) {
    tokens.push({ text: headerMatch[1] ?? "", kind: "function" });
    tokens.push({ text: headerMatch[2] ?? "", kind: "operator" });
    tokens.push({ text: headerMatch[3] ?? "", kind: "string" });
    return tokens;
  }

  const words = line.split(/(\s+)/u);
  for (const word of words) {
    if (KEYWORDS.has(word)) {
      tokens.push({ text: word, kind: "keyword" });
    } else if (word.length > 0) {
      tokens.push({ text: word, kind: "plain" });
    }
  }
  return tokens.length > 0 ? tokens : [{ text: line, kind: "plain" }];
}

export function prettyJsonIfPossible(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

export function methodColor(method: string | undefined): "green" | "yellow" | "red" | "cyan" {
  switch ((method ?? "GET").toUpperCase()) {
    case "GET":
    case "HEAD":
    case "OPTIONS":
      return "green";
    case "POST":
    case "PUT":
    case "PATCH":
      return "yellow";
    case "DELETE":
      return "red";
    default:
      return "cyan";
  }
}

export function statusTone(statusCode: number | undefined): "green" | "yellow" | "red" | "cyan" {
  if (!statusCode) {
    return "cyan";
  }
  if (statusCode >= 200 && statusCode < 300) {
    return "green";
  }
  if (statusCode >= 400 && statusCode < 500) {
    return "yellow";
  }
  if (statusCode >= 500) {
    return "red";
  }
  return "cyan";
}
