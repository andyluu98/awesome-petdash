import { isAbsolute, join } from "node:path";

export const antigravityMcpServerName = "openpets";
export const openPetsMcpPackageName = "@open-pets/mcp";
export type AntigravityCommandMode = "published" | "local" | "bundled";

export interface AntigravityMcpEntry {
  readonly command: string;
  readonly args: readonly string[];
}

export interface AntigravityMcpConfig {
  readonly mcpServers?: {
    readonly openpets?: AntigravityMcpEntry | unknown;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

export interface AntigravityMcpPreviewOptions {
  readonly mcpVersion: string;
  readonly petId?: string;
  readonly commandMode?: AntigravityCommandMode;
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

export function buildAntigravityMcpEntry(options: AntigravityMcpPreviewOptions): AntigravityMcpEntry {
  const petArgs = options.petId === undefined ? [] : ["--pet", validateOpenPetsPetId(options.petId)];
  const mode = options.commandMode ?? "published";
  if (mode === "local" || mode === "bundled") {
    if (!options.mcpEntryPath || !isAbsolute(options.mcpEntryPath)) {
      throw new Error("Antigravity local MCP preview requires an absolute MCP entry path.");
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

export function getAntigravityGlobalMcpPath(homeDir: string): string {
  // Google Antigravity CLI stores MCP config at ~/.gemini/config/mcp_config.json
  return join(homeDir, ".gemini", "config", "mcp_config.json");
}
