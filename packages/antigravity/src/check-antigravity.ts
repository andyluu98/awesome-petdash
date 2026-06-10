import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildAntigravityMcpEntry, getAntigravityGlobalMcpPath } from "./antigravity-mcp.js";
import {
  classifyAntigravityMcpStatus,
  executeAntigravityMcpWrite,
  planAntigravityMcpInstall,
  planAntigravityMcpRemove,
  planAntigravityMcpReplace,
  readAntigravityMcpConfig,
} from "./antigravity-status.js";

const root = mkdtempSync(join(tmpdir(), "openpets-antigravity-"));

try {
  // Config path helper — ~/.gemini/config/mcp_config.json
  const homeDir = join(root, "home");
  mkdirSync(homeDir);
  const expectedConfigPath = join(homeDir, ".gemini", "config", "mcp_config.json");
  assert.equal(getAntigravityGlobalMcpPath(homeDir), expectedConfigPath, "Antigravity global config path must be ~/.gemini/config/mcp_config.json");
  assert.ok(!expectedConfigPath.includes(".."), "Antigravity config path must not contain traversal");

  // Missing config → canInstall
  const configDir = join(root, "gemini", "config");
  mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, "mcp_config.json");
  const missingResult = readAntigravityMcpConfig(configPath);
  assert.equal(missingResult.ok, true);
  assert.equal((missingResult as { exists: boolean }).exists, false);

  // Install into empty config
  const opts = { mcpVersion: "2.0.6", petId: "fixer", commandMode: "published" as const };
  const installPlan = planAntigravityMcpInstall(configPath, opts);
  assert.ok("targetPath" in installPlan, "planAntigravityMcpInstall must return a write plan");
  if (!("targetPath" in installPlan)) throw new Error("unreachable");
  executeAntigravityMcpWrite(installPlan);

  // Verify written JSON
  const content = readFileSync(configPath, "utf8");
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const servers = parsed.mcpServers as Record<string, unknown>;
  assert.ok(servers, "mcpServers must exist in written JSON");
  const openpetsEntry = servers.openpets as Record<string, unknown>;
  assert.ok(openpetsEntry, "mcpServers.openpets must exist");
  assert.equal(openpetsEntry.command, "npx");
  assert.ok(Array.isArray(openpetsEntry.args));
  assert.ok((openpetsEntry.args as string[]).includes("@open-pets/mcp@2.0.6"));
  assert.ok((openpetsEntry.args as string[]).includes("--pet"));
  assert.ok((openpetsEntry.args as string[]).includes("fixer"));

  // Status after install
  const afterInstall = readAntigravityMcpConfig(configPath);
  const status = classifyAntigravityMcpStatus(afterInstall, configPath, opts);
  assert.equal(status.status, "installed");
  assert.equal(status.canInstall, false);
  assert.equal(status.canRemove, true);
  assert.equal(status.canReplace, false);

  // Preserve unrelated JSON keys across install
  const withExtra = join(configDir, "extra.json");
  writeFileSync(withExtra, JSON.stringify({ someOtherSetting: true, mcpServers: {} }, null, 2), "utf8");
  const extraPlan = planAntigravityMcpInstall(withExtra, opts);
  assert.ok("targetPath" in extraPlan, "install on config with extra keys must return plan");
  if (!("targetPath" in extraPlan)) throw new Error("unreachable");
  executeAntigravityMcpWrite(extraPlan);
  const extraContent = JSON.parse(readFileSync(withExtra, "utf8")) as Record<string, unknown>;
  assert.equal((extraContent as { someOtherSetting: boolean }).someOtherSetting, true, "Unrelated JSON keys must be preserved on install");
  assert.ok((extraContent.mcpServers as Record<string, unknown>)?.openpets, "openpets entry must be present after install");

  // Replace (version update)
  const optsV2 = { mcpVersion: "2.1.0", petId: "fixer", commandMode: "published" as const };
  const needsUpdate = classifyAntigravityMcpStatus(readAntigravityMcpConfig(configPath), configPath, optsV2);
  assert.equal(needsUpdate.status, "needs-update");
  const replacePlan = planAntigravityMcpReplace(configPath, optsV2);
  assert.ok("targetPath" in replacePlan, "planAntigravityMcpReplace must return write plan");
  if (!("targetPath" in replacePlan)) throw new Error("unreachable");
  executeAntigravityMcpWrite(replacePlan);
  const afterReplace = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const afterEntry = (afterReplace.mcpServers as Record<string, Record<string, unknown>>)?.openpets;
  assert.ok((afterEntry?.args as string[]).includes("@open-pets/mcp@2.1.0"), "Replace must update version");

  // Remove
  const removePlan = planAntigravityMcpRemove(configPath);
  assert.ok("targetPath" in removePlan, "planAntigravityMcpRemove must return write plan");
  if (!("targetPath" in removePlan)) throw new Error("unreachable");
  executeAntigravityMcpWrite(removePlan);
  const afterRemove = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const afterRemoveServers = afterRemove.mcpServers as Record<string, unknown> | undefined;
  assert.ok(!afterRemoveServers?.openpets, "openpets entry must be absent after remove");

  // buildAntigravityMcpEntry published mode
  const entry = buildAntigravityMcpEntry({ mcpVersion: "1.0.0", commandMode: "published" });
  assert.equal(entry.command, "npx");
  assert.ok(entry.args.includes("-y"));
  assert.ok(entry.args.includes("@open-pets/mcp@1.0.0"));

  // Config dir is created recursively when it doesn't exist
  const deepDir = join(root, "deep", "home");
  mkdirSync(deepDir, { recursive: true });
  const deepConfigPath = join(deepDir, ".gemini", "config", "mcp_config.json");
  assert.ok(!existsSync(deepConfigPath), "deep config must not exist before install");
  const deepPlan = planAntigravityMcpInstall(deepConfigPath, opts);
  assert.ok("targetPath" in deepPlan, "install into non-existent dir must return plan");
  if (!("targetPath" in deepPlan)) throw new Error("unreachable");
  executeAntigravityMcpWrite(deepPlan);
  assert.ok(existsSync(deepConfigPath), "deep config must exist after install (dirs created recursively)");

  console.error("Antigravity package validation passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
