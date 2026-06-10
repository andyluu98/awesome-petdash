import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import openPetsLogoUrl from "../../../assets/openpets.webp";
import defaultThumbUrl from "../../../assets/default-pet-thumbnail.png";

import claudeLogoUrl from "../../../assets/integrations/claude.svg";
import opencodeLogoUrl from "../../../assets/integrations/opencode.svg";
import cursorLogoUrl from "../../../assets/integrations/cursor.svg";
import piLogoUrl from "../../../assets/integrations/pi.svg";
import vscodeLogoUrl from "../../../assets/integrations/vscode.svg";
import windsurfLogoUrl from "../../../assets/integrations/windsurf.svg";
import zedLogoUrl from "../../../assets/integrations/zed.svg";

type Filter = "all" | "installed" | "featured" | "originals" | "codex";
type InstalledPet = { id: string; displayName: string; description?: string; builtIn: boolean; protected: boolean; installed: boolean; broken?: boolean; brokenReason?: string; source?: { kind?: "catalog"; preview?: string } | { kind: "codex"; path: string } };
type PetEntry = { id: string; displayName: string; description?: string; searchText?: string; preview?: string; thumbnail?: string; spritesheet?: string; category?: "western" | "asian"; original?: boolean; featured?: boolean; catalogPage?: number; sourceKind?: "installed" | "catalog" | "codex"; installed?: boolean; builtIn?: boolean; protected?: boolean; broken?: boolean; brokenReason?: string };
type SearchPetEntry = Pick<PetEntry, "id" | "displayName" | "category" | "original" | "featured"> & { searchText?: string; catalogPage?: number };
type StateSnapshot = { preferences: { defaultPetId: string }; pets: { installed: InstalledPet[] } };
type CatalogState = { pets: PetEntry[]; source: string; error?: string; page?: number; pageCount?: number; total?: number; categories?: { id: "western" | "asian"; label: string; count: number }[]; originalsCount?: number; featuredCount?: number };
type CodexState = { pets: PetEntry[]; error?: string };
type PetScaleOption = { label: string; value: number };
type UserSelectableAnimationState = "idle" | "review" | "running" | "waiting" | "waving" | "jumping" | "failed";
type ReactionAnimationOverrides = Record<string, UserSelectableAnimationState>;
type QuotaDisplayMode = "off" | "speech" | "label" | "mood";
type SettingsState = { preferences: { openDefaultPetOnLaunch: boolean; petScale: number; reactionAnimationOverrides?: ReactionAnimationOverrides; quotaDisplayMode?: QuotaDisplayMode }; petScaleOptions: PetScaleOption[] };
type LaunchAtLoginState = { supported: boolean; enabled: boolean };
type UpdateStatus = { state: "idle" | "checking" | "available" | "current" | "error"; currentVersion: string; latestVersion?: string; releaseUrl?: string; checkedAt?: number; error?: string };
type DashboardActivity = { messagesSent: number; reactionsSent: number; reactionCounts: Record<string, number>; perPetActivityCounts: Record<string, number>; lastActivityAt?: number };
type DashboardSnapshot = { defaultPet: { id: string; displayName: string; previewSpriteUrl: string }; installedPetCount: number; catalog: { source: string; total?: number; page?: number; pageCount?: number; error?: string }; plugins: { installed: number; enabled: number; broken: number }; updateStatus: UpdateStatus; activity: DashboardActivity };
type ReactionAnimationSettings = { reactions: { id: string; label: string; description: string; defaultAnimation: UserSelectableAnimationState }[]; animations: { id: UserSelectableAnimationState; label: string; description: string }[]; sprite: { frameWidth: number; frameHeight: number; columns: number; rows: number; states: Record<UserSelectableAnimationState, { row: number; frames: number; durationMs: number; iterations?: number | "infinite" }> }; overrides: ReactionAnimationOverrides; previewSpriteUrl: string };
type PluginFilter = "all" | "installed" | "catalog" | "local" | "broken";
type PluginPermission = "pet:speak" | "pet:reaction" | "pet:move" | "timer" | "schedule" | "storage" | "status" | "commands" | "network";
type PluginIconName = "plugin" | "bell" | "timer" | "github" | "heart" | "sparkles" | "coffee" | "focus";
type PluginConfigField = { type: "text" | "textarea" | "number" | "boolean" | "select" | "time" | "multiSelect" | "list"; label?: string; description?: string; default?: string | number | boolean | string[] | Array<Record<string, unknown>>; options?: Array<{ label: string; value: string }>; min?: number; max?: number; step?: number; maxLength?: number; maxItems?: number; itemSchema?: Record<string, PluginConfigField> };
type PluginConfigSchema = Record<string, PluginConfigField>;
type PluginConfig = Record<string, unknown>;
type PluginCommand = { id: string; title: string; description?: string };
type PluginStatus = { text: string; tone?: "info" | "success" | "warning" | "error" };
type PluginConfigError = { path?: string; code?: string; message?: string };
type PluginCategory = "Companion" | "Wellness" | "Focus" | "Developer" | "Advanced";
type SafePluginRecord = { id: string; name?: string; description?: string; version: string; icon?: PluginIconName; source: "catalog" | "local"; bundled?: boolean; category?: PluginCategory; enabled: boolean; brokenReason?: string; approvedPermissions: PluginPermission[]; runtime?: "declarative" | "javascript"; sdkVersion?: string; catalogDisabled?: boolean; catalogDeprecated?: boolean; catalogStatusReason?: string; configSchema?: PluginConfigSchema; effectiveConfig?: PluginConfig; configErrors?: PluginConfigError[]; commands?: PluginCommand[]; status?: PluginStatus };
type SafeCatalogPluginRecord = { id: string; name: string; version: string; description: string; runtime: "declarative" | "javascript"; icon?: PluginIconName; sdkVersion?: string; permissions: PluginPermission[]; installed: boolean; bundled?: boolean; category?: PluginCategory; deprecated?: boolean; statusReason?: string };
type PluginServiceSnapshot = { plugins: SafePluginRecord[] };
type PluginCatalogSnapshot = { plugins: SafeCatalogPluginRecord[] };
type PluginServiceResult = { ok: true; snapshot: PluginServiceSnapshot } | { ok: false; error: string; snapshot: PluginServiceSnapshot };
type PluginEntry = { id: string; installed?: SafePluginRecord; catalog?: SafeCatalogPluginRecord };
type ControlCenterApi = {
  getPetsState(): Promise<StateSnapshot>;
  getDashboardSnapshot(): Promise<DashboardSnapshot>;
  getSettingsState(): Promise<SettingsState>;
  updatePreferences(patch: Partial<SettingsState["preferences"]>): Promise<SettingsState>;
  getReactionAnimationSettings(): Promise<ReactionAnimationSettings>;
  getLaunchAtLogin(): Promise<LaunchAtLoginState>;
  setLaunchAtLogin(enabled: boolean): Promise<LaunchAtLoginState>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  openUpdateReleasePage(): Promise<void>;
  resetDefaultPetPosition(): Promise<SettingsState>;
  getPluginsSnapshot(): Promise<PluginServiceSnapshot>;
  getPluginCatalogSnapshot(refresh?: boolean): Promise<PluginCatalogSnapshot>;
  setPluginEnabled(id: string, enabled: boolean): Promise<PluginServiceResult>;
  savePluginConfig(id: string, config: PluginConfig): Promise<PluginServiceResult>;
  reloadPlugin(id: string): Promise<PluginServiceResult>;
  executePluginCommand(id: string, commandId: string): Promise<PluginServiceResult>;
  loadLocalPlugin(): Promise<PluginServiceResult>;
  installCatalogPlugin(id: string): Promise<PluginServiceResult>;
  updateCatalogPlugin(id: string): Promise<PluginServiceResult>;
  uninstallPlugin(id: string): Promise<PluginServiceResult>;
  getCatalog(): Promise<CatalogState>;
  getCatalogPage(page: number): Promise<CatalogState>;
  getCatalogSearch(): Promise<{ pets: SearchPetEntry[]; error?: string }>;
  getCodexPets(): Promise<CodexState>;
  setDefaultPet(petId: string): Promise<StateSnapshot>;
  installPet(petId: string): Promise<unknown>;
  installLocalPet(): Promise<unknown>;
  importCodexPet(petId: string): Promise<unknown>;
  openGallery(): Promise<void>;
  removePet(petId: string): Promise<StateSnapshot>;
  onRouteChange(callback: (route: Route) => void): () => void;
  getIntegrationsState(selectedPetId?: string, commandMode?: "published" | "local" | "bundled"): Promise<AgentSetupSnapshot>;
  runIntegrationAction(action: AgentSetupAction, selectedPetId?: string, commandMode?: "published" | "local" | "bundled"): Promise<AgentSetupSnapshot>;
  updateIntegrationCommandPaths(patch: Partial<AgentSetupCommandPaths>): Promise<AgentSetupCommandPaths>;
};


type AgentSetupAction = "configure" | "replace" | "remove" | "install-memory" | "doctor-hooks" | "install-hooks" | "uninstall-hooks" | "opencode-install" | "opencode-remove" | "cursor-install" | "cursor-replace" | "cursor-remove";
type AgentSetupPetOption = { id: string; displayName: string; default: boolean };
type ClaudeCodeStatus = { state: "detected" | "not_detected" | "configured" | "needs_setup" | "error"; label: string; details: string; claudeCommand?: string; version?: string; mcpListWorks: boolean; openPetsEntry: { present: boolean; verified: boolean; matchesExpected: boolean }; canConfigure: boolean; canReplace: boolean; canRemove: boolean };
type ClaudeHookDoctorResult = { status: "installed" | "needs_setup" | "error" | "custom" | "conflict"; settingsPath: string; exists: boolean; valid: boolean; message: string; preview: Record<string, unknown>; asyncSupported: boolean; backupPath?: string };
type ClaudeOpenPetsMemoryStatus = { state: "installed" | "needs_setup" | "error"; label: string; details: string; claudeMdPath: string; openPetsMemoryPath: string; canInstall: boolean };
type OpenCodeSetupStatus = { state: "configured" | "needs_setup" | "not_detected" | "error"; label: string; details: string; configDir: string; canInstall: boolean; canRemove: boolean };
type OpenCodeSetupPreview = { global: true; configDir: string; configPath: string; cleanupConfigPaths: string[]; mcpCommand: string[]; plugin: unknown[] | string; instructionPath: string; configPreview: Record<string, unknown> };
type CursorSetupStatus = { state: "configured" | "needs_setup" | "not_detected" | "error" | "conflict" | "needs_update"; label: string; details: string; configPath: string; canInstall: boolean; canReplace: boolean; canRemove: boolean };
type CursorSetupPreview = { global: true; configPath: string; mcpEntry: Record<string, unknown>; rulesPath: string; rulesContent: string; commandMode: "published" | "local" | "bundled" };
type AgentSetupCommandPaths = { claude: string; node: string; opencode: string };
type AgentSetupActionResult = { ok: boolean; action: AgentSetupAction; message: string; changed: boolean };
type AgentSetupSnapshot = { selectedPetId?: string; commandMode: "published" | "local" | "bundled"; localDevAvailable: boolean; petOptions: AgentSetupPetOption[]; preview: { displayCommand: string; mcpJson: Record<string, unknown> }; status: ClaudeCodeStatus; hookStatus: ClaudeHookDoctorResult; memoryStatus: ClaudeOpenPetsMemoryStatus; opencodeStatus: OpenCodeSetupStatus; opencodePreview: OpenCodeSetupPreview; cursorStatus: CursorSetupStatus; cursorPreview: CursorSetupPreview; commandPaths: AgentSetupCommandPaths; busy: boolean; lastAction?: AgentSetupActionResult };
type StatusTone = keyof typeof statusPillToneClass;

const api = (window as unknown as { openPetsControlCenter: ControlCenterApi }).openPetsControlCenter;


// Inline SVG Icons for actions, pagination, and filters
const InstallIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ImportIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M12 18v-6" />
    <path d="m9 15 3 3 3-3" />
  </svg>
);

const SetDefaultIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ReplaceIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M21 21v-5h-5" />
  </svg>
);

const HookIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 15-6-6-6 6" />
  </svg>
);

const MemoryIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 10v6" />
    <path d="M9 13h6" />
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </svg>
);

const RemoveIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

const ConfigureIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="21" x2="14" y1="4" y2="4" />
    <line x1="10" x2="3" y1="4" y2="4" />
    <line x1="21" x2="12" y1="12" y2="12" />
    <line x1="8" x2="3" y1="12" y2="12" />
    <line x1="21" x2="16" y1="20" y2="20" />
    <line x1="12" x2="3" y1="20" y2="20" />
    <line x1="14" x2="14" y1="2" y2="6" />
    <line x1="8" x2="8" y1="10" y2="14" />
    <line x1="16" x2="16" y1="18" y2="22" />
  </svg>
);

const EyeIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const FolderPlusIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 10v6" />
    <path d="M9 13h6" />
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);

const SaveIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8A2 2 0 0 1 21 8.8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M17 21v-7H7v7" />
    <path d="M7 3v5h8" />
  </svg>
);

const CloseIcon = () => (
  <svg className="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const PrevIcon = () => (
  <svg className="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const NextIcon = () => (
  <svg className="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const FilterAllIcon = () => (
  <svg className="filter-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
  </svg>
);

const FilterInstalledIcon = () => (
  <svg className="filter-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const FilterFeaturedIcon = () => (
  <svg className="filter-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3q1 4 4 6.5t3 5.5a7 7 0 0 1-14 0 5 5 0 0 1 1-3 3 3 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" />
  </svg>
);

