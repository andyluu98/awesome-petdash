import { isAbsolute, join } from "node:path";

export const codexMcpServerName = "openpets";
export const openPetsMcpPackageName = "@open-pets/mcp";
export type CodexCommandMode = "published" | "local" | "bundled";

export interface CodexMcpEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
}

export interface CodexMcpConfig {
  readonly mcp_servers?: {
    readonly openpets?: CodexMcpEntry | unknown;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

export interface CodexMcpPreviewOptions {
  readonly mcpVersion: string;
  readonly petId?: string;
  readonly commandMode?: CodexCommandMode;
  readonly mcpEntryPath?: string;
}

export function validateOpenPetsPetId(value: string): string {
  const trimmed = value.trim();
  if (trimmed !== value || trimmed.length < 1) throw new Error("Invalid OpenPets pet id.");
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(trimmed)) throw new Error("Invalid OpenPets pet id.");
  return trimmed;
}

export function isValidPetId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
}

export function buildCodexMcpEntry(options: CodexMcpPreviewOptions): CodexMcpEntry {
  const petArgs = options.petId === undefined ? [] : ["--pet", validateOpenPetsPetId(options.petId)];
  const mode = options.commandMode ?? "published";
  if (mode === "local" || mode === "bundled") {
    if (!options.mcpEntryPath || !isAbsolute(options.mcpEntryPath)) {
      throw new Error("Codex local MCP preview requires an absolute MCP entry path.");
    }
    return { command: "node", args: [options.mcpEntryPath, ...petArgs] };
  }
  validateOpenPetsPackageVersion(options.mcpVersion);
  return { command: "npx", args: ["-y", `${openPetsMcpPackageName}@${options.mcpVersion}`, ...petArgs] };
}

export function validateOpenPetsPackageVersion(value: string): string {
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(value)) {
    throw new Error("Invalid OpenPets package version.");
  }
  return value;
}

export function getCodexGlobalConfigPath(homeDir: string): string {
  return join(homeDir, ".codex", "config.toml");
}
