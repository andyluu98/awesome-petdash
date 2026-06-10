import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parse as parseTOML } from "smol-toml";

import { buildCodexMcpEntry, getCodexGlobalConfigPath } from "./codex-mcp.js";
import {
  classifyCodexMcpStatus,
  executeCodexMcpWrite,
  planCodexMcpInstall,
  planCodexMcpRemove,
  planCodexMcpReplace,
  readCodexConfig,
} from "./codex-status.js";

const root = mkdtempSync(join(tmpdir(), "openpets-codex-"));

try {
  // Config path helper
  const homeDir = join(root, "home");
  mkdirSync(homeDir);
  const expectedConfigPath = join(homeDir, ".codex", "config.toml");
  assert.equal(getCodexGlobalConfigPath(homeDir), expectedConfigPath, "Codex global config path must be ~/.codex/config.toml");
  assert.ok(!expectedConfigPath.includes(".."), "Codex config path must not contain traversal");

  // Missing config → canInstall
  const configDir = join(root, "codex");
  mkdirSync(configDir);
  const configPath = join(configDir, "config.toml");
  const missingResult = readCodexConfig(configPath);
  assert.equal(missingResult.ok, true);
  assert.equal((missingResult as { exists: boolean }).exists, false);

  // Install into empty config
  const opts = { mcpVersion: "2.0.6", petId: "fixer", commandMode: "published" as const };
  const installPlan = planCodexMcpInstall(configPath, opts);
  assert.ok("targetPath" in installPlan, "planCodexMcpInstall must return a write plan");
  if (!("targetPath" in installPlan)) throw new Error("unreachable");
  executeCodexMcpWrite(installPlan);

  // Read back and verify TOML
  const content = readFileSync(configPath, "utf8");
  const parsed = parseTOML(content) as Record<string, unknown>;
  const servers = parsed.mcp_servers as Record<string, unknown>;
  assert.ok(servers, "mcp_servers must exist in written TOML");
  const openpetsEntry = servers.openpets as Record<string, unknown>;
  assert.ok(openpetsEntry, "mcp_servers.openpets must exist");
  assert.equal(openpetsEntry.command, "npx");
  assert.ok(Array.isArray(openpetsEntry.args));
  assert.ok((openpetsEntry.args as string[]).includes("@open-pets/mcp@2.0.6"));
  assert.ok((openpetsEntry.args as string[]).includes("--pet"));
  assert.ok((openpetsEntry.args as string[]).includes("fixer"));

  // Status after install
  const afterInstall = readCodexConfig(configPath);
  const status = classifyCodexMcpStatus(afterInstall, configPath, opts);
  assert.equal(status.status, "installed");
  assert.equal(status.canInstall, false);
  assert.equal(status.canRemove, true);
  assert.equal(status.canReplace, false);

  // Cannot re-install (already installed)
  const reInstallPlan = planCodexMcpInstall(configPath, opts);
  assert.ok("ok" in reInstallPlan && !reInstallPlan.ok, "Re-install of already-installed config must fail");

  // Preserve unrelated TOML keys across install
  const withExtra = join(configDir, "extra.toml");
  writeFileSync(withExtra, `[profile]\ntheme = "dark"\n\n`, "utf8");
  const extraPlan = planCodexMcpInstall(withExtra, opts);
  assert.ok("targetPath" in extraPlan, "install on config with extra keys must return plan");
  if (!("targetPath" in extraPlan)) throw new Error("unreachable");
  executeCodexMcpWrite(extraPlan);
  const extraContent = parseTOML(readFileSync(withExtra, "utf8")) as Record<string, unknown>;
  const profileSection = extraContent.profile as Record<string, unknown>;
  assert.equal(profileSection?.theme, "dark", "Unrelated TOML sections must be preserved on install");
  assert.ok((extraContent.mcp_servers as Record<string, unknown>)?.openpets, "openpets entry must be present after install");

  // Replace
  const optsV2 = { mcpVersion: "2.1.0", petId: "fixer", commandMode: "published" as const };
  const needsUpdate = classifyCodexMcpStatus(readCodexConfig(configPath), configPath, optsV2);
  assert.equal(needsUpdate.status, "needs-update");
  const replacePlan = planCodexMcpReplace(configPath, optsV2);
  assert.ok("targetPath" in replacePlan, "planCodexMcpReplace must return write plan");
  if (!("targetPath" in replacePlan)) throw new Error("unreachable");
  executeCodexMcpWrite(replacePlan);
  const afterReplace = parseTOML(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const afterEntry = (afterReplace.mcp_servers as Record<string, Record<string, unknown>>)?.openpets;
  assert.ok((afterEntry?.args as string[]).includes("@open-pets/mcp@2.1.0"), "Replace must update version");

  // Remove
  const removePlan = planCodexMcpRemove(configPath);
  assert.ok("targetPath" in removePlan, "planCodexMcpRemove must return write plan");
  if (!("targetPath" in removePlan)) throw new Error("unreachable");
  executeCodexMcpWrite(removePlan);
  const afterRemove = parseTOML(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const afterRemoveServers = afterRemove.mcp_servers as Record<string, unknown> | undefined;
  assert.ok(!afterRemoveServers?.openpets, "openpets entry must be absent after remove");

  // buildCodexMcpEntry published mode
  const entry = buildCodexMcpEntry({ mcpVersion: "1.0.0", commandMode: "published" });
  assert.equal(entry.command, "npx");
  assert.ok(entry.args.includes("-y"));
  assert.ok(entry.args.includes("@open-pets/mcp@1.0.0"));

  console.error("Codex package validation passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
