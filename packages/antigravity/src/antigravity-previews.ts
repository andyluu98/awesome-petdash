import type { AntigravityMcpEntry, AntigravityMcpPreviewOptions } from "./antigravity-mcp.js";
import { buildAntigravityMcpEntry } from "./antigravity-mcp.js";

export interface AntigravityRedactedPreview {
  readonly openpets?: AntigravityMcpEntry;
  readonly redactedFields?: readonly string[];
}

const sensitiveKeys = [
  "env",
  "headers",
  "auth",
  "authorization",
  "token",
  "secret",
  "password",
  "credentials",
];

const sensitivePatterns = [
  /token=/i,
  /api[_-]?key=/i,
  /secret=/i,
  /password=/i,
  /auth=/i,
];

export function buildAntigravityOnlyPreview(options: AntigravityMcpPreviewOptions): AntigravityRedactedPreview {
  return { openpets: buildAntigravityMcpEntry(options) };
}

export function redactAntigravityConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (key === "mcpServers" && isRecord(value)) {
      result[key] = redactMcpServers(value);
    } else {
      result[key] = redactValue(value);
    }
  }

  return result;
}

function redactMcpServers(mcpServers: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mcpServers)) {
    if (isRecord(value)) {
      result[key] = redactMcpEntry(value);
    } else {
      result[key] = redactValue(value);
    }
  }
  return result;
}

function redactMcpEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      result[key] = "[REDACTED]";
    } else if (key === "args" && Array.isArray(value)) {
      result[key] = value.map((arg) => {
        if (typeof arg !== "string") return arg;
        return redactStringValue(arg);
      });
    } else if (typeof value === "string") {
      result[key] = redactStringValue(value);
    } else if (isRecord(value)) {
      result[key] = redactMcpEntry(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => (isRecord(item) ? redactMcpEntry(item) : redactValue(item)));
    } else {
      result[key] = value;
    }
  }
  return result;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactStringValue(value);
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactValue(val);
      }
    }
    return result;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  return value;
}

function redactStringValue(value: string): string {
  if (value.length > 1000) return "[REDACTED-LONG-STRING]";
  for (const pattern of sensitivePatterns) {
    if (pattern.test(value)) {
      return value.replace(/[=:][^&\s]*/g, "=[REDACTED]");
    }
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
