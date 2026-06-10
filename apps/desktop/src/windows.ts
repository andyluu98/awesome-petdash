import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { app, BrowserWindow, dialog, ipcMain, protocol, shell, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";

import { getAgentSetupSnapshot, runAgentSetupAction, updateAgentSetupCommandPaths } from "./agent-setup.js";
import { refreshAgentPetContent } from "./agent-pet-controller.js";
import { getAppStateSnapshot, normalizePetScale, petScaleOptions, updatePreferences } from "./app-state.js";
import { createAppIcon } from "./assets.js";
import { getCatalogPageUiState, getCatalogSearchUiState, getCatalogUiState } from "./catalog.js";
import { getCodexPetsUiState, importCodexPet, readCodexPetSpritesheet } from "./codex-pets.js";
import { recoverDefaultPetMouseInterop, refreshDefaultPetContent, resetDefaultPetToInitialPosition, syncQuotaPolling } from "./default-pet-controller.js";
import { installPet, installPetFromFolder, installPetFromZipFile, removePet, setDefaultInstalledPet } from "./pet-installation.js";
import { assertSafePetId, getInstalledPetDir } from "./pet-paths.js";
import { debug, error as logError, warn } from "./logger.js";
import { getPluginService, type PluginServiceResult } from "./plugin-service.js";
import { defaultPetSprite, reactionAnimationMetadata, selectableAnimationMetadata, validateReactionAnimationOverrides } from "./reaction-animation-mapping.js";
import { checkForGitHubReleaseUpdate, getUpdateStatus, openUpdateReleasePage } from "./update-checker.js";

type InternalUiWindowKind = "control-center";
export type ControlCenterRoute = "dashboard" | "pets" | "settings" | "plugins" | "integrations";

const controlCenterRoutes = new Set<ControlCenterRoute>(["dashboard", "pets", "settings", "plugins", "integrations"]);
let controlCenterWindow: BrowserWindow | null = null;
let internalUiHandlersInstalled = false;
let pendingControlCenterRoute: ControlCenterRoute | null = null;
let pendingDockTimer: NodeJS.Timeout | null = null;
let lastDockHideAt = 0;
const dockHideShowCooldownMs = 1100;

function hasOpenInternalUiWindows(): boolean {
  if (controlCenterWindow && !controlCenterWindow.isDestroyed()) return true;
  return false;
}

function syncDockVisibilityForInternalUi(): void {
  if (process.platform !== "darwin") return;
  const dock = app.dock;
  if (!dock) return;

  if (pendingDockTimer) {
    clearTimeout(pendingDockTimer);
    pendingDockTimer = null;
  }

  if (hasOpenInternalUiWindows()) {
    const elapsedSinceHide = Date.now() - lastDockHideAt;
    const delayMs = elapsedSinceHide < dockHideShowCooldownMs ? dockHideShowCooldownMs - elapsedSinceHide : 0;
    pendingDockTimer = setTimeout(() => {
      pendingDockTimer = null;
      dock.setIcon(createAppIcon());
      dock.show();
    }, delayMs);
  } else {
    dock.hide();
    lastDockHideAt = Date.now();
  }
}

function getPetsStateSnapshot(): { preferences: { defaultPetId: string }; pets: ReturnType<typeof getAppStateSnapshot>["pets"] } {
  const state = getAppStateSnapshot();
  return { preferences: { defaultPetId: state.preferences.defaultPetId }, pets: state.pets };
}

function getSettingsStateSnapshot(): {
  preferences: Pick<ReturnType<typeof getAppStateSnapshot>["preferences"], "openDefaultPetOnLaunch" | "petScale" | "reactionAnimationOverrides" | "quotaDisplayMode">;
  petScaleOptions: typeof petScaleOptions;
} {
  const state = getAppStateSnapshot();
  return {
    preferences: {
      openDefaultPetOnLaunch: state.preferences.openDefaultPetOnLaunch,
      petScale: state.preferences.petScale,
      reactionAnimationOverrides: state.preferences.reactionAnimationOverrides,
      quotaDisplayMode: state.preferences.quotaDisplayMode,
    },
    petScaleOptions,
  };
}

async function getDashboardSnapshot(): Promise<{
  readonly defaultPet: { readonly id: string; readonly displayName: string; readonly previewSpriteUrl: string };
  readonly installedPetCount: number;
  readonly catalog: { readonly source: string; readonly total?: number; readonly page?: number; readonly pageCount?: number; readonly error?: string };
  readonly plugins: { readonly installed: number; readonly enabled: number; readonly broken: number };
  readonly updateStatus: ReturnType<typeof getUpdateStatus>;
  readonly activity: ReturnType<typeof getAppStateSnapshot>["analytics"];
}> {
  const state = getAppStateSnapshot();
  const defaultPet = state.pets.installed.find((pet) => pet.id === state.preferences.defaultPetId && !pet.broken) ?? state.pets.installed[0];
  const preview = await getDefaultPetPreviewSpriteInfo();
  const catalog = await getCatalogUiState().catch((error: unknown) => ({ source: "error" as const, pets: [], total: undefined, page: undefined, pageCount: undefined, error: error instanceof Error ? error.message : "Catalog unavailable." }));
  const pluginSnapshot = await getPluginService().getSnapshot().catch((error: unknown) => {
    warn("ui", "dashboard plugin snapshot unavailable", { error: error instanceof Error ? error.message : String(error) });
    return { plugins: [] } as const;
  });
  const installedPlugins = pluginSnapshot.plugins.length;
  const brokenPlugins = pluginSnapshot.plugins.filter((plugin) => Boolean(plugin.brokenReason)).length;
  const enabledPlugins = pluginSnapshot.plugins.filter((plugin) => plugin.enabled && !plugin.brokenReason).length;

  return {
    defaultPet: {
      id: defaultPet?.id ?? state.preferences.defaultPetId,
      displayName: defaultPet?.displayName ?? "PetDash",
      previewSpriteUrl: `openpets-pet-preview://spritesheet/default?v=${encodeURIComponent(preview.version)}`,
    },
    installedPetCount: state.pets.installed.length,
    catalog: {
      source: catalog.source,
      total: catalog.total,
      page: catalog.page,
      pageCount: catalog.pageCount,
      error: catalog.error,
    },
    plugins: {
      installed: installedPlugins,
      enabled: enabledPlugins,
      broken: brokenPlugins,
    },
    updateStatus: getUpdateStatus(),
    activity: state.analytics,
  };
}

export function installInternalUiHandlers(): void {
  if (internalUiHandlersInstalled) {
    return;
  }

  internalUiHandlersInstalled = true;

  ipcMain.handle("openpets:get-pets-state", (event) => {
    assertAllowedSender(event, ["control-center"]);
    return getPetsStateSnapshot();
  });

  ipcMain.handle("openpets:get-settings-state", (event) => {
    assertAllowedSender(event, ["control-center"]);
    return getSettingsStateSnapshot();
  });

  ipcMain.handle("openpets:get-dashboard-snapshot", async (event) => {
    assertAllowedSender(event, ["control-center"]);
    return getDashboardSnapshot();
  });

  ipcMain.handle("openpets:get-reaction-animation-settings", async (event) => {
    assertAllowedSender(event, ["control-center"]);
    return getReactionAnimationSettingsSnapshot();
  });

  ipcMain.handle("openpets:plugins-snapshot", async (event) => {
    assertAllowedSender(event, ["control-center"]);
    return getPluginService().getSnapshot();
  });

  ipcMain.handle("openpets:plugins-set-enabled", async (event, id: unknown, enabled: unknown): Promise<PluginServiceResult> => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(id) || typeof enabled !== "boolean") return pluginUiError("Invalid plugin enable request.");
    return getPluginService().setEnabled(id, enabled);
  });

  ipcMain.handle("openpets:plugins-save-config", async (event, id: unknown, config: unknown): Promise<PluginServiceResult> => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(id) || !isPlainObject(config)) return pluginUiError("Invalid plugin config request.");
    return getPluginService().saveConfig(id, config);
  });

  ipcMain.handle("openpets:plugins-reload", async (event, id: unknown): Promise<PluginServiceResult> => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(id)) return pluginUiError("Invalid plugin reload request.");
    return getPluginService().reload(id);
  });

  ipcMain.handle("openpets:plugins-execute-command", async (event, id: unknown, commandId: unknown): Promise<PluginServiceResult> => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(id) || typeof commandId !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/.test(commandId)) return pluginUiError("Invalid plugin command request.");
    return getPluginService().executeCommand(id, commandId);
  });

  ipcMain.handle("openpets:plugins-load-local", async (event): Promise<PluginServiceResult> => {
    assertAllowedSender(event, ["control-center"]);
    return getPluginService().loadLocal();
  });

  ipcMain.handle("openpets:plugins-catalog-snapshot", async (event, refresh: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    return getPluginService().getCatalogSnapshot(refresh === true);
  });

  ipcMain.handle("openpets:plugins-install-catalog", async (event, id: unknown): Promise<PluginServiceResult> => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(id)) return pluginUiError("Invalid plugin install request.");
    return getPluginService().installCatalog(id);
  });

  ipcMain.handle("openpets:plugins-update-catalog", async (event, id: unknown): Promise<PluginServiceResult> => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(id)) return pluginUiError("Invalid plugin update request.");
    return getPluginService().updateCatalog(id);
  });

  ipcMain.handle("openpets:plugins-uninstall", async (event, id: unknown): Promise<PluginServiceResult> => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(id)) return pluginUiError("Invalid plugin uninstall request.");
    return getPluginService().uninstall(id);
  });

  ipcMain.handle("openpets:get-catalog", async (event) => {
    assertAllowedSender(event, ["control-center"]);
    return getCatalogUiState();
  });

  ipcMain.handle("openpets:get-catalog-page", async (event, page: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof page !== "number" || !Number.isInteger(page) || page < 0) throw new Error("Invalid catalog page.");
    return getCatalogPageUiState(page);
  });

  ipcMain.handle("openpets:get-catalog-search", async (event) => {
    assertAllowedSender(event, ["control-center"]);
    return getCatalogSearchUiState();
  });

  ipcMain.handle("openpets:get-codex-pets", async (event) => {
    assertAllowedSender(event, ["control-center"]);
    return getCodexPetsUiState();
  });

  ipcMain.handle("openpets:update-preferences", (event, patch: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    const previousScale = getAppStateSnapshot().preferences.petScale;
    const previousOverrides = JSON.stringify(getAppStateSnapshot().preferences.reactionAnimationOverrides ?? {});
    const state = updatePreferences(validatePreferencePatch(patch));
    const nextOverrides = JSON.stringify(state.preferences.reactionAnimationOverrides ?? {});
    if (state.preferences.petScale !== previousScale || nextOverrides !== previousOverrides) {
      refreshDefaultPetContent();
      refreshAgentPetContent();
    }
    // Sync quota polling whenever preferences change (quotaDisplayMode may have changed)
    syncQuotaPolling();
    return getInternalUiWindowKindForWebContents(event.sender.id) === "control-center" ? getSettingsStateSnapshot() : state;
  });

  ipcMain.handle("openpets:get-launch-at-login", (event) => {
    assertAllowedSender(event, ["control-center"]);
    return getLaunchAtLoginState();
  });

  ipcMain.handle("openpets:set-launch-at-login", (event, enabled: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof enabled !== "boolean") throw new Error("Invalid launch-at-login value.");
    if (!isLaunchAtLoginSupported()) return getLaunchAtLoginState();
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
    return getLaunchAtLoginState();
  });

  ipcMain.handle("openpets:get-update-status", (event) => {
    assertAllowedSender(event, ["control-center"]);
    return getUpdateStatus();
  });

  ipcMain.handle("openpets:check-for-updates", async (event) => {
    assertAllowedSender(event, ["control-center"]);
    const status = await checkForGitHubReleaseUpdate();
    const { refreshTrayMenu } = await import("./tray.js");
    refreshTrayMenu();
    return status;
  });

  ipcMain.handle("openpets:open-update-release-page", async (event) => {
    assertAllowedSender(event, ["control-center"]);
    await openUpdateReleasePage();
  });

  ipcMain.handle("openpets:set-default-pet", async (event, petId: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof petId !== "string") {
      throw new Error("Invalid pet id.");
    }

    const state = await setDefaultInstalledPet(petId);
    refreshDefaultPetContent();
    recoverDefaultPetMouseInterop("default-pet-changed");
    setTimeout(() => recoverDefaultPetMouseInterop("default-pet-changed+500ms"), 500).unref?.();
    return getInternalUiWindowKindForWebContents(event.sender.id) === "control-center" ? getPetsStateSnapshot() : state;
  });

  ipcMain.handle("openpets:install-pet", async (event, petId: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof petId !== "string") {
      throw new Error("Invalid pet id.");
    }

    const state = await installPet(petId);
    return getInternalUiWindowKindForWebContents(event.sender.id) === "control-center" ? getPetsStateSnapshot() : state;
  });

  ipcMain.handle("openpets:install-local-pet", async (event) => {
    assertAllowedSender(event, ["control-center"]);
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const importKind = await chooseLocalPetImportKind(owner);
    if (!importKind) return getPetsStateSnapshot();
    const options: OpenDialogOptions = importKind === "zip" ? {
      title: "Install pet from ZIP",
      buttonLabel: "Install Pet",
      properties: ["openFile"],
      filters: [{ name: "OpenPets ZIP", extensions: ["zip"] }],
    } : {
      title: "Install pet from folder",
      buttonLabel: "Install Pet",
      properties: ["openDirectory"],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return getPetsStateSnapshot();
    const selectedPath = result.filePaths[0];
    try {
      const selectedStats = await stat(selectedPath);
      const state = selectedStats.isDirectory() ? await installPetFromFolder(selectedPath) : await installPetFromZipFile(selectedPath);
      debug("ui", "local pet import succeeded", { kind: selectedStats.isDirectory() ? "folder" : "zip" });
      refreshDefaultPetContent();
      return getInternalUiWindowKindForWebContents(event.sender.id) === "control-center" ? getPetsStateSnapshot() : state;
    } catch (error) {
      logError("ui", "local pet import failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });

  ipcMain.handle("openpets:open-gallery", async (event) => {
    assertAllowedSender(event, ["control-center"]);
    await shell.openExternal("https://openpets.dev/gallery");
  });

  ipcMain.handle("openpets:import-codex-pet", async (event, petId: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof petId !== "string") {
      throw new Error("Invalid pet id.");
    }

    const state = await importCodexPet(petId);
    return getInternalUiWindowKindForWebContents(event.sender.id) === "control-center" ? getPetsStateSnapshot() : state;
  });

  ipcMain.handle("openpets:remove-pet", async (event, petId: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    if (typeof petId !== "string") {
      throw new Error("Invalid pet id.");
    }

    const state = await removePet(petId);
    refreshDefaultPetContent();
    return getInternalUiWindowKindForWebContents(event.sender.id) === "control-center" ? getPetsStateSnapshot() : state;
  });

  ipcMain.handle("openpets:reset-default-pet-position", (event) => {
    assertAllowedSender(event, ["control-center"]);
    resetDefaultPetToInitialPosition();
    return getInternalUiWindowKindForWebContents(event.sender.id) === "control-center" ? getSettingsStateSnapshot() : getAppStateSnapshot();
  });

  ipcMain.handle("openpets:agent-setup-snapshot", async (event, selectedPetId: unknown, commandMode: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    return getAgentSetupSnapshot(selectedPetId, commandMode);
  });

  ipcMain.handle("openpets:agent-setup-action", async (event, action: unknown, selectedPetId: unknown, commandMode: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    if (action !== "configure" && action !== "replace" && action !== "remove" && action !== "install-memory" && action !== "doctor-hooks" && action !== "install-hooks" && action !== "uninstall-hooks" && action !== "opencode-install" && action !== "opencode-remove" && action !== "cursor-install" && action !== "cursor-replace" && action !== "cursor-remove" && action !== "codex-install" && action !== "codex-replace" && action !== "codex-remove" && action !== "antigravity-install" && action !== "antigravity-replace" && action !== "antigravity-remove") {
      throw new Error("Invalid agent setup action.");
    }

    return runAgentSetupAction(action, selectedPetId, commandMode);
  });

  ipcMain.handle("openpets:agent-setup-command-paths", (event, patch: unknown) => {
    assertAllowedSender(event, ["control-center"]);
    return updateAgentSetupCommandPaths(patch);
  });
}

async function chooseLocalPetImportKind(owner: BrowserWindow | undefined): Promise<"zip" | "folder" | null> {
  const options = {
    type: "question" as const,
    title: "Install pet",
    message: "Install pet from ZIP or folder?",
    detail: "Choose the source type before selecting the pet package.",
    buttons: ["ZIP", "Folder", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  };
  const result = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
  if (result.response === 0) return "zip";
  if (result.response === 1) return "folder";
  return null;
}

export function installInternalUiProtocol(): void {
  protocol.handle("openpets-codex", async (request) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
      const url = new URL(request.url);
      if (url.hostname !== "spritesheet" || url.search || url.hash) return new Response(null, { status: 404 });
      const petId = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const spritesheet = await readCodexPetSpritesheet(petId);
      return new Response(spritesheet, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });

  protocol.handle("openpets-installed", async (request) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
      const url = new URL(request.url);
      if (url.hostname !== "spritesheet" || url.search || url.hash) return new Response(null, { status: 404 });
      const petId = decodeURIComponent(url.pathname.replace(/^\//, ""));
      assertSafePetId(petId);
      const pet = getAppStateSnapshot().pets.installed.find((candidate) => candidate.id === petId && !candidate.broken);
      if (!pet) return new Response(null, { status: 404 });
      const spritesheetPath = join(getInstalledPetDir(petId), "spritesheet.webp");
      const spritesheet = await stat(spritesheetPath);
      if (!spritesheet.isFile() || spritesheet.size <= 0 || spritesheet.size > 100 * 1024 * 1024) return new Response(null, { status: 404 });
      return new Response(await readFile(spritesheetPath), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });

  protocol.handle("openpets-pet-preview", async (request) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
      const url = new URL(request.url);
      if (url.hostname !== "spritesheet" || url.pathname !== "/default" || url.hash) return new Response(null, { status: 404 });
      const version = url.searchParams.get("v");
      if ([...url.searchParams.keys()].some((key) => key !== "v") || (version !== null && !/^[a-z0-9_-]+-\d+-\d+$/.test(version))) return new Response(null, { status: 404 });
      const { path } = await getDefaultPetPreviewSpriteInfo();
      const spritesheet = await stat(path);
      if (!spritesheet.isFile() || spritesheet.size <= 0 || spritesheet.size > 100 * 1024 * 1024) return new Response(null, { status: 404 });
      return new Response(await readFile(path), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

export function openControlCenterWindow(route: ControlCenterRoute = "dashboard"): void {
  const safeRoute = normalizeControlCenterRoute(route);
  if (controlCenterWindow && !controlCenterWindow.isDestroyed()) {
    syncDockVisibilityForInternalUi();
    if (controlCenterWindow.isMinimized()) controlCenterWindow.restore();
    controlCenterWindow.show();
    controlCenterWindow.focus();
    routeControlCenterWindow(controlCenterWindow, safeRoute);
    return;
  }

  const window = new BrowserWindow({
    title: "OpenPets — Control Center",
    width: 1180,
    height: 820,
    minWidth: 820,
    minHeight: 620,
    show: false,
    icon: createAppIcon(),
    backgroundColor: "#f8fbff",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: getControlCenterPreloadPath(),
    },
  });

  controlCenterWindow = window;
  syncDockVisibilityForInternalUi();
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-redirect", (event) => event.preventDefault());
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("Failed to load Control Center renderer.", { errorCode, errorDescription });
    logError("ui", "control center load failed", { errorCode, errorDescription });
  });
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const fields = { level, line, sourceId, message };
    if (level >= 3) logError("ui", "control center console", fields);
    else if (level === 2) warn("ui", "control center console", fields);
    else debug("ui", "control center console", fields);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("Control Center renderer process gone.", details);
    logError("ui", "control center renderer gone", details);
  });
  window.on("closed", () => { controlCenterWindow = null; syncDockVisibilityForInternalUi(); });
  window.once("ready-to-show", () => { window.show(); window.focus(); });
  pendingControlCenterRoute = safeRoute;
  window.webContents.on("did-finish-load", () => flushPendingControlCenterRoute(window));

  const devUrl = getSafeControlCenterDevUrl();
  const load = devUrl ? window.loadURL(withControlCenterRoute(devUrl, safeRoute)) : window.loadFile(join(app.getAppPath(), "dist", "renderer", "index.html"), { query: { route: safeRoute } });
  load.catch((error: unknown) => console.error("Failed to load Control Center.", error));
}

export function focusOpenTaskWindows(): void {
  syncDockVisibilityForInternalUi();
  if (controlCenterWindow && !controlCenterWindow.isDestroyed()) {
    if (controlCenterWindow.isMinimized()) controlCenterWindow.restore();
    controlCenterWindow.show();
    controlCenterWindow.focus();
  }
}

function normalizeControlCenterRoute(route: unknown): ControlCenterRoute {
  return typeof route === "string" && controlCenterRoutes.has(route as ControlCenterRoute) ? route as ControlCenterRoute : "dashboard";
}

function sendControlCenterRoute(window: BrowserWindow, route: ControlCenterRoute): void {
  if (window.isDestroyed()) return;
  window.webContents.send("openpets:control-center-route", route);
}

function routeControlCenterWindow(window: BrowserWindow, route: ControlCenterRoute): void {
  pendingControlCenterRoute = route;
  if (window.webContents.isLoading()) return;
  flushPendingControlCenterRoute(window);
}

function flushPendingControlCenterRoute(window: BrowserWindow): void {
  if (window.isDestroyed() || !pendingControlCenterRoute) return;
  const route = pendingControlCenterRoute;
  pendingControlCenterRoute = null;
  sendControlCenterRoute(window, route);
}

function withControlCenterRoute(rawUrl: string, route: ControlCenterRoute): string {
  const url = new URL(rawUrl);
  url.searchParams.set("route", route);
  return url.toString();
}

function pluginUiError(error: string): PluginServiceResult {
  return { ok: false, error, snapshot: { plugins: [] } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function getControlCenterPreloadPath(): string {
  return join(app.getAppPath(), "control-center-preload.cjs");
}

function getSafeControlCenterDevUrl(): string | null {
  if (app.isPackaged) return null;
  const raw = process.env.OPENPETS_RENDERER_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if ((url.protocol === "http:" || url.protocol === "https:") && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function assertAllowedSender(event: IpcMainInvokeEvent, allowedKinds: readonly InternalUiWindowKind[]): void {
  const actualKind = getInternalUiWindowKindForWebContents(event.sender.id);

  if (!actualKind || !allowedKinds.includes(actualKind)) {
    throw new Error("OpenPets internal UI request came from an unexpected window.");
  }
}

function getInternalUiWindowKindForWebContents(webContentsId: number): InternalUiWindowKind | null {
  if (controlCenterWindow && !controlCenterWindow.isDestroyed() && controlCenterWindow.webContents.id === webContentsId) {
    return "control-center";
  }
  return null;
}

async function getReactionAnimationSettingsSnapshot(): Promise<unknown> {
  const state = getAppStateSnapshot();
  const preview = await getDefaultPetPreviewSpriteInfo();
  return {
    reactions: reactionAnimationMetadata,
    animations: selectableAnimationMetadata,
    sprite: defaultPetSprite,
    overrides: state.preferences.reactionAnimationOverrides ?? {},
    previewSpriteUrl: `openpets-pet-preview://spritesheet/default?v=${encodeURIComponent(preview.version)}`,
  };
}

async function getDefaultPetPreviewSpriteInfo(): Promise<{ readonly path: string; readonly version: string }> {
  const state = getAppStateSnapshot();
  const selected = state.pets.installed.find((pet) => pet.id === state.preferences.defaultPetId);
  const builtInPath = join(app.getAppPath(), "assets", defaultPetSprite.fileName);
  const candidatePath = selected && !selected.broken && !selected.builtIn
    ? join(getInstalledPetDir(selected.id), "spritesheet.webp")
    : builtInPath;
  try {
    const spritesheet = await stat(candidatePath);
    if (spritesheet.isFile() && spritesheet.size > 0 && spritesheet.size <= 100 * 1024 * 1024) {
      return { path: candidatePath, version: `${selected?.id ?? "builtin"}-${Math.round(spritesheet.mtimeMs)}-${spritesheet.size}` };
    }
  } catch {
    // Fall back to the bundled pet if an installed default disappears while Settings is open.
  }
  const fallback = await stat(builtInPath);
  return { path: builtInPath, version: `builtin-${Math.round(fallback.mtimeMs)}-${fallback.size}` };
}

const allowedQuotaDisplayModes = new Set(["off", "speech", "label", "mood"]);

function validatePreferencePatch(value: unknown): { openDefaultPetOnLaunch?: boolean; petScale?: number; reactionAnimationOverrides?: ReturnType<typeof validateReactionAnimationOverrides>; quotaDisplayMode?: "off" | "speech" | "label" | "mood" } {
  if (!isRecord(value)) {
    throw new Error("Invalid preferences patch.");
  }

  const patch: { openDefaultPetOnLaunch?: boolean; petScale?: number; reactionAnimationOverrides?: ReturnType<typeof validateReactionAnimationOverrides>; quotaDisplayMode?: "off" | "speech" | "label" | "mood" } = {};

  if ("openDefaultPetOnLaunch" in value) {
    if (typeof value.openDefaultPetOnLaunch !== "boolean") throw new Error("Invalid open-on-launch value.");
    patch.openDefaultPetOnLaunch = value.openDefaultPetOnLaunch;
  }

  if ("petScale" in value) {
    const scale = normalizePetScale(value.petScale);
    if (scale !== value.petScale) throw new Error("Invalid pet scale value.");
    patch.petScale = scale;
  }

  if ("reactionAnimationOverrides" in value) {
    patch.reactionAnimationOverrides = validateReactionAnimationOverrides(value.reactionAnimationOverrides);
  }

  if ("quotaDisplayMode" in value) {
    if (typeof value.quotaDisplayMode !== "string" || !allowedQuotaDisplayModes.has(value.quotaDisplayMode)) {
      throw new Error("Invalid quota display mode.");
    }
    patch.quotaDisplayMode = value.quotaDisplayMode as "off" | "speech" | "label" | "mood";
  }

  return patch;
}

function getLaunchAtLoginState(): { supported: boolean; enabled: boolean } {
  if (!isLaunchAtLoginSupported()) return { supported: false, enabled: false };
  return { supported: true, enabled: app.getLoginItemSettings().openAtLogin };
}

function isLaunchAtLoginSupported(): boolean {
  return process.platform === "darwin" || process.platform === "win32";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