const FilterOriginalIcon = () => (
  <svg className="filter-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z" />
  </svg>
);

const FilterWesternIcon = () => (
  <svg className="filter-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

const FilterAsianIcon = () => (
  <svg className="filter-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const FilterCodexIcon = () => (
  <svg className="filter-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const MessageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const HeartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ZapIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const ActivityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const BoxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z" />
  </svg>
);

// Navigation Shell Types and Icons
type Route = "dashboard" | "pets" | "settings" | "plugins" | "integrations";

const DashboardIcon = () => (
  <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect fill="currentColor" width="7" height="9" x="3" y="3" rx="1" />
    <rect fill="currentColor" width="7" height="5" x="14" y="3" rx="1" />
    <rect fill="currentColor" width="7" height="9" x="14" y="12" rx="1" />
    <rect fill="currentColor" width="7" height="5" x="3" y="16" rx="1" />
  </svg>
);

const PetsIcon = () => (
  <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle fill="currentColor" cx="11" cy="4" r="2" />
    <circle fill="currentColor" cx="18" cy="8" r="2" />
    <circle fill="currentColor" cx="20" cy="16" r="2" />
    <path fill="currentColor" d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045q-.64-2.065-2.7-2.705A3.5 3.5 0 0 1 5.5 10Z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="21" x2="14" y1="4" y2="4" />
    <line x1="10" x2="3" y1="4" y2="4" />
    <line x1="21" x2="12" y1="12" y2="12" />
    <line x1="8" x2="3" y1="12" y2="12" />
    <line x1="21" x2="16" y1="20" y2="20" />
    <line x1="12" x2="3" y1="20" y2="20" />
    <line x1="14" x2="14" y1="2" y2="6" />
    <line x1="8" x2="8" y1="10" y2="14" />
    <line x1="16" x2="16" y1="18" y2="22" />
  </svg>
);

const PluginsIcon = () => (
  <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path fill="currentColor" d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2" />
    <rect fill="currentColor" width="8" height="8" x="14" y="2" rx="1" />
  </svg>
);

const IntegrationsIcon = () => (
  <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="12" cy="18" r="3" />
    <path d="M8.6 7.5 10.8 15" />
    <path d="M15.4 7.5 13.2 15" />
    <path d="M9 6h6" />
  </svg>
);

const navTabs = [
  { id: "dashboard" as const, label: "Dashboard", icon: <DashboardIcon /> },
  { id: "pets" as const, label: "Pets", icon: <PetsIcon /> },
  { id: "settings" as const, label: "Settings", icon: <SettingsIcon /> },
  { id: "plugins" as const, label: "Plugins", icon: <PluginsIcon /> },
  { id: "integrations" as const, label: "Integrations", icon: <IntegrationsIcon /> },
];

const routeMetadata: Record<Route, { title: string; description: string }> = {
  dashboard: {
    title: "Dashboard",
    description: "Overview of your active companions, status, and system metrics.",
  },
  pets: {
    title: "Pets",
    description: "Install, import, preview, and choose your default desktop companion.",
  },
  settings: {
    title: "Settings",
    description: "Configure startup behaviors, scale preferences, and animation settings.",
  },
  plugins: {
    title: "Plugins",
    description: "Extend your desktop experience with custom tools and behaviors.",
  },
  integrations: {
    title: "Integrations",
    description: "Connect your companions to Claude Code, VS Code, Cursor, and more.",
  },
};

function DashboardView({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const next = await api.getDashboardSnapshot();
      setSnapshot(next);
      setError("");
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
  };

  useEffect(() => { void load(); }, []);

  if (!snapshot) {
    return (
      <div className="flex flex-col gap-6 h-full">
        <GlassCard className="flex h-full flex-col items-center justify-center gap-4 text-center py-16">
          <p className="text-sm font-semibold text-slatecopy">{error || "Gathering companion metrics..."}</p>
          {error && <Button variant="secondary" size="compact" icon={<RefreshIcon />} onClick={() => void load()}>Retry</Button>}
        </GlassCard>
      </div>
    );
  }

  const { activity, defaultPet, plugins, installedPetCount, updateStatus, catalog } = snapshot;

  // Find top pet by activity or fallback to default
  const topPetId = Object.entries(activity.perPetActivityCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
  const topPetName = topPetId === defaultPet.id ? defaultPet.displayName : (topPetId || defaultPet.displayName);

  // Find top reaction
  const reactionEntries = Object.entries(activity.reactionCounts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);
  const reactionTotal = reactionEntries.reduce((total, [, count]) => total + count, 0);
  const reactionColors = ["#3b82f6", "#a855f7", "#f97316", "#14b8a6"];
  const reactionDonutSegments = reactionEntries.slice(0, 4).map(([label, count], index) => ({
    label,
    count,
    color: reactionColors[index] ?? "#64748b",
  }));
  const topCompanionEntries = Object.entries(activity.perPetActivityCounts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);
  const maxCompanionActivity = Math.max(...topCompanionEntries.map(([, count]) => count), 1);
  const lastActiveLabel = activity.lastActivityAt ? new Date(activity.lastActivityAt).toLocaleString() : "No activity yet";
  const updateLabel = updateStatus.state === "available" ? "Update available" : updateStatus.state === "error" ? "Check failed" : updateStatus.state === "checking" ? "Checking" : updateStatus.state === "current" ? "Current" : "Not checked";

  return (
    <div className="dashboard-layout">
      {error && <div className="error">{error}</div>}

      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <p className="eyebrow !text-blue-100 opacity-80">Primary Companion</p>
          <h2 className="dashboard-hero-title">{defaultPet.displayName}</h2>
          <p className="dashboard-hero-desc">
            Ready for your next coding session.
          </p>
          <div className="flex gap-3 mt-3">
            <Button variant="secondary" size="compact" onClick={() => onNavigate("pets")}>Change Pet</Button>
          </div>
        </div>
        <div className="dashboard-hero-pet">
          <SpriteFrame src={defaultPet.previewSpriteUrl} label={defaultPet.displayName} state="idle" size="detail" />
        </div>
      </section>

      <div className="dashboard-grid">
        <article className="dashboard-stat-card">
          <div className="dashboard-stat-header">
            <div className="dashboard-stat-icon"><MessageIcon /></div>
            <span className="dashboard-stat-label">Messages</span>
          </div>
          <div className="dashboard-stat-value">{activity.messagesSent.toLocaleString()}</div>
          <div className="dashboard-stat-footer">Total speech bubbles sent</div>
        </article>

        <article className="dashboard-stat-card">
          <div className="dashboard-stat-header">
            <div className="dashboard-stat-icon"><HeartIcon /></div>
            <span className="dashboard-stat-label">Reactions</span>
          </div>
          <div className="dashboard-stat-value">{activity.reactionsSent.toLocaleString()}</div>
          <div className="dashboard-stat-footer">Total animations triggered</div>
        </article>

        <article className="dashboard-stat-card">
          <div className="dashboard-stat-header">
            <div className="dashboard-stat-icon"><StarIcon /></div>
            <span className="dashboard-stat-label">Top Companion</span>
          </div>
          <div className="dashboard-stat-value truncate text-2xl">{topPetName}</div>
          <div className="dashboard-stat-footer">Most active pet lately</div>
        </article>
      </div>

      <div className="dashboard-row">
        <GlassCard className="dashboard-activity-card">
          <div className="dashboard-section-title"><ActivityIcon /> Activity Overview</div>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold text-slatecopy uppercase tracking-wider">Top Reactions</span>
              <div className="dashboard-reaction-list">
                {reactionEntries.length > 0 ? (
                  reactionEntries.slice(0, 6)
                    .map(([label, count]) => (
                      <div key={label} className="dashboard-reaction-item">
                        <span className="dashboard-reaction-count">{count}</span>
                        <span className="dashboard-reaction-label">{label}</span>
                      </div>
                    ))
                ) : (
                  <div className="text-xs text-slatecopy italic py-2">No reactions recorded yet. Start coding!</div>
                )}
              </div>
            </div>

            <div className="dashboard-activity-charts">
              <section className="dashboard-chart-panel dashboard-reaction-mix">
                <div className="dashboard-chart-heading">
                  <span>Reaction Mix</span>
                  <small>{reactionTotal ? `${reactionTotal.toLocaleString()} total` : "Waiting for activity"}</small>
                </div>
                <div className="dashboard-donut-row">
                  <div className="dashboard-donut" aria-label="Reaction mix chart">
                    <svg viewBox="0 0 100 100" role="img">
                      <circle className="dashboard-donut-track" cx="50" cy="50" r="40" />
                      {reactionTotal > 0 && reactionDonutSegments.map((segment, index) => {
                        const circumference = 251.327;
                        const previousTotal = reactionDonutSegments.slice(0, index).reduce((total, item) => total + item.count, 0);
                        const dash = (segment.count / reactionTotal) * circumference;
                        const offset = -(previousTotal / reactionTotal) * circumference;
                        return <circle key={segment.label} className="dashboard-donut-segment" cx="50" cy="50" r="40" stroke={segment.color} strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={offset} />;
                      })}
                    </svg>
                    <div className="dashboard-donut-center">
                      <strong>{reactionTotal.toLocaleString()}</strong>
                      <span>reactions</span>
                    </div>
                  </div>
                  <div className="dashboard-donut-legend">
                    {reactionDonutSegments.length ? reactionDonutSegments.map((segment) => (
                      <div key={segment.label} className="dashboard-donut-legend-item">
                        <span className="dashboard-donut-dot" style={{ background: segment.color }} />
                        <span>{segment.label}</span>
                        <strong>{segment.count}</strong>
                      </div>
                    )) : <p>No reaction mix yet.</p>}
                  </div>
                </div>
              </section>

              <section className="dashboard-chart-panel dashboard-companion-bars">
                <div className="dashboard-chart-heading">
                  <span>Top Companions</span>
                  <small>Most active pets</small>
                </div>
                <div className="dashboard-bars-list">
                  {topCompanionEntries.length ? topCompanionEntries.map(([petId, count]) => {
                    const label = petId === defaultPet.id ? defaultPet.displayName : petId.replace(/[-_]/g, " ");
                    return (
                      <div key={petId} className="dashboard-bar-item">
                        <div className="dashboard-bar-labels">
                          <span>{label}</span>
                          <strong>{count}</strong>
                        </div>
                        <div className="dashboard-bar-track"><span style={{ width: `${Math.max(8, Math.round((count / maxCompanionActivity) * 100))}%` }} /></div>
                      </div>
                    );
                  }) : <p className="dashboard-empty-note">No companion activity yet.</p>}
                </div>
              </section>

              <div className="dashboard-last-active-pill">Last active: <strong>{lastActiveLabel}</strong></div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="dashboard-system-card">
          <div className="dashboard-section-title"><ZapIcon /> System Health</div>
          <div className="dashboard-system-list">
            <div className="dashboard-system-item">
              <div className="dashboard-system-info">
                <div className="dashboard-system-icon"><BoxIcon /></div>
                <span className="dashboard-system-label">Pets</span>
              </div>
              <span className="dashboard-system-value">{installedPetCount} installed</span>
            </div>

            <div className="dashboard-system-item">
              <div className="dashboard-system-info">
                <div className="dashboard-system-icon"><PluginGlyph className="w-4 h-4" /></div>
                <span className="dashboard-system-label">Plugins</span>
              </div>
              <div className="flex gap-1.5">
                <StatusPill tone="green">{plugins.enabled} enabled</StatusPill>
                {plugins.broken > 0 && <StatusPill tone="red">{plugins.broken}</StatusPill>}
              </div>
            </div>

            <div className="dashboard-system-item">
              <div className="dashboard-system-info">
                <div className="dashboard-system-icon"><StarIcon /></div>
                <span className="dashboard-system-label">Catalog</span>
              </div>
              <span className="dashboard-system-value">{catalog.error ? "Offline" : catalog.total ? `${catalog.total} pets` : "Ready"}</span>
            </div>

            <div className="dashboard-system-item">
              <div className="dashboard-system-info">
                <div className="dashboard-system-icon"><ShieldIcon /></div>
                <span className="dashboard-system-label">Updates</span>
              </div>
              <StatusPill tone={updateStatus.state === "available" ? "orange" : "blue"}>
                {updateLabel}
              </StatusPill>
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-blue-100/30">
             <div className="flex items-center justify-between text-[10px] font-bold text-slatecopy uppercase tracking-wider">
               <span>Version</span>
               <span className="font-mono">{updateStatus.currentVersion}</span>
             </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function PlaceholderView({ route }: { route: "dashboard" }) {
  const meta = routeMetadata[route];
  return (
    <div className="grid grid-cols-1 w-full">
      <GlassCard className="flex flex-col items-center justify-center text-center py-16 px-8 h-full min-h-[420px]">
        <div className="p-4 rounded-3xl bg-blue-50/80 border border-blue-100/50 mb-6 text-brand">
          {route === "dashboard" && <DashboardIcon />}
        </div>
        <h2 className="font-monoDisplay text-2xl font-black mb-2 text-navy">{meta.title}</h2>
        <p className="text-sm text-slatecopy max-w-md mb-6">{meta.description}</p>
        <span className="inline-flex items-center rounded-full bg-blue-50/80 px-4 py-1.5 text-xs font-bold text-brand border border-blue-200/50">
          Coming Soon • Next Migration Target
        </span>
      </GlassCard>
    </div>
  );
}

const filterIcons: Record<Filter, React.ReactNode> = {
  all: <FilterAllIcon />,
  installed: <FilterInstalledIcon />,
  featured: <FilterFeaturedIcon />,
  originals: <FilterOriginalIcon />,
  codex: <FilterCodexIcon />,
};

const filterLabels: Record<Filter, string> = {
  all: "All",
  installed: "Installed",
  featured: "Featured",
  originals: "Originals",
  codex: "Codex",
};

const buttonVariantClass = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  success: "btn-success",
  warning: "btn-warning",
} as const;

const statusPillToneClass = {
  blue: "pill-blue",
  green: "pill-green",
  orange: "pill-orange",
  purple: "pill-purple",
  yellow: "pill-yellow",
  red: "pill-red",
  slate: "pill-slate",
} as const;

function isRoute(value: string | null | undefined): value is Route {
  return value === "dashboard" || value === "pets" || value === "settings" || value === "plugins" || value === "integrations";
}

function initialControlCenterRoute(): Route {
  try {
    const params = new URLSearchParams(window.location.search);
    const route = params.get("route");
    return isRoute(route) ? route : "dashboard";
  } catch {
    return "dashboard";
  }
}

const commandModeLabels: Record<AgentSetupSnapshot["commandMode"], string> = {
  published: "Published package",
  bundled: "Bundled desktop CLI",
  local: "Local development",
};

function Button({
  children,
  variant = "primary",
  size = "normal",
  onClick,
  disabled,
  icon,
  iconPosition = "left",
  fullWidth,
  ariaLabel,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "success" | "warning";
  size?: "normal" | "compact";
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      className={`btn ${buttonVariantClass[variant]} ${size === "compact" ? "btn-compact" : ""} ${fullWidth ? "w-full" : ""} ${icon ? "has-icon" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {icon && iconPosition === "left" && <span className="btn-icon-wrapper mr-1.5 inline-flex items-center justify-center">{icon}</span>}
      <span className="btn-text">{children}</span>
      {icon && iconPosition === "right" && <span className="btn-icon-wrapper ml-1.5 inline-flex items-center justify-center">{icon}</span>}
    </button>
  );
}
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={`glass ${className}`}>{children}</section>; }
function StatusPill({ children, tone = "blue" }: { children: React.ReactNode; tone?: keyof typeof statusPillToneClass }) { return <span className={`pill ${statusPillToneClass[tone]}`}>{children}</span>; }
function SearchInput(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input className="search" placeholder="Search pets..." {...props} />; }

function isAllowedCatalogPreview(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && 
      url.hostname === "openpets.dev" && 
      url.port === "" && 
      url.username === "" && 
      url.password === "" && 
      url.pathname.startsWith("/pets/") && 
      url.pathname.endsWith(".webp");
  } catch {
    return false;
  }
}

function isAllowedCodexPreview(value: string | undefined): value is string {
  return typeof value === "string" && /^openpets-codex:\/\/spritesheet\/[a-zA-Z0-9%][a-zA-Z0-9%_-]{0,128}$/u.test(value);
}

function isAllowedInstalledPetPreview(value: string | undefined): value is string {
  return typeof value === "string" && /^openpets-installed:\/\/spritesheet\/[a-zA-Z0-9%][a-zA-Z0-9%_-]{0,128}$/u.test(value);
}

function isAllowedDefaultPetPreview(value: string | undefined): value is string {
  return typeof value === "string" && /^openpets-pet-preview:\/\/spritesheet\/default\?v=[a-z0-9_-]+-\d+-\d+$/u.test(value);
}

function isAllowedDataUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^data:image\/(?:png|webp|jpeg|jpg);base64,[a-z0-9+/=]+$/iu.test(value);
}

function safePetImage(value: string | undefined): string | undefined {
  return isAllowedCatalogPreview(value) || isAllowedCodexPreview(value) || isAllowedInstalledPetPreview(value) || isAllowedDefaultPetPreview(value) || isAllowedDataUrl(value) ? value : undefined;
}

function installedPetSpritesheetUrl(petId: string): string {
  return `openpets-installed://spritesheet/${encodeURIComponent(petId)}`;
}

function imageDebug(value: string | undefined): string {
  if (!value) return "missing";
  if (value.startsWith("data:image/")) return `data:${value.slice(5, 16)}`;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

function logPetsEvent(event: string, fields: Record<string, unknown>): void {
  console.info(`[ControlCenterPets] ${JSON.stringify({ event, ...fields })}`);
}

function logPetsError(event: string, fields: Record<string, unknown>): void {
  console.error(`[ControlCenterPets] ${JSON.stringify({ event, ...fields })}`);
}

const spriteFrameSizes = {
  thumb: { width: 54, height: 58 },
  detail: { width: 144, height: 156 },
  mini: { width: 56, height: 61 },
} as const;

const spriteStates = {
  idle: { row: 0, frames: 6, duration: "1.65s" },
  thinking: { row: 8, frames: 6, duration: "1.55s" },
  wave: { row: 3, frames: 4, duration: "1.25s" },
  happy: { row: 4, frames: 5, duration: "1.35s" },
} as const;

function SpriteFrame({ src, label, state = "idle", size = "detail" }: { src?: string; label: string; state?: "idle" | "thinking" | "happy" | "wave"; size?: "thumb" | "detail" | "mini" }) {
  const safeSrc = safePetImage(src);
  if (!safeSrc) return <img src={defaultThumbUrl} alt="" />;
  const frame = spriteFrameSizes[size];
  const sprite = spriteStates[state];
  const xValues = Array.from({ length: sprite.frames }, (_, index) => String(-index * frame.width)).join(";");
  const y = -sprite.row * frame.height;
  return <svg className={`sprite-frame sprite-${state} sprite-${size}`} width={frame.width} height={frame.height} viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={label}>
    <image href={safeSrc} x="0" y={y} width={frame.width * 8} height={frame.height * 9} preserveAspectRatio="none" onError={() => logPetsError("sprite-failed", { label, state, size, src: imageDebug(safeSrc) })}>
      <animate attributeName="x" values={xValues} dur={sprite.duration} repeatCount="indefinite" calcMode="discrete" />
    </image>
  </svg>;
}

function PetImage({ src, alt = "", debugLabel }: { src?: string; alt?: string; debugLabel: string }) {
  const safeSrc = safePetImage(src) || defaultThumbUrl;
  return <img src={safeSrc} alt={alt} draggable="false" onError={() => logPetsError("image-failed", { label: debugLabel, src: imageDebug(safeSrc) })} />;
}

function ToggleRow({ title, description, checked, disabled, onChange }: { title: string; description: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className={`settings-row ${disabled ? "opacity-60" : ""}`}>
    <div className="settings-row-info"><strong>{title}</strong><small>{description}</small></div>
    <input className="settings-toggle" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

function formatUpdateStatus(status: UpdateStatus | null): string {
  if (!status) return "Update status has not loaded yet.";
  if (status.state === "checking") return "Checking for updates…";
  if (status.state === "available") return `Version ${status.latestVersion ?? "latest"} is available.`;
  if (status.state === "current") return `Up to date.`;
  if (status.state === "error") return status.error || "Update check failed.";
  return `Version: ${status.currentVersion}.`;
}

function ReactionPreviewSprite({ settings, state }: { settings: ReactionAnimationSettings; state: UserSelectableAnimationState }) {
  const frame = { width: settings.sprite.frameWidth, height: settings.sprite.frameHeight };
  const sprite = settings.sprite.states[state] ?? settings.sprite.states.idle;
  const xValues = Array.from({ length: sprite.frames }, (_, index) => String(-index * frame.width)).join(";");
  const y = -sprite.row * frame.height;

  return (
    <div className="reaction-preview-sprite-shell">
      <svg className="reaction-preview-sprite" width={frame.width} height={frame.height} viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={`Animation: ${state}`}>
        <image href={settings.previewSpriteUrl} x="0" y={y} width={frame.width * settings.sprite.columns} height={frame.height * settings.sprite.rows} preserveAspectRatio="none">
          <animate attributeName="x" values={xValues} dur={`${sprite.durationMs}ms`} repeatCount="indefinite" calcMode="discrete" />
        </image>
      </svg>
    </div>
  );
}

function SettingsView() {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [reactionSettings, setReactionSettings] = useState<ReactionAnimationSettings | null>(null);
  const [launchAtLogin, setLaunchAtLogin] = useState<LaunchAtLoginState | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "reactions">("general");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const reactionSaveQueue = useRef(Promise.resolve());

  async function loadSettings() {
    setError("");
    const [nextSettings, nextReactions, nextLaunch, nextUpdate] = await Promise.all([
      api.getSettingsState(),
      api.getReactionAnimationSettings(),
      api.getLaunchAtLogin(),
      api.getUpdateStatus(),
    ]);
    setSettings(nextSettings);
    setReactionSettings(nextReactions);
    setLaunchAtLogin(nextLaunch);
    setUpdateStatus(nextUpdate);
    if (nextUpdate.state === "checking") {
      void api.checkForUpdates().then(setUpdateStatus).catch((err) => setError(String(err?.message ?? err)));
    }
  }

  useEffect(() => { void loadSettings().catch((err) => setError(String(err?.message ?? err))); }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [message]);

  async function run(label: string, fn: () => Promise<void>) {
    try { setBusy(label); setError(""); setMessage(""); await fn(); }
    catch (err) { setError(String((err as Error)?.message ?? err)); }
    finally { setBusy(""); }
  }

  function patchPreferences(patch: Partial<SettingsState["preferences"]>, success: string) {
    void run("Saving", async () => {
      const next = await api.updatePreferences(patch);
      setSettings(next);
      if ("reactionAnimationOverrides" in patch) {
        setReactionSettings((current) => current ? { ...current, overrides: next.preferences.reactionAnimationOverrides ?? {} } : current);
      }
      setMessage(success);
    });
  }

  function updateReactionOverride(reaction: ReactionAnimationSettings["reactions"][number], value: UserSelectableAnimationState) {
    const queuedSave = reactionSaveQueue.current.catch(() => undefined).then(() => run("Saving", async () => {
      const latestReactions = await api.getReactionAnimationSettings();
      const nextOverrides = { ...(latestReactions.overrides ?? {}) };
      if (value === reaction.defaultAnimation) delete nextOverrides[reaction.id];
      else nextOverrides[reaction.id] = value;
      const nextSettings = await api.updatePreferences({ reactionAnimationOverrides: nextOverrides });
      setSettings(nextSettings);
      setReactionSettings({ ...latestReactions, overrides: nextSettings.preferences.reactionAnimationOverrides ?? {} });
      setMessage("Reaction animation saved.");
    }));
    reactionSaveQueue.current = queuedSave;
    void queuedSave;
  }

  const overrides = settings?.preferences.reactionAnimationOverrides ?? {};

  return <div className="settings-layout">
    {error && <div className="error settings-message">{error}</div>}
    {message && <div className="settings-success settings-message">{message}</div>}

    <div className="settings-container">
      <aside className="settings-sidebar">
        <button className={`settings-nav-item ${activeTab === "general" ? "active" : ""}`} onClick={() => setActiveTab("general")}>
          <SettingsIcon />
          <span>General</span>
        </button>
        <button className={`settings-nav-item ${activeTab === "reactions" ? "active" : ""}`} onClick={() => setActiveTab("reactions")}>
          <PetsIcon />
          <span>Reaction Mapping</span>
        </button>
      </aside>

      <main className="settings-content">
        {activeTab === "general" && (
          <div className="settings-section">
            <p className="eyebrow">Environment</p>
            <h2 className="settings-section-title">General Settings</h2>

            <div className="settings-group">
              <ToggleRow
                title="Show pet on launch"
                description="Keep OpenPets in the tray but hide the pet until requested."
                checked={settings?.preferences.openDefaultPetOnLaunch ?? false}
                disabled={!settings || !!busy}
                onChange={(checked) => patchPreferences({ openDefaultPetOnLaunch: checked }, "Startup preference saved.")}
              />
              <ToggleRow
                title="Launch at login"
                description={launchAtLogin?.supported ? "Start OpenPets automatically when your computer starts." : "Not supported on this platform."}
                checked={launchAtLogin?.enabled ?? false}
                disabled={!launchAtLogin?.supported || !!busy}
                onChange={(checked) => void run("Saving", async () => { setLaunchAtLogin(await api.setLaunchAtLogin(checked)); setMessage("Login startup preference saved."); })}
              />
              <div className="settings-row">
                <div className="settings-row-info">
                  <strong>Pet scale</strong>
                  <small>Adjust how large the default desktop pet appears.</small>
                </div>
                <select className="settings-select" value={settings?.preferences.petScale ?? ""} disabled={!settings || !!busy} onChange={(event) => patchPreferences({ petScale: Number(event.target.value) }, "Pet scale saved.")}>
                  {(settings?.petScaleOptions ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="settings-row">
                <div className="settings-row-info">
                  <strong>Claude quota display</strong>
                  <small>Show your Claude Code subscription usage on the desktop pet.</small>
                </div>
                <select
                  className="settings-select"
                  value={settings?.preferences.quotaDisplayMode ?? "off"}
                  disabled={!settings || !!busy}
                  onChange={(event) => patchPreferences({ quotaDisplayMode: event.target.value as QuotaDisplayMode }, "Quota display saved.")}
                >
                  <option value="off">Off</option>
                  <option value="speech">Speech bubble</option>
                  <option value="label">Always-on label</option>
                  <option value="mood">Pet mood</option>
                </select>
              </div>
            </div>

            <div className="settings-actions">
              <Button variant="secondary" size="compact" disabled={!!busy} onClick={() => void run("Resetting", async () => { setSettings(await api.resetDefaultPetPosition()); setMessage("Default pet position reset."); })}>Reset Pet Position</Button>
            </div>

            <div className="settings-system-footer">
              <div className="settings-system-info">
                <RefreshIcon />
                <span>System Status</span>
                <span className="settings-system-version">{updateStatus?.currentVersion}</span>
                <span className="opacity-60">{formatUpdateStatus(updateStatus)}</span>
              </div>
              <div className="flex gap-2">
                {updateStatus?.state === "available" && (
                  <Button variant="primary" size="compact" disabled={!!busy} onClick={() => void run("Opening", async () => { await api.openUpdateReleasePage(); })}>Update Available</Button>
                )}
                <Button variant="secondary" size="compact" disabled={!!busy || updateStatus?.state === "checking"} onClick={() => void run("Checking", async () => { setUpdateStatus(await api.checkForUpdates()); })}>
                  {busy === "Checking" ? "Checking…" : "Check for Updates"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "reactions" && (
          <div className="settings-section">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Behavior</p>
                <h2 className="settings-section-title">Reaction Mapping</h2>
              </div>
              <Button variant="secondary" size="compact" disabled={!settings || !!busy || !Object.keys(overrides).length} onClick={() => patchPreferences({ reactionAnimationOverrides: {} }, "Reaction animations reset.")}>Reset to Defaults</Button>
            </div>
            <p className="text-sm text-slatecopy -mt-2 mb-2">Customize which animation plays for each agent reaction. Previews use the default pet.</p>

            <div className="settings-group">
              <div className="reaction-grid">
                {(reactionSettings?.reactions ?? []).map((reaction) => {
                  const currentAnimation = overrides[reaction.id] ?? reaction.defaultAnimation;
                  return (
                    <div className="reaction-row" key={reaction.id}>
                      <div className="reaction-preview-box">
                        {reactionSettings?.previewSpriteUrl && (
                          <ReactionPreviewSprite settings={reactionSettings} state={currentAnimation} />
                        )}
                      </div>
                      <div className="reaction-info">
                        <strong>{reaction.label}</strong>
                        <small>{reaction.description}</small>
                      </div>
                      <select
                        className="settings-select"
                        value={currentAnimation}
                        disabled={!reactionSettings || !settings || !!busy}
                        onChange={(event) => {
                          const value = event.target.value as UserSelectableAnimationState;
                          updateReactionOverride(reaction, value);
                        }}
                      >
                        {(reactionSettings?.animations ?? []).map((animation) => (
                          <option key={animation.id} value={animation.id}>{animation.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  </div>;
}

const pluginFilterLabels: Record<PluginFilter, string> = {
  all: "All",
  installed: "Installed",
  catalog: "Catalog",
  local: "Local / Dev",
  broken: "Broken",
};

const pluginPermissionLabels: Record<PluginPermission, string> = {
  "pet:speak": "Speech",
  "pet:reaction": "Reactions",
  "pet:move": "Movement",
  timer: "Timers",
  schedule: "Schedule",
  storage: "Storage",
  status: "Status",
  commands: "Commands",
  network: "Network",
};

const pluginStatusTone: Record<NonNullable<PluginStatus["tone"]>, keyof typeof statusPillToneClass> = {
  info: "blue",
  success: "green",
  warning: "orange",
  error: "red",
};

function PluginGlyph({ className = "plugin-glyph" }: { className?: string }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 3 6.5l9 4.5 9-4.5z" />
    <path d="m3 12 9 4.5 9-4.5" />
    <path d="m3 17.5 9 4.5 9-4.5" />
  </svg>;
}

function PluginIcon({ icon = "plugin", className = "plugin-glyph" }: { icon?: PluginIconName; className?: string }) {
  if (icon === "bell") return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6M9 17v1a3 3 0 0 0 6 0v-1" />
  </svg>;
  if (icon === "timer") return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0" />
    <path d="M12 7v5l3 3" />
  </svg>;
  if (icon === "github") return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 19c-4.3 1.4-4.3-2.5-6-3" />
    <path d="M15 21v-3.5c0-1 .1-1.4-.5-2c2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2a4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6c-.6.6-.6 1.2-.5 2V21" />
  </svg>;
  if (icon === "heart") return <HeartIcon />;
  if (icon === "sparkles") return <StarIcon />;
  if (icon === "coffee") return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 2v2" /><path d="M14 2v2" /><path d="M16 8h1a4 4 0 0 1 0 8h-1" /><path d="M6 8h10v7a5 5 0 0 1-5 5h0a5 5 0 0 1-5-5Z" /><path d="M4 22h14" />
  </svg>;
  if (icon === "focus") return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </svg>;
  return <PluginGlyph className={className} />;
}

function pluginIcon(entry: PluginEntry): PluginIconName {
  return entry.installed?.icon || entry.catalog?.icon || "plugin";
}

function pluginName(entry: PluginEntry): string {
  return entry.installed?.name || entry.catalog?.name || entry.id;
}

function pluginDescription(entry: PluginEntry): string {
  if (entry.installed?.brokenReason) return entry.installed.brokenReason;
  return entry.installed?.description || entry.catalog?.description || (entry.installed ? "Installed plugin ready for configuration." : "Available from the plugin catalog.");
}

function pluginPrimaryTone(entry: PluginEntry): keyof typeof statusPillToneClass {
  if (entry.installed?.brokenReason) return "red";
  if (entry.installed?.catalogDisabled) return "orange";
  if (entry.installed?.enabled) return "green";
  if (entry.installed) return "slate";
  return "blue";
}

function pluginPrimaryLabel(entry: PluginEntry): string {
  if (entry.installed?.brokenReason) return "Broken";
  if (entry.installed?.catalogDisabled) return "Catalog disabled";
  if (entry.installed?.enabled) return "Active";
  if (entry.installed) return "Disabled";
  return "Available";
}

function mergePluginEntries(snapshot: PluginServiceSnapshot | null, catalog: PluginCatalogSnapshot | null): PluginEntry[] {
  const merged = new Map<string, PluginEntry>();
  for (const installed of snapshot?.plugins ?? []) merged.set(installed.id, { id: installed.id, installed });
  for (const catalogPlugin of catalog?.plugins ?? []) {
    const current = merged.get(catalogPlugin.id) ?? { id: catalogPlugin.id };
    merged.set(catalogPlugin.id, { ...current, catalog: catalogPlugin });
  }
  return [...merged.values()].sort((a, b) => {
    const installedDelta = Number(Boolean(b.installed)) - Number(Boolean(a.installed));
    if (installedDelta) return installedDelta;
    return pluginName(a).localeCompare(pluginName(b));
  });
}

function initialConfigValue(field: PluginConfigField): unknown {
  if (field.default !== undefined) return field.default;
  if (field.type === "boolean") return false;
  if (field.type === "number") return field.min ?? 0;
  if (field.type === "multiSelect" || field.type === "list") return [];
  return "";
}

function materializeListItemDefaults(schema: PluginConfigSchema, value: Record<string, unknown> = {}): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema)) next[key] = materializeConfigValue(field, value[key]);
  return next;
}

function materializeConfigValue(field: PluginConfigField, value: unknown): unknown {
  if (field.type === "list" && field.itemSchema) {
    const items = Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item)) : [];
    return items.map((item) => materializeListItemDefaults(field.itemSchema ?? {}, item));
  }
  return value ?? initialConfigValue(field);
}

function materializeConfigDraft(schema: PluginConfigSchema | undefined, config: PluginConfig | undefined): PluginConfig {
  const next: PluginConfig = {};
  for (const [key, field] of Object.entries(schema ?? {})) next[key] = materializeConfigValue(field, config?.[key]);
  return next;
}

function ConfigFieldEditor({ pluginId, fieldKey, field, value, onChange }: { pluginId?: string; fieldKey: string; field: PluginConfigField; value: unknown; onChange: (value: unknown) => void }) {
  const label = field.label || fieldKey;
  const description = field.description;
  const textValue = typeof value === "string" ? value : typeof field.default === "string" ? field.default : "";

  if (field.type === "boolean") {
    return <label className="plugin-config-row plugin-config-row-boolean">
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <input className="settings-toggle" type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
    </label>;
  }

  if (field.type === "list" && field.itemSchema) {
    const items = Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item)) : [];
    const maxed = typeof field.maxItems === "number" && items.length >= field.maxItems;

    const isReminders = (pluginId === "openpets.break-buddy" || fieldKey === "reminders") && ["reminders", "breaks"].includes(fieldKey);
    const addLabel = isReminders ? "Add reminder" : "Add item";

    return <div className="plugin-config-row">
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <div className="plugin-list-editor">
        {items.map((item, index) => {
          let itemTitle = `Item ${index + 1}`;
          let removeLabel = "Remove";

          if (isReminders) {
            removeLabel = "Remove reminder";
            const id = String(item.id || "").trim();
            const scheduleType = item.scheduleType;
            if (scheduleType === "daily") {
              const time = String(item.time || "09:00");
              itemTitle = `${id || "Reminder"} · Daily at ${time}`;
            } else if (scheduleType === "interval") {
              const mins = Number(item.intervalMinutes) || 60;
              itemTitle = `${id || "Reminder"} · Every ${mins} min`;
            } else if (id) {
              itemTitle = id;
            }
          }

          const schemaEntries = Object.entries(field.itemSchema ?? {});
          const messageField = schemaEntries.find(([k]) => k === "message");
          const scheduleFields = schemaEntries.filter(([k]) => ["scheduleType", "time", "days", "intervalMinutes"].includes(k));
          const behaviorFields = schemaEntries.filter(([k]) => ["id", "enabled", "reaction"].includes(k));
          const otherFields = schemaEntries.filter(([k]) => !["message", "scheduleType", "time", "days", "intervalMinutes", "id", "enabled", "reaction"].includes(k));

          const renderField = ([childKey, childField]: [string, PluginConfigField]) => {
            if (isReminders) {
              const scheduleType = item.scheduleType;
              if (scheduleType === "daily" && childKey === "intervalMinutes") return null;
              if (scheduleType === "interval" && (childKey === "time" || childKey === "days")) return null;
            }
            return <ConfigFieldEditor key={childKey} pluginId={pluginId} fieldKey={childKey} field={childField} value={item[childKey] ?? initialConfigValue(childField)} onChange={(nextValue) => onChange(items.map((existing, itemIndex) => itemIndex === index ? { ...existing, [childKey]: nextValue } : existing))} />;
          };

          return (
            <div className="plugin-list-item" key={index}>
              <div className="plugin-list-item-header">
                <span className="truncate mr-2">{itemTitle}</span>
                <Button variant="danger" size="compact" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>{removeLabel}</Button>
              </div>
              <div className="flex flex-col gap-3">
                {isReminders ? (
                  <>
                    {behaviorFields.length > 0 && (
                      <div className="plugin-config-group">
                        <div className="plugin-config-group-title">Identity & Behavior</div>
                        {behaviorFields.map(renderField)}
                      </div>
                    )}
                    {messageField && (
                      <div className="plugin-config-group">
                        <div className="plugin-config-group-title">Message</div>
                        {renderField(messageField)}
                      </div>
                    )}
                    {scheduleFields.length > 0 && (
                      <div className="plugin-config-group">
                        <div className="plugin-config-group-title">Schedule</div>
                        {scheduleFields.map(renderField)}
                      </div>
                    )}
                    {otherFields.map(renderField)}
                  </>
                ) : (
                  schemaEntries.map(renderField)
                )}
              </div>
            </div>
          );
        })}
        <Button variant="secondary" size="compact" disabled={maxed} onClick={() => onChange([...items, materializeListItemDefaults(field.itemSchema ?? {})])}>{addLabel}</Button>
      </div>
    </div>;
  }

  return <label className="plugin-config-row">
    <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
    {field.type === "textarea" ? (
      <textarea className="plugin-input plugin-textarea" value={textValue} maxLength={field.maxLength} onChange={(event) => onChange(event.target.value)} />
    ) : field.type === "select" ? (
      <select className="settings-select plugin-select" value={textValue} onChange={(event) => onChange(event.target.value)}>
        {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}
      </select>
    ) : field.type === "multiSelect" ? (
      <span className="plugin-chip-list">
        {(field.options ?? []).map((option) => {
          const selected = Array.isArray(value) && value.includes(option.value);
          return <button type="button" key={option.value} className={`plugin-chip ${selected ? "active" : ""}`} onClick={() => {
            const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
            onChange(selected ? current.filter((item) => item !== option.value) : [...current, option.value]);
          }}>{option.label || option.value}</button>;
        })}
      </span>
    ) : (
      <input className="plugin-input" type={field.type === "number" ? "number" : field.type === "time" ? "time" : "text"} value={field.type === "number" && typeof value === "number" ? String(value) : textValue} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength} onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)} />
    )}
  </label>;
}

function PathField({ label, value, placeholder, onSave, disabled }: { label: string; value: string; placeholder: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-slatecopy uppercase tracking-wider">{label}</label>
      <div className="flex gap-2">
        <input
          className="plugin-input flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button variant="secondary" size="compact" icon={<SaveIcon />} disabled={disabled || draft === value} onClick={() => onSave(draft)}>Save</Button>
      </div>
    </div>
  );
}

function IntegrationIcon({ id }: { id: string }) {
  const logos: Record<string, string> = {
    claude: claudeLogoUrl,
    opencode: opencodeLogoUrl,
    cursor: cursorLogoUrl,
    pi: piLogoUrl,
    vscode: vscodeLogoUrl,
    windsurf: windsurfLogoUrl,
    zed: zedLogoUrl,
  };
  const src = logos[id];
  if (src) return <img src={src} className="integration-logo" alt="" draggable="false" />;
  return <PluginGlyph />;
}

function claudeStatusTone(state: ClaudeCodeStatus["state"]): StatusTone {
  if (state === "configured") return "green";
  if (state === "error") return "red";
  if (state === "needs_setup" || state === "detected") return "blue";
  return "slate";
}

function opencodeStatusTone(state: OpenCodeSetupStatus["state"]): StatusTone {
  if (state === "configured") return "green";
  if (state === "error") return "red";
  if (state === "needs_setup") return "blue";
  return "slate";
}

function cursorStatusTone(state: CursorSetupStatus["state"]): StatusTone {
  if (state === "configured") return "green";
  if (state === "error" || state === "conflict") return "red";
  if (state === "needs_update") return "orange";
  if (state === "needs_setup") return "blue";
  return "slate";
}

function IntegrationsView() {
  const [snapshot, setSnapshot] = useState<AgentSetupSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async (selectedPetId?: string, commandMode?: AgentSetupSnapshot["commandMode"]) => {
    try {
      const petId = selectedPetId === undefined ? snapshot?.selectedPetId : selectedPetId;
      const mode = commandMode === undefined ? snapshot?.commandMode : commandMode;
      const next = await api.getIntegrationsState(petId, mode);
      setSnapshot(next);
      setError("");
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const run = async (label: string, action: AgentSetupAction) => {
    try {
      setBusy(label);
      setError("");
      setMessage("");
      const next = await api.runIntegrationAction(action, snapshot?.selectedPetId, snapshot?.commandMode);
      setSnapshot(next);
      if (next.lastAction) {
        if (next.lastAction.ok) setMessage(next.lastAction.message);
        else setError(next.lastAction.message);
      }
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setBusy("");
    }
  };

  const updatePath = async (key: keyof AgentSetupCommandPaths, value: string) => {
    try {
      setBusy("Saving path");
      await api.updateIntegrationCommandPaths({ [key]: value });
      await load();
      setMessage("Path saved.");
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setBusy("");
    }
  };

  const changeCommandMode = (mode: AgentSetupSnapshot["commandMode"]) => {
    void load(snapshot?.selectedPetId, mode);
  };

  if (!snapshot) {
    return (
      <GlassCard className="flex h-64 flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm font-semibold text-slatecopy">{error || "Loading integrations…"}</p>
        {error && <Button variant="secondary" size="compact" icon={<RefreshIcon />} onClick={() => void load()}>Retry</Button>}
      </GlassCard>
    );
  }

  const isBusy = Boolean(busy) || snapshot.busy;
  const integrationDialogTitleId = selectedId ? `integration-detail-title-${selectedId}` : undefined;

  const integrations = [
    { id: "claude", name: "Claude Code", icon: "claude", status: snapshot.status.label, tone: claudeStatusTone(snapshot.status.state), description: "Connect Claude Code to your OpenPets companion." },
    { id: "opencode", name: "OpenCode", icon: "opencode", status: snapshot.opencodeStatus.label, tone: opencodeStatusTone(snapshot.opencodeStatus.state), description: "Connect OpenCode globally to your OpenPets companion." },
    { id: "cursor", name: "Cursor", icon: "cursor", status: snapshot.cursorStatus.label, tone: cursorStatusTone(snapshot.cursorStatus.state), description: "Connect Cursor to your OpenPets companion via global MCP config." },
    { id: "pi", name: "Pi", icon: "pi", status: "Manual", tone: "blue" satisfies StatusTone, description: "Connect Pi coding-agent activity through the OpenPets Pi extension package." },
  ] as const;

  const soon = [
    { name: "VS Code", icon: "vscode" },
    { name: "Windsurf", icon: "windsurf" },
    { name: "Zed", icon: "zed" },
  ];

  const selectedIntegrationName = selectedId === "pi" ? "Pi" : integrations.find((item) => item.id === selectedId)?.name;

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pr-2">
      {error && <div className="error">{error}</div>}
      {message && <div className="settings-success settings-message">{message}</div>}

      <div className="integration-grid">
        {integrations.map((item) => (
          <article key={item.id} className={`integration-card ${selectedId === item.id ? "border-brand ring-4 ring-brand/15" : ""}`}>
            <div className="plugin-card-body">
              <div className="integration-icon">
                <IntegrationIcon id={item.icon} />
              </div>
              <div className="plugin-card-content">
                <div className="flex items-center justify-between">
                  <strong>{item.name}</strong>
                  <StatusPill tone={item.tone}>{item.status}</StatusPill>
                </div>
                <small>{item.description}</small>
              </div>
            </div>
            <div className="plugin-card-footer">
              <div className="flex gap-2 w-full">
                {item.id === "claude" && snapshot.status.canConfigure && <Button variant="primary" size="compact" icon={<InstallIcon />} disabled={isBusy} onClick={() => run("Installing", "configure")}>Install</Button>}
                {item.id === "opencode" && snapshot.opencodeStatus.canInstall && <Button variant="primary" size="compact" icon={<InstallIcon />} disabled={isBusy} onClick={() => run("Installing", "opencode-install")}>Install</Button>}
                {item.id === "cursor" && snapshot.cursorStatus.canInstall && <Button variant="primary" size="compact" icon={<InstallIcon />} disabled={isBusy} onClick={() => run("Installing", "cursor-install")}>Install</Button>}
                <Button variant="secondary" size="compact" icon={<ConfigureIcon />} fullWidth={item.id === "pi"} onClick={() => setSelectedId(item.id)}>{item.id === "pi" ? "View Setup" : "Configure"}</Button>
              </div>
            </div>
          </article>
        ))}
        {soon.map((item) => (
          <article key={item.name} className="integration-card opacity-60">
            <div className="plugin-card-body">
              <div className="integration-icon grayscale">
                <IntegrationIcon id={item.icon} />
              </div>
              <div className="plugin-card-content">
                <div className="flex items-center justify-between">
                  <strong>{item.name}</strong>
                  <StatusPill tone="slate">Soon</StatusPill>
                </div>
                <small>Coming soon.</small>
              </div>
            </div>
            <div className="plugin-card-footer">
              <Button variant="secondary" size="compact" fullWidth disabled>Coming soon</Button>
            </div>
          </article>
        ))}
      </div>

      {selectedId && (
        <div className="plugin-config-overlay" role="dialog" aria-modal="true" aria-labelledby={integrationDialogTitleId}>
          <button className="plugin-config-backdrop" type="button" aria-label="Close integration detail" onClick={() => setSelectedId(null)} />
          <GlassCard className="plugin-inspector">
            <div className="plugin-inspector-head">
              <div className="plugin-inspector-icon">
                <IntegrationIcon id={selectedId} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="eyebrow">Integration Detail</p>
                <h2 id={integrationDialogTitleId}>{selectedIntegrationName}</h2>
              </div>
              <Button variant="secondary" size="compact" icon={<CloseIcon />} onClick={() => setSelectedId(null)}>Close</Button>
            </div>

            <div className="flex flex-col gap-5 mt-4">
              {selectedId !== "pi" && (
                <section className="plugin-section">
                  <div className="plugin-section-title"><small>Command Source</small><strong>CLI mode</strong></div>
                  <select className="settings-select w-full" value={snapshot.commandMode} disabled={isBusy} onChange={(event) => changeCommandMode(event.target.value as AgentSetupSnapshot["commandMode"])}>
                    <option value="published">{commandModeLabels.published}</option>
                    <option value="bundled">{commandModeLabels.bundled}</option>
                    <option value="local" disabled={!snapshot.localDevAvailable}>{commandModeLabels.local}{snapshot.localDevAvailable ? "" : " unavailable"}</option>
                  </select>
                  <p className="text-xs text-slatecopy mt-2">Use the published package for normal setup, bundled for the desktop app build, or local while developing OpenPets.</p>
                </section>
              )}

              {selectedId === "claude" && (
                <>
                  <section className="plugin-section">
                    <div className="plugin-section-title"><small>Connection</small><strong>Status & Routing</strong></div>
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-blue-50/50 border border-blue-100/50">
                      <div className="flex flex-col">
                        <strong className="text-sm text-navy">{snapshot.status.label}</strong>
                        <small className="text-xs text-slatecopy">{snapshot.status.details}</small>
                      </div>
                      <StatusPill tone={claudeStatusTone(snapshot.status.state)}>{snapshot.status.state}</StatusPill>
                    </div>
                    <div className="mt-2">
                      <label className="text-xs font-bold text-slatecopy uppercase tracking-wider mb-1 block">Pet Routing</label>
                      <select
                        className="settings-select w-full"
                        value={snapshot.selectedPetId || ""}
                        onChange={(e) => void load(e.target.value)}
                        disabled={isBusy}
                      >
                        <option value="">Default Pet</option>
                        {snapshot.petOptions.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                      </select>
                    </div>
                  </section>

                  <section className="plugin-section">
                    <div className="plugin-section-title"><small>Configuration</small><strong>Command Paths</strong></div>
                    <div className="flex flex-col gap-3">
                      <PathField label="Claude Command" value={snapshot.commandPaths.claude} placeholder="claude" onSave={(v) => updatePath("claude", v)} disabled={isBusy} />
                      <PathField label="Node.js Command" value={snapshot.commandPaths.node} placeholder="node" onSave={(v) => updatePath("node", v)} disabled={isBusy} />
                    </div>
                  </section>

                  <div className="grid grid-cols-2 gap-3">
                    <section className="plugin-section">
                      <div className="plugin-section-title"><small>Optional</small><strong>Claude Hooks</strong></div>
                      <div className="flex items-center justify-between mb-2">
                        <StatusPill tone={snapshot.hookStatus.status === "installed" ? "green" : "blue"}>{snapshot.hookStatus.status}</StatusPill>
                      </div>
                    <div className="flex flex-col gap-2">
                      <Button variant="primary" size="compact" icon={<HookIcon />} disabled={isBusy} onClick={() => run("Installing hooks", "install-hooks")}>Install Hooks</Button>
                      <Button variant="danger" size="compact" icon={<RemoveIcon />} disabled={isBusy || snapshot.hookStatus.status === "needs_setup"} onClick={() => run("Removing hooks", "uninstall-hooks")}>Remove Hooks</Button>
                    </div>
                  </section>
                  <section className="plugin-section">
                    <div className="plugin-section-title"><small>Included</small><strong>Instructions</strong></div>
                    <div className="flex items-center justify-between mb-2">
                      <StatusPill tone={snapshot.memoryStatus.state === "installed" ? "green" : "blue"}>{snapshot.memoryStatus.state}</StatusPill>
                    </div>
                    <Button variant="secondary" size="compact" icon={<MemoryIcon />} disabled={isBusy} onClick={() => run("Updating instructions", "install-memory")}>Update Instructions</Button>
                  </section>
                </div>

                <section className="plugin-section">
                  <div className="plugin-section-title"><small>Actions</small><strong>Management</strong></div>
                  <div className="grid grid-cols-2 gap-2">
                    {snapshot.status.canConfigure && <Button variant="primary" icon={<InstallIcon />} disabled={isBusy} onClick={() => run("Installing", "configure")}>Install MCP</Button>}
                    {snapshot.status.canReplace && <Button variant="warning" icon={<ReplaceIcon />} disabled={isBusy} onClick={() => run("Replacing", "replace")}>Replace MCP</Button>}
                    {snapshot.status.canRemove && <Button variant="danger" icon={<RemoveIcon />} disabled={isBusy} onClick={() => run("Removing", "remove")}>Remove MCP</Button>}
                    <Button variant="secondary" icon={<RefreshIcon />} disabled={isBusy} onClick={() => void load()}>Refresh Status</Button>
                  </div>
                </section>


                  <details className="plugin-section group">
                    <summary className="cursor-pointer list-none flex items-center justify-between">
                      <div className="plugin-section-title"><small>Advanced</small><strong>MCP JSON Preview</strong></div>
                      <span className="text-brand group-open:rotate-180 transition-transform"><NextIcon /></span>
                    </summary>
                    <pre className="mt-3 p-3 rounded-xl bg-navy/5 text-[10px] font-mono overflow-x-auto border border-navy/5">
                      {JSON.stringify(snapshot.preview.mcpJson, null, 2)}
                    </pre>
                  </details>

                </>
              )}

              {selectedId === "opencode" && (
                <>
                  <section className="plugin-section">
                    <div className="plugin-section-title"><small>Connection</small><strong>Global Setup</strong></div>
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-blue-50/50 border border-blue-100/50">
                      <div className="flex flex-col">
                        <strong className="text-sm text-navy">{snapshot.opencodeStatus.label}</strong>
                        <small className="text-xs text-slatecopy">{snapshot.opencodeStatus.details}</small>
                      </div>
                      <StatusPill tone={opencodeStatusTone(snapshot.opencodeStatus.state)}>{snapshot.opencodeStatus.state}</StatusPill>
                    </div>
                    <div className="mt-2">
                      <label className="text-xs font-bold text-slatecopy uppercase tracking-wider mb-1 block">Pet Routing</label>
                      <select
                        className="settings-select w-full"
                        value={snapshot.selectedPetId || ""}
                        onChange={(e) => void load(e.target.value)}
                        disabled={isBusy}
                      >
                        <option value="">Default Pet</option>
                        {snapshot.petOptions.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                      </select>
                    </div>
                  </section>

                  <section className="plugin-section">
                    <div className="plugin-section-title"><small>Configuration</small><strong>Command Paths</strong></div>
                    <div className="flex flex-col gap-3">
                      <PathField label="OpenCode Command" value={snapshot.commandPaths.opencode} placeholder="opencode" onSave={(v) => updatePath("opencode", v)} disabled={isBusy} />
                      <PathField label="Node.js Command" value={snapshot.commandPaths.node} placeholder="node" onSave={(v) => updatePath("node", v)} disabled={isBusy} />
                    </div>
                  </section>

                  <section className="plugin-section">
                    <div className="plugin-section-title"><small>Actions</small><strong>Management</strong></div>
                    <div className="grid grid-cols-2 gap-2">
                      {snapshot.opencodeStatus.canInstall && <Button variant="primary" icon={<InstallIcon />} disabled={isBusy} onClick={() => run("Installing", "opencode-install")}>Install Global</Button>}
                      {snapshot.opencodeStatus.canRemove && <Button variant="danger" icon={<RemoveIcon />} disabled={isBusy} onClick={() => run("Removing", "opencode-remove")}>Remove Global</Button>}
                      <Button variant="secondary" icon={<RefreshIcon />} disabled={isBusy} onClick={() => void load()}>Refresh Status</Button>
                    </div>
                  </section>

                  <details className="plugin-section group">
                    <summary className="cursor-pointer list-none flex items-center justify-between">
                      <div className="plugin-section-title"><small>Advanced</small><strong>Config Preview</strong></div>
                      <span className="text-brand group-open:rotate-180 transition-transform"><NextIcon /></span>
                    </summary>
                    <pre className="mt-3 p-3 rounded-xl bg-navy/5 text-[10px] font-mono overflow-x-auto border border-navy/5">
                      {JSON.stringify(snapshot.opencodePreview.configPreview, null, 2)}
                    </pre>
                  </details>
                </>
              )}

              {selectedId === "cursor" && (
                <>
                  <section className="plugin-section">
                    <div className="plugin-section-title"><small>Connection</small><strong>Global MCP</strong></div>
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-blue-50/50 border border-blue-100/50">
                      <div className="flex flex-col">
                        <strong className="text-sm text-navy">{snapshot.cursorStatus.label}</strong>
                        <small className="text-xs text-slatecopy">{snapshot.cursorStatus.details}</small>
                      </div>
                      <StatusPill tone={cursorStatusTone(snapshot.cursorStatus.state)}>{snapshot.cursorStatus.state}</StatusPill>
                    </div>
                    <div className="mt-2">
                      <label className="text-xs font-bold text-slatecopy uppercase tracking-wider mb-1 block">Pet Routing</label>
                      <select
                        className="settings-select w-full"
                        value={snapshot.selectedPetId || ""}
                        onChange={(e) => void load(e.target.value)}
                        disabled={isBusy}
                      >
                        <option value="">Default Pet</option>
                        {snapshot.petOptions.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                      </select>
                    </div>
                  </section>

                  <section className="plugin-section">
                    <div className="plugin-section-title"><small>Actions</small><strong>Management</strong></div>
                    <div className="grid grid-cols-2 gap-2">
                      {snapshot.cursorStatus.canInstall && <Button variant="primary" icon={<InstallIcon />} disabled={isBusy} onClick={() => run("Installing", "cursor-install")}>Install MCP</Button>}
                      {snapshot.cursorStatus.canReplace && <Button variant="warning" icon={<ReplaceIcon />} disabled={isBusy} onClick={() => run("Replacing", "cursor-replace")}>Replace MCP</Button>}
                      {snapshot.cursorStatus.canRemove && <Button variant="danger" icon={<RemoveIcon />} disabled={isBusy} onClick={() => run("Removing", "cursor-remove")}>Remove MCP</Button>}
                      <Button variant="secondary" icon={<RefreshIcon />} disabled={isBusy} onClick={() => void load()}>Refresh Status</Button>
                    </div>
                  </section>


                  <details className="plugin-section group">
                    <summary className="cursor-pointer list-none flex items-center justify-between">
                      <div className="plugin-section-title"><small>Advanced</small><strong>MCP Entry Preview</strong></div>
                      <span className="text-brand group-open:rotate-180 transition-transform"><NextIcon /></span>
                    </summary>
                    <pre className="mt-3 p-3 rounded-xl bg-navy/5 text-[10px] font-mono overflow-x-auto border border-navy/5">
                      {JSON.stringify({ mcpServers: snapshot.cursorPreview.mcpEntry }, null, 2)}
                    </pre>
                  </details>

                  <details className="plugin-section group">
                    <summary className="cursor-pointer list-none flex items-center justify-between">
                      <div className="plugin-section-title"><small>Advanced</small><strong>Rules Preview</strong></div>
                      <span className="text-brand group-open:rotate-180 transition-transform"><NextIcon /></span>
                    </summary>
                    <p className="mt-3 text-xs text-slatecopy">{snapshot.cursorPreview.rulesPath}</p>
                    <pre className="mt-3 p-3 rounded-xl bg-navy/5 text-[10px] font-mono overflow-x-auto border border-navy/5">
                      {snapshot.cursorPreview.rulesContent}
                    </pre>
                  </details>
                </>
              )}

              {selectedId === "pi" && (
                <section className="plugin-section">
                  <div className="plugin-section-title"><small>Manual Setup</small><strong>Pi Extension</strong></div>
                  <p className="text-sm text-slatecopy leading-relaxed">
                    Install the OpenPets Pi extension from Pi, then use the slash commands inside a Pi session.
                  </p>
                  <div className="mt-3 p-4 rounded-2xl bg-navy/5 border border-navy/5 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slatecopy uppercase tracking-wider">Global install</span>
                      <code className="bg-white px-2 py-1 rounded border border-blue-100 text-brand text-xs">pi install npm:@open-pets/pi</code>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slatecopy uppercase tracking-wider">Project install</span>
                      <code className="bg-white px-2 py-1 rounded border border-blue-100 text-brand text-xs">pi install -l npm:@open-pets/pi</code>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slatecopy uppercase tracking-wider">Remove</span>
                      <code className="bg-white px-2 py-1 rounded border border-blue-100 text-brand text-xs">pi remove npm:@open-pets/pi</code>
                    </div>
                  </div>
                  <div className="mt-3 p-4 rounded-2xl bg-blue-50/50 border border-blue-100/60 flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-slatecopy uppercase tracking-wider">Slash commands</span>
                    <code className="bg-white px-2 py-1 rounded border border-blue-100 text-brand text-xs">/openpets status</code>
                    <code className="bg-white px-2 py-1 rounded border border-blue-100 text-brand text-xs">/openpets test</code>
                    <code className="bg-white px-2 py-1 rounded border border-blue-100 text-brand text-xs">/openpets react &lt;reaction&gt;</code>
                    <code className="bg-white px-2 py-1 rounded border border-blue-100 text-brand text-xs">/openpets say &lt;message&gt;</code>
                  </div>
                  <p className="text-xs text-slatecopy mt-2">
                    Use global install for all Pi workspaces, or project install when you only want OpenPets in the current project.
                  </p>
                </section>
              )}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

function PluginsView() {
  const [snapshot, setSnapshot] = useState<PluginServiceSnapshot | null>(null);
  const [catalog, setCatalog] = useState<PluginCatalogSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<PluginFilter>("all");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [configDraft, setConfigDraft] = useState<PluginConfig>({});

  async function load(refreshCatalog = false, clearMessages = true) {
    if (clearMessages) setError("");
    const [nextSnapshot, nextCatalog] = await Promise.all([
      api.getPluginsSnapshot(),
      api.getPluginCatalogSnapshot(refreshCatalog).catch(() => ({ plugins: [] } as PluginCatalogSnapshot)),
    ]);
    setSnapshot(nextSnapshot);
    setCatalog(nextCatalog);
    const entries = mergePluginEntries(nextSnapshot, nextCatalog);
    setSelectedId((current) => entries.some((entry) => entry.id === current) ? current : "");
  }

  useEffect(() => { void load().catch((err) => setError(String(err?.message ?? err))); }, []);
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const entries = useMemo(() => mergePluginEntries(snapshot, catalog), [snapshot, catalog]);
  const selected = entries.find((entry) => entry.id === selectedId);
  const installed = selected?.installed;
  const catalogPlugin = selected?.catalog;
  const hasConfigFields = Boolean(installed?.configSchema && Object.keys(installed.configSchema).length > 0);

  useEffect(() => { setConfigDraft(materializeConfigDraft(installed?.configSchema, installed?.effectiveConfig)); }, [installed?.id, installed?.configSchema, installed?.effectiveConfig]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (filter === "installed" && !entry.installed) return false;
      if (filter === "catalog" && entry.installed) return false;
      if (filter === "local" && entry.installed?.source !== "local") return false;
      if (filter === "broken" && !entry.installed?.brokenReason) return false;
      return true;
    });
  }, [entries, filter]);

  async function run(label: string, fn: () => Promise<void>) {
    try { setBusy(label); setError(""); setMessage(""); await fn(); }
    catch (err) { setError(String((err as Error)?.message ?? err)); }
    finally { setBusy(""); }
  }

  function applyResult(result: PluginServiceResult, success?: string) {
    setSnapshot(result.snapshot);
    if (!result.ok) { setError(result.error); return false; }
    if (success) setMessage(success);
    return true;
  }

  function updateDraft(key: string, value: unknown) {
    setConfigDraft((current) => ({ ...current, [key]: value }));
  }

  async function installCatalogEntry(entry: PluginEntry) {
    const result = await api.installCatalogPlugin(entry.id);
    if (!applyResult(result)) return;
    const installedPlugin = result.snapshot.plugins.find((plugin) => plugin.id === entry.id);
    if (!installedPlugin) { setMessage("No plugin installed."); return; }
    await load(false, false);
    setMessage("Plugin installed.");
  }

  async function updateCatalogEntry(plugin: SafePluginRecord) {
    const previousVersion = plugin.version;
    const result = await api.updateCatalogPlugin(plugin.id);
    if (!applyResult(result)) return;
    const updatedPlugin = result.snapshot.plugins.find((nextPlugin) => nextPlugin.id === plugin.id);
    setMessage(updatedPlugin && updatedPlugin.version !== previousVersion ? "Plugin updated." : "No plugin update applied.");
  }

  return (
    <div className="plugins-layout">
      {error && <div className="error settings-message">{error}</div>}
      {message && <div className="settings-success settings-message">{message}</div>}
      <GlassCard className="plugins-hub">
        <div className="filters">
          {(["all", "installed", "catalog", "local", "broken"] as PluginFilter[]).map((nextFilter) => (
            <button key={nextFilter} className={`filter ${filter === nextFilter ? "active" : ""}`} onClick={() => setFilter(nextFilter)}>{pluginFilterLabels[nextFilter]}</button>
          ))}
        </div>
        <div className="plugin-grid">
          {filteredEntries.map((entry) => (
            <article key={entry.id} className={`plugin-card ${entry.installed?.brokenReason ? "broken" : ""}`}>
              <div className="plugin-card-body">
                <span className="plugin-card-icon"><PluginIcon icon={pluginIcon(entry)} /></span>
                <div className="plugin-card-content">
                  <strong>{pluginName(entry)}</strong>
                  <small>{pluginDescription(entry)}</small>
                  <div className="badges mt-1">
                    <StatusPill tone={pluginPrimaryTone(entry)}>{pluginPrimaryLabel(entry)}</StatusPill>
                    {entry.installed?.bundled && <StatusPill tone="blue">Bundled</StatusPill>}
                    {entry.installed?.source === "local" && <StatusPill tone="orange">Local</StatusPill>}
                    {entry.installed?.runtime === "javascript" || entry.catalog?.runtime === "javascript" ? <StatusPill tone="purple">JS</StatusPill> : <StatusPill tone="slate">Declarative</StatusPill>}
                  </div>
                </div>
              </div>

              <div className="plugin-card-footer">
                <div className="plugin-card-meta">
                  <span className="text-[10px] font-bold text-slatecopy/50 uppercase tracking-tight">v{entry.installed?.version || entry.catalog?.version}</span>
                </div>

                <div className="plugin-card-actions">
                  {entry.installed && (
                    <div className="plugin-card-toggle-zone">
                      <span className="plugin-card-toggle-label">{entry.installed.enabled ? "Active" : "Off"}</span>
                      <input
                        className="settings-toggle plugin-card-toggle"
                        type="checkbox"
                        checked={entry.installed.enabled}
                        disabled={!!busy || entry.installed.catalogDisabled || Boolean(entry.installed.brokenReason)}
                        onChange={(event) => void run("Saving", async () => {
                          applyResult(await api.setPluginEnabled(entry.id, event.target.checked), event.target.checked ? "Plugin enabled." : "Plugin disabled.");
                        })}
                      />
                    </div>
                  )}

                  {entry.installed ? (
                    <Button variant="secondary" size="compact" icon={<ConfigureIcon />} disabled={!!busy} onClick={() => setSelectedId(entry.id)}>Configure</Button>
                  ) : (
                    <Button variant="primary" size="compact" icon={<InstallIcon />} disabled={!!busy || entry.catalog?.deprecated} onClick={() => void run("Installing", async () => { await installCatalogEntry(entry); })}>Install Plugin</Button>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!filteredEntries.length && <div className="plugin-empty"><PluginGlyph /><strong>No plugins found</strong><small>Try a different filter, refresh the catalog, or load a local plugin folder.</small></div>}
        </div>
        <div className="plugin-hub-footer">
          <span><strong>{snapshot?.plugins.length ?? 0}</strong> installed · <strong>{catalog?.plugins.length ?? 0}</strong> catalog</span>
          <span className="plugin-hub-actions">
            <Button variant="secondary" size="compact" disabled={!!busy} icon={<RefreshIcon />} onClick={() => void run("Refreshing", async () => { await load(true); setMessage("Plugin catalog refreshed."); })}>Refresh</Button>
            <Button variant="secondary" size="compact" icon={<FolderPlusIcon />} disabled={!!busy} onClick={() => void run("Loading", async () => {
              const beforeIds = new Set(snapshot?.plugins.map((plugin) => plugin.id) ?? []);
              const result = await api.loadLocalPlugin();
              if (!applyResult(result)) return;
              const loadedPlugin = result.snapshot.plugins.find((plugin) => plugin.source === "local" && !beforeIds.has(plugin.id));
              setMessage(loadedPlugin ? "Local plugin loaded." : "No local plugin loaded.");
            })}>Load Local Plugin</Button>
          </span>
        </div>
      </GlassCard>
      {selected && <div className="plugin-config-overlay" role="dialog" aria-modal="true" aria-label={`${pluginName(selected)} configuration`}>
        <button className="plugin-config-backdrop" type="button" aria-label="Close plugin configuration" onClick={() => setSelectedId("")} />
        <GlassCard className="plugin-inspector">
        {selected ? <>
          <div className="plugin-inspector-head">
            <span className="plugin-inspector-icon"><PluginIcon icon={pluginIcon(selected)} /></span>
            <div className="flex-1 min-w-0"><p className="eyebrow">Plugin Details</p><h2>{pluginName(selected)}</h2><p className="desc">{pluginDescription(selected)}</p></div>
            <Button variant="secondary" size="compact" icon={<CloseIcon />} onClick={() => setSelectedId("")}>Close</Button>
          </div>
          <div className="meta">
            <StatusPill tone={pluginPrimaryTone(selected)}>{pluginPrimaryLabel(selected)}</StatusPill>
            <StatusPill tone="slate">v{installed?.version ?? catalogPlugin?.version}</StatusPill>
            {installed?.bundled && <StatusPill tone="blue">Bundled</StatusPill>}
            {installed?.source === "local" && <StatusPill tone="orange">Local</StatusPill>}
            {(installed?.catalogDeprecated || catalogPlugin?.deprecated) && <StatusPill tone="orange">Deprecated</StatusPill>}
          </div>
          {(installed?.catalogStatusReason || catalogPlugin?.statusReason || installed?.status?.text) && <div className="plugin-status-strip">
            {installed?.status?.text && <StatusPill tone={installed.status.tone ? pluginStatusTone[installed.status.tone] : "blue"}>{installed.status.text}</StatusPill>}
            <span>{installed?.catalogStatusReason || catalogPlugin?.statusReason}</span>
          </div>}
          {installed ? <>
            <section className="plugin-section">
              <div className="plugin-section-title"><small>Runtime</small><strong>State & permissions</strong></div>
              <label className="settings-row plugin-toggle-row">
                <div className="settings-row-info"><strong>{installed.enabled ? "Enabled" : "Disabled"}</strong><small>{installed.brokenReason || (installed.catalogDisabled ? "This plugin is disabled by the catalog." : "Toggle this plugin without leaving the Control Center.")}</small></div>
                <input className="settings-toggle" type="checkbox" checked={installed.enabled} disabled={!!busy || installed.catalogDisabled || Boolean(installed.brokenReason)} onChange={(event) => void run("Saving", async () => { applyResult(await api.setPluginEnabled(installed.id, event.target.checked), event.target.checked ? "Plugin enabled." : "Plugin disabled."); })} />
              </label>
              <div className="badges plugin-permissions">{installed.approvedPermissions.length ? installed.approvedPermissions.map((permission) => <StatusPill key={permission} tone={permission === "network" ? "orange" : "blue"}>{pluginPermissionLabels[permission]}</StatusPill>) : <StatusPill tone="slate">No permissions</StatusPill>}</div>
            </section>
            {!!installed.configErrors?.length && <section className="plugin-section plugin-section-danger"><div className="plugin-section-title"><small>Configuration</small><strong>Needs attention</strong></div><ul>{installed.configErrors.map((configError, index) => <li key={index}>{configError.message || String(configError)}</li>)}</ul></section>}
            {hasConfigFields && <section className="plugin-section">
              <div className="plugin-section-title"><small>Settings</small><strong>Configuration</strong></div>
              <div className="plugin-config-form">{Object.entries(installed.configSchema ?? {}).map(([key, field]) => <ConfigFieldEditor key={key} pluginId={installed.id} fieldKey={key} field={field} value={configDraft[key] ?? initialConfigValue(field)} onChange={(value) => updateDraft(key, value)} />)}</div>
              <Button variant="primary" fullWidth icon={<SaveIcon />} disabled={!!busy} onClick={() => void run("Saving", async () => { applyResult(await api.savePluginConfig(installed.id, configDraft), "Plugin configuration saved."); })}>Save Configuration</Button>
            </section>}
            {!!installed.commands?.length && <section className="plugin-section">
              <div className="plugin-section-title"><small>Commands</small><strong>Quick actions</strong></div>
              <div className="plugin-command-list">
                {installed.commands.map((command) => (
                  <div key={command.id} className="flex flex-col gap-2">
                    <Button variant="secondary" size="compact" disabled={!!busy} onClick={() => void run("Running", async () => { applyResult(await api.executePluginCommand(installed.id, command.id), "Plugin command ran."); })}>
                      {command.title}
                    </Button>
                    {command.description && <small className="text-[10px] text-slatecopy px-1 leading-tight">{command.description}</small>}
                  </div>
                ))}
              </div>
            </section>}
            <section className="plugin-section plugin-actions-section">
              <Button variant="secondary" disabled={!!busy} icon={<RefreshIcon />} onClick={() => void run("Reloading", async () => { applyResult(await api.reloadPlugin(installed.id), "Plugin reloaded."); })}>Reload</Button>
              {installed.source === "catalog" && !installed.bundled && catalogPlugin && catalogPlugin.version !== installed.version && <Button variant="primary" icon={<InstallIcon />} disabled={!!busy} onClick={() => void run("Updating", async () => { await updateCatalogEntry(installed); })}>Update</Button>}
              {!installed.bundled && <Button variant="danger" icon={<RemoveIcon />} disabled={!!busy} onClick={() => { if (window.confirm(`Uninstall ${pluginName(selected)}?`)) void run("Uninstalling", async () => { if (applyResult(await api.uninstallPlugin(installed.id), "Plugin uninstalled.")) setSelectedId(""); }); }}>Uninstall</Button>}
            </section>
          </> : <section className="plugin-section">
            <div className="plugin-section-title"><small>Catalog</small><strong>Ready to install</strong></div>
            <p className="desc">Install this plugin to approve its permissions and make it available in your desktop companion.</p>
            <div className="badges plugin-permissions">{catalogPlugin?.permissions.map((permission) => <StatusPill key={permission} tone={permission === "network" ? "orange" : "blue"}>{pluginPermissionLabels[permission]}</StatusPill>)}</div>
            <Button variant="primary" fullWidth icon={<InstallIcon />} disabled={!!busy || catalogPlugin?.deprecated} onClick={() => void run("Installing", async () => { await installCatalogEntry(selected); })}>Install Plugin</Button>
          </section>}
        </> : <div className="plugin-empty plugin-empty-detail"><PluginGlyph /><strong>No plugin selected</strong><small>Install a catalog plugin or load a local folder to begin.</small></div>}
        </GlassCard>
      </div>}
    </div>
  );
}

function App() {
  const [currentRoute, setCurrentRoute] = useState<Route>(() => initialControlCenterRoute());
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [catalogPages, setCatalogPages] = useState<Record<number, PetEntry[]>>({});
  const [catalogSearch, setCatalogSearch] = useState<SearchPetEntry[] | null>(null);
  const [catalogPage, setCatalogPage] = useState(0);
  const [codex, setCodex] = useState<CodexState>({ pets: [] });
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const petDetailDialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => api.onRouteChange((route) => {
    if (isRoute(route)) setCurrentRoute(route);
  }), []);

  async function loadPetsData() {
    setError("");
    const [nextState, nextCatalog, nextCodex] = await Promise.all([api.getPetsState(), api.getCatalog(), api.getCodexPets()]);
    logPetsEvent("load-complete", { installed: nextState.pets.installed.length, defaultPetId: nextState.preferences.defaultPetId, catalogSource: nextCatalog.source, catalogPets: nextCatalog.pets.length, catalogPage: nextCatalog.page, catalogPageCount: nextCatalog.pageCount, codexPets: nextCodex.pets.length, catalogError: nextCatalog.error, codexError: nextCodex.error, firstCatalogPet: nextCatalog.pets[0] ? { id: nextCatalog.pets[0].id, preview: imageDebug(nextCatalog.pets[0].preview), thumbnail: imageDebug(nextCatalog.pets[0].thumbnail), spritesheet: imageDebug(nextCatalog.pets[0].spritesheet) } : null });
    setState(nextState); setCatalog(nextCatalog); setCodex(nextCodex);
    setCatalogPage(nextCatalog.page ?? 0);
    setCatalogPages({ [nextCatalog.page ?? 0]: nextCatalog.pets });
    const visiblePetIds = new Set<string>([...nextState.pets.installed.map((pet) => pet.id), ...nextCatalog.pets.map((pet) => pet.id), ...nextCodex.pets.map((pet) => pet.id)]);
    setSelectedId((current) => current && visiblePetIds.has(current) ? current : "");
  }
  useEffect(() => {
    if (currentRoute !== "pets") return;
    void loadPetsData().catch((err) => setError(String(err?.message ?? err)));
  }, [currentRoute]);

  const pets = useMemo(() => {
    const installed = new Map((state?.pets.installed ?? []).map((p) => [p.id, p]));
    const catalogMap = new Map<string, PetEntry>();
    for (const pagePets of Object.values(catalogPages)) {
      for (const p of pagePets) {
        catalogMap.set(p.id, p);
      }
    }
    const codexMap = new Map<string, PetEntry>((codex.pets ?? []).map((p) => [p.id, p]));

    const rows: PetEntry[] = (state?.pets.installed ?? []).map((p) => {
      const catalogPet = catalogMap.get(p.id);
      const codexPet = codexMap.get(p.id);
      const localSpritesheet = p.id && !catalogPet && !codexPet && !p.builtIn ? installedPetSpritesheetUrl(p.id) : undefined;
      const spritesheet = safePetImage(codexPet?.spritesheet) || safePetImage(catalogPet?.spritesheet) || safePetImage(localSpritesheet);
      const preview = safePetImage(codexPet?.preview) || safePetImage(catalogPet?.preview) || safePetImage(catalogPet?.thumbnail) || safePetImage(p.source && "preview" in p.source ? (p.source as { preview?: string }).preview : undefined) || safePetImage(localSpritesheet) || defaultThumbUrl;
      const category = catalogPet?.category;
      const original = catalogPet?.original;
      const featured = catalogPet?.featured;
      return {
        ...p,
        spritesheet,
        preview,
        category,
        original,
        featured,
        sourceKind: "installed" as const,
        installed: true,
      };
    });

    for (const p of catalogMap.values()) {
      if (!installed.has(p.id)) {
        rows.push({
          ...p,
          preview: safePetImage(p.preview) || safePetImage(p.thumbnail) || defaultThumbUrl,
          spritesheet: safePetImage(p.spritesheet),
          sourceKind: "catalog",
          installed: false,
        });
      }
    }

    for (const p of codexMap.values()) {
      if (!installed.has(p.id) && !catalogMap.has(p.id)) {
        rows.push({
          ...p,
          preview: safePetImage(p.preview),
          spritesheet: safePetImage(p.spritesheet),
          sourceKind: "codex",
          installed: false,
        });
      }
    }

    return rows.filter((p) => {
      if (filter === "installed" && !p.installed) return false;
      if (filter === "codex" && p.sourceKind !== "codex" && !(installed.get(p.id)?.source?.kind === "codex")) return false;
      if (filter === "originals" && !p.original && !p.builtIn) return false;
      if (filter === "featured" && (!p.featured || p.original)) return false;
      const q = query.trim().toLowerCase();
      return !q || `${p.displayName} ${p.description ?? ""} ${p.searchText ?? ""} ${p.id}`.toLowerCase().includes(q);
    });
  }, [state, catalogPages, catalogSearch, codex, filter, query]);

  const selected = selectedId ? pets.find((p) => p.id === selectedId) ?? null : null;
  const defaultId = state?.preferences.defaultPetId;

  useEffect(() => {
    if (!selected) return;

    const dialog = petDetailDialogRef.current;
    if (!dialog) return;

    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    requestAnimationFrame(() => {
      dialog.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedId("");
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    logPetsEvent("selected-pet", { id: selected.id, sourceKind: selected.sourceKind, installed: selected.installed, builtIn: selected.builtIn, preview: imageDebug(selected.preview), spritesheet: imageDebug(selected.spritesheet), hasSafePreview: Boolean(safePetImage(selected.preview)), hasSafeSpritesheet: Boolean(safePetImage(selected.spritesheet)), catalogPages: Object.keys(catalogPages).join(",") });
  }, [selected]);

  const statusText = useMemo(() => {
    if (!selected) return "";
    const isDefault = selected.id === defaultId;
    const isCodex = selected.sourceKind === "codex" || (state?.pets.installed.find(p => p.id === selected.id)?.source?.kind === "codex");
    if (selected.broken) return selected.brokenReason || "This installed pet is broken and cannot be selected as default.";
    if (isDefault) return selected.protected ? "Default built-in pet. Protected from removal." : "Default pet.";
    if (selected.installed) {
      if (isCodex) return "Installed and ready to become your default pet. Also found in ~/.codex/pets.";
      return "Installed and ready to become your default pet.";
    }
    if (selected.sourceKind === "codex") return "Available to import from ~/.codex/pets.";
    return "Available to install from the catalog.";
  }, [selected, defaultId, state]);

  async function act(label: string, fn: () => Promise<unknown>) {
    try { setBusy(label); setError(""); await fn(); await loadPetsData(); }
    catch (err) { setError(String((err as Error)?.message ?? err)); }
    finally { setBusy(""); }
  }

  useEffect(() => {
    if (currentRoute !== "pets") return;
    if (catalogSearch) return;
    void api.getCatalogSearch().then((result) => {
      if (result.error) setError(result.error);
      setCatalogSearch(result.pets ?? []);
    }).catch((err) => setError(String(err?.message ?? err)));
  }, [catalogSearch, currentRoute]);

  useEffect(() => {
    if (currentRoute !== "pets") return;
    if (!catalogSearch) return;
    const q = query.trim().toLowerCase();
    const needsRemotePages = !!q || filter === "featured" || filter === "originals";
    
    const pages = new Set<number>();
    
    if (state?.pets.installed) {
      for (const p of state.pets.installed) {
        const searchPet = catalogSearch.find(sp => sp.id === p.id);
        if (searchPet && typeof searchPet.catalogPage === "number" && !catalogPages[searchPet.catalogPage]) {
          pages.add(searchPet.catalogPage);
        }
      }
    }

    if (needsRemotePages) {
      for (const pet of catalogSearch) {
        if (pages.size >= 12) break;
        if (filter === "originals" && !pet.original) continue;
        if (filter === "featured" && (!pet.featured || pet.original)) continue;
        if (q && !`${pet.displayName} ${pet.searchText ?? ""} ${pet.id}`.toLowerCase().includes(q)) continue;
        if (typeof pet.catalogPage === "number" && !catalogPages[pet.catalogPage]) pages.add(pet.catalogPage);
      }
    }
    
    if (!pages.size) return;
    let cancelled = false;
    void Promise.all([...pages].map((page) => api.getCatalogPage(page).catch((err) => ({ source: "error", pets: [], error: String((err as Error)?.message ?? err), page } as CatalogState)))).then((results) => {
      if (cancelled) return;
      setCatalogPages((current) => {
        const next = { ...current };
        for (const result of results) if (result.source !== "error") next[result.page ?? 0] = result.pets;
        return next;
      });
      const firstError = results.find((result) => result.source === "error")?.error;
      if (firstError) setError(firstError);
    });
    return () => { cancelled = true; };
  }, [catalogPages, catalogSearch, filter, query, state, currentRoute]);

  async function loadCatalogPage(page: number) {
    if (catalogPages[page]) { setCatalogPage(page); return; }
    try {
      setBusy("Loading page"); setError("");
      const next = await api.getCatalogPage(page);
      setCatalog(next); setCatalogPage(next.page ?? page); setCatalogPages((pages) => ({ ...pages, [next.page ?? page]: next.pets }));
    } catch (err) { setError(String((err as Error)?.message ?? err)); }
    finally { setBusy(""); }
  }

  const currentMeta = routeMetadata[currentRoute];

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-content">
          <p className="eyebrow">Control Center</p>
          <h1>{currentMeta.title}</h1>
          <p className="hero-desc">{currentMeta.description}</p>
        </div>
        <div className="hero-logo-container">
          <img src={openPetsLogoUrl} className="hero-brand-logo" alt="OpenPets" />
        </div>
      </header>

      <nav className="nav-bar">
        {navTabs.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${currentRoute === tab.id ? "active" : ""}`}
            onClick={() => setCurrentRoute(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {error && <div className="error">{error}</div>}

      {currentRoute === "dashboard" ? (
        <DashboardView onNavigate={setCurrentRoute} />
      ) : currentRoute === "settings" ? (
        <SettingsView />
      ) : currentRoute === "plugins" ? (
        <PluginsView />
      ) : currentRoute === "integrations" ? (
        <IntegrationsView />
      ) : (
        <div className="layout">
          <GlassCard className="gallery">
            <div className="toolbar"><SearchInput value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <div className="filter-row">
              <div className="filters">
                {(["all", "installed", "featured", "originals", "codex"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    className={`filter ${filter === f ? "active" : ""} ${f === "originals" ? "original" : ""} ${f === "featured" ? "featured" : ""}`}
                    onClick={() => setFilter(f)}
                    aria-current={filter === f ? "page" : undefined}
                  >
                    <span className="filter-icon-wrapper">{filterIcons[f]}</span>
                    <span className="filter-text">{filterLabels[f]}</span>
                  </button>
                ))}
              </div>
              <div className="filter-actions">
                <Button variant="secondary" size="compact" icon={<FolderPlusIcon />} disabled={!!busy} onClick={() => void act("Importing", () => api.installLocalPet())}>Import pet</Button>
                <Button variant="secondary" size="compact" icon={<HeartIcon />} onClick={() => void api.openGallery().catch((err) => setError(String(err?.message ?? err)))}>Gallery</Button>
              </div>
            </div>
            <div className="pets-grid">{pets.map((pet) => {
              const isBuiltIn = pet.builtIn;
              const hasDistinctPreview = pet.preview && pet.preview !== pet.spritesheet;
              const useSpritesheetFrame = !isBuiltIn && !hasDistinctPreview && !!pet.spritesheet;
              const isDefault = pet.id === defaultId;
              const canInstall = !pet.installed && pet.sourceKind === "catalog";
              const canImport = !pet.installed && pet.sourceKind === "codex";
              const canSetDefault = pet.installed && !isDefault && !pet.broken;
              const canRemove = pet.installed && !pet.builtIn && !pet.protected;

              return (
                <div
                  key={`${pet.sourceKind}-${pet.id}`}
                  className={`pet-card group ${selected?.id === pet.id ? "selected" : ""}`}
                >
                  <span className="thumb">
                    {useSpritesheetFrame ? (
                      <SpriteFrame src={pet.spritesheet} label={`${pet.displayName} thumbnail`} size="thumb" />
                    ) : (
                      <PetImage src={pet.preview} debugLabel={`${pet.id}:card`} />
                    )}
                  </span>
                  <div className="card-content">
                    <span className="card-title-row">
                      <b className="card-title">{pet.displayName}</b>
                    </span>
                    <p className="card-desc">{pet.description || pet.id}</p>
                    <div className="badges">{isDefault && <StatusPill tone="green">Default</StatusPill>}{pet.original || pet.builtIn ? <StatusPill tone="yellow">Original</StatusPill> : pet.featured ? <StatusPill tone="purple">Featured</StatusPill> : null}{pet.installed && <StatusPill>Installed</StatusPill>}{pet.sourceKind === "codex" && <StatusPill tone="orange">Codex</StatusPill>}</div>

                    <div className="pet-card-actions" onClick={(event) => event.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="compact"
                        icon={<EyeIcon />}
                        ariaLabel={`View ${pet.displayName}`}
                        onClick={() => setSelectedId(pet.id)}
                      >
                        View pet
                      </Button>
                      {canInstall && (
                        <Button
                          variant="primary"
                          size="compact"
                          icon={<InstallIcon />}
                          disabled={!!busy}
                          ariaLabel={`Install ${pet.displayName}`}
                          onClick={() => { void act("Installing", () => api.installPet(pet.id)); }}
                        >
                          Install
                        </Button>
                      )}
                      {canImport && (
                        <Button
                          variant="warning"
                          size="compact"
                          icon={<ImportIcon />}
                          disabled={!!busy}
                          ariaLabel={`Import ${pet.displayName} from Codex`}
                          onClick={() => { void act("Importing", () => api.importCodexPet(pet.id)); }}
                        >
                          Import
                        </Button>
                      )}
                      {canSetDefault && (
                        <Button
                          variant="primary"
                          size="compact"
                          icon={<SetDefaultIcon />}
                          disabled={!!busy}
                          ariaLabel={`Set ${pet.displayName} as default`}
                          onClick={() => { void act("Setting default", () => api.setDefaultPet(pet.id)); }}
                        >
                          Default
                        </Button>
                      )}
                      {canRemove && (
                        <Button
                          variant="danger"
                          size="compact"
                          icon={<RemoveIcon />}
                          disabled={!!busy}
                          ariaLabel={`Remove ${pet.displayName}`}
                          onClick={() => { void act("Removing", () => api.removePet(pet.id)); }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}</div>
            <div className="pager">
              {!!catalog?.pageCount && catalog.pageCount > 1 ? (
                <Button
                  variant="secondary"
                  size="compact"
                  icon={<PrevIcon />}
                  disabled={!!busy || catalogPage <= 0}
                  onClick={() => void loadCatalogPage(catalogPage - 1)}
                >
                  Prev
                </Button>
              ) : <span />}
              <span className="pager-text">{pets.length} pets{!!catalog?.pageCount && catalog.pageCount > 1 ? ` · Page ${catalogPage + 1} of ${catalog.pageCount}` : ""}</span>
              {!!catalog?.pageCount && catalog.pageCount > 1 ? (
                <Button
                  variant="secondary"
                  size="compact"
                  icon={<NextIcon />}
                  iconPosition="right"
                  disabled={!!busy || catalogPage >= catalog.pageCount - 1}
                  onClick={() => void loadCatalogPage(catalogPage + 1)}
                >
                  Next
                </Button>
              ) : <span />}
            </div>
          </GlassCard>

          {selected ? (
            <div ref={petDetailDialogRef} className="plugin-config-overlay" role="dialog" aria-modal="true" aria-label={`${selected.displayName} pet details`}>
              <button className="plugin-config-backdrop" type="button" aria-label="Close pet details" onClick={() => setSelectedId("")} />
              <GlassCard className="plugin-inspector pet-detail-inspector">
                <div className="plugin-inspector-head">
                  <span className="plugin-inspector-icon">
                    {safePetImage(selected.spritesheet) ? (
                      <SpriteFrame src={selected.spritesheet} label={`${selected.displayName} thumb`} size="thumb" />
                    ) : (
                      <PetImage src={selected.preview} debugLabel={`${selected.id}:thumb`} />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="eyebrow">Pet detail</p>
                    <h2>{selected.displayName}</h2>
                  </div>
                  <Button variant="secondary" size="compact" icon={<CloseIcon />} onClick={() => setSelectedId("")}>Close</Button>
                </div>

                <div className="pet-detail-content">
                  <div className="pet-detail-main">
                    <p className="desc">{selected.description || selected.id}</p>
                    <div className="stage">
                      {safePetImage(selected.spritesheet) ? (
                        <SpriteFrame src={selected.spritesheet} label={`${selected.displayName} animated preview`} />
                      ) : (
                        <PetImage src={selected.preview} debugLabel={`${selected.id}:detail-fallback`} />
                      )}
                    </div>
                    <div className="meta">
                      {selected.broken && <StatusPill tone="red">Broken</StatusPill>}
                      {selected.installed && !selected.broken && <StatusPill tone="green">Ready</StatusPill>}
                      {selected.builtIn && <StatusPill tone="orange">Originals</StatusPill>}
                      {selected.original && !selected.builtIn && <StatusPill tone="yellow">Original</StatusPill>}
                      {selected.featured && !selected.original && <StatusPill tone="purple">Featured</StatusPill>}
                    </div>
                    {statusText && <p className="text-sm text-slatecopy mt-3 mb-0 font-medium">{statusText}</p>}
                  </div>

                  <aside className="pet-detail-reactions">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slatecopy mb-3">Preview Animations</h3>
                    <div className="pet-preview-grid">
                      {[
                        { label: "Idle", state: "idle" as const },
                        { label: "Thinking", state: "thinking" as const },
                        { label: "Happy", state: "happy" as const },
                        { label: "Wave", state: "wave" as const },
                      ].map((previewState) => (
                        <article key={previewState.label} className="pet-preview-item">
                          <SpriteFrame src={selected.spritesheet} label={`${selected.displayName} ${previewState.label} preview`} state={previewState.state} size="mini" />
                          <span className="text-xs font-bold text-slatecopy">{previewState.label}</span>
                        </article>
                      ))}
                    </div>
                  </aside>
                </div>

                <div className="actions-container mt-6 flex flex-col gap-3 pet-detail-actions">
                  {/* Main Action (Install, Import, Set Default) */}
                  {!selected.installed && selected.sourceKind === "catalog" && (
                    <Button
                      variant="primary"
                      fullWidth
                      icon={<InstallIcon />}
                      disabled={!!busy}
                      onClick={() => act("Installing", () => api.installPet(selected.id))}
                    >
                      {busy || "Install Pet"}
                    </Button>
                  )}
                  {!selected.installed && selected.sourceKind === "codex" && (
                    <Button
                      variant="warning"
                      fullWidth
                      icon={<ImportIcon />}
                      disabled={!!busy}
                      onClick={() => act("Importing", () => api.importCodexPet(selected.id))}
                    >
                      {busy || "Import Codex Pet"}
                    </Button>
                  )}
                  {selected.installed && selected.id !== defaultId && !selected.broken && (
                    <Button
                      variant="primary"
                      fullWidth
                      icon={<SetDefaultIcon />}
                      disabled={!!busy}
                      onClick={() => act("Setting default", () => api.setDefaultPet(selected.id))}
                    >
                      {busy || "Set Default Pet"}
                    </Button>
                  )}

                  <div className={`grid gap-3 ${selected.installed && !selected.builtIn && !selected.protected ? "grid-cols-2" : "grid-cols-1"}`}>
                    {selected.installed && !selected.builtIn && !selected.protected && (
                      <Button
                        variant="danger"
                        icon={<RemoveIcon />}
                        disabled={!!busy}
                        onClick={() => act("Removing", () => api.removePet(selected.id))}
                      >
                        Remove
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      icon={<RefreshIcon />}
                      disabled={!!busy}
                      onClick={() => void loadPetsData()}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
