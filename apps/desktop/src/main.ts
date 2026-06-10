import { app } from "electron";
import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

import { initializeAppState, releaseStartupInstallLock } from "./app-state.js";
import { createAppIcon } from "./assets.js";
import { installDefaultPetDisplayHandlers, shouldOpenDefaultPetOnLaunch, showDefaultPet, syncQuotaPolling } from "./default-pet-controller.js";
import { installAppLifecycle } from "./lifecycle.js";
import { debug, error as logError, getLogFilePath, info, initializeLogger, warn } from "./logger.js";
import { startLocalIpcServer } from "./local-ipc.js";
import { defaultPluginPetApi } from "./plugin-pet-api.js";
import { ElectronPluginJsHost } from "./plugin-js-host.js";
import { initializePluginService } from "./plugin-service.js";
import { createAppTray, refreshTrayMenu } from "./tray.js";
import { checkForGitHubReleaseUpdate } from "./update-checker.js";
import { installInternalUiHandlers, installInternalUiProtocol } from "./windows.js";

// OpenPets does not store browser passwords, cookies, or encrypted app secrets.
// Keep Chromium/Electron from prompting for macOS Keychain or Linux keyring access
// during startup/profile initialization.
app.commandLine.appendSwitch("use-mock-keychain");
app.commandLine.appendSwitch("password-store", "basic");

// GNOME Wayland does not allow Electron apps to reliably control window
// z-order or absolute position, which breaks the desktop-pet contract: staying
// above normal windows and dragging to a user-chosen screen position. Prefer
// X11/Xwayland on Linux unless the user explicitly chooses another Ozone
// backend at launch.
if (process.platform === "linux" && !app.commandLine.hasSwitch("ozone-platform")) {
  app.commandLine.appendSwitch("ozone-platform", "x11");
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  installAppLifecycle();

  app.whenReady().then(async () => {
    initializeLogger();
    app.setName("PetDash");
    if (process.platform === "win32") {
      app.setAppUserModelId("dev.petdash.app");
    }
    info("app", "startup begin", { version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged, pid: process.pid, ozonePlatform: app.commandLine.getSwitchValue("ozone-platform") || null });

    if (process.platform === "darwin") {
      app.dock?.setIcon(createAppIcon());
      app.dock?.hide();
    }

    initializeAppState();
    installInternalUiProtocol();
    installInternalUiHandlers();
    createAppTray();
    installDefaultPetDisplayHandlers();
    syncQuotaPolling();
    await startLocalIpcServer();
    releaseStartupInstallLock();
    const roots = parseDevPluginEnv(process.env.OPENPETS_DEV_PLUGIN_ROOTS);
    const paths = parseDevPluginEnv(process.env.OPENPETS_DEV_PLUGIN_PATHS);
    const devPluginMode = roots.length > 0 || paths.length > 0;
    const pluginService = initializePluginService(app.getPath("userData"), defaultPluginPetApi, app.getVersion(), new ElectronPluginJsHost(), writePluginRuntimeLog, process.env.OPENPETS_DISABLE_PLUGIN_CATALOG === "1" || devPluginMode, resolveBundledOfficialPluginRoots(), !devPluginMode);
    if (shouldOpenDefaultPetOnLaunch()) {
      showDefaultPet();
    }
    refreshTrayMenu();
    void (async () => {
      const service = pluginService;
      await service.start();
      for (const path of paths) {
        const result = await service.loadLocalPath(path, { autoApprove: true });
        if (!result.ok) logError("app", "dev plugin path load failed", new Error(result.error));
      }
      if (roots.length > 0) {
        const results = await service.loadLocalRoots(roots, { autoApprove: true, pruneStale: true });
        for (const result of results) if (!result.ok) logError("app", "dev plugin root load failed", new Error(`${result.path}: ${result.error}`));
      }
    })().catch((error) => logError("app", "plugin service startup failed", error));
    void checkForGitHubReleaseUpdate().then(() => refreshTrayMenu());
    info("app", "startup complete", { logFile: getLogFilePath(), openDefaultPetOnLaunch: shouldOpenDefaultPetOnLaunch() });
    console.log("OpenPets desktop shell ready.");
  }).catch((error: unknown) => {
    releaseStartupInstallLock();
    logError("app", "startup failed", error);
    console.error("Failed to start OpenPets desktop shell.", error);
    app.quit();
  });
}

function parseDevPluginEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(delimiter).map((item) => item.trim()).filter(Boolean).map((item) => resolve(item));
}

function resolveBundledOfficialPluginRoots(): string[] {
  const candidates = [join(process.resourcesPath, "plugins", "official"), resolve(process.cwd(), "plugins", "official"), resolve(app.getAppPath(), "..", "..", "plugins", "official")];
  return Array.from(new Set(candidates.filter((candidate) => existsSync(candidate))));
}

function writePluginRuntimeLog(level: "debug" | "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void {
  if (level === "error") logError("plugin", message, fields);
  else if (level === "info") info("plugin", message, fields);
  else if (level === "warn") warn("plugin", message, fields);
  else debug("plugin", message, fields);
}
