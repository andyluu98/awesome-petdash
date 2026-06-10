import { Menu, Tray, type MenuItemConstructorOptions } from "electron";

import { getAppStateSnapshot } from "./app-state.js";
import { createTrayIcon } from "./assets.js";
import { hideDefaultPet, isDefaultPetVisible, setDefaultPetPaused, showDefaultPet } from "./default-pet-controller.js";
import { quitOpenPets } from "./lifecycle.js";
import { info, openLogsFolder } from "./logger.js";
import { shellState, togglePaused } from "./state.js";
import { getUpdateStatus, openUpdateReleasePage } from "./update-checker.js";
import { openControlCenterWindow } from "./windows.js";

let tray: Tray | null = null;

export function createAppTray(): Tray {
  if (tray) {
    return tray;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("PetDash");
  refreshTrayMenu();
  info("tray", "created");
  console.log("OpenPets tray created.");

  return tray;
}

export function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }

  const state = getAppStateSnapshot();
  const defaultPet = state.pets.installed.find((pet) => pet.id === state.preferences.defaultPetId && !pet.broken) ?? state.pets.installed[0];
  const defaultPetName = defaultPet?.displayName ?? "Built-in Pet";

  const menu = Menu.buildFromTemplate([
    {
      label: "PetDash",
      enabled: false,
    },
    ...createUpdateMenuItems(),
    { type: "separator" },
    {
      label: `Default Pet: ${defaultPetName}`,
      click: () => openControlCenterWindow("pets"),
    },
    {
      label: isDefaultPetVisible() ? "Hide Default Pet" : "Show Default Pet",
      click: () => {
        if (isDefaultPetVisible()) {
          hideDefaultPet();
        } else {
          showDefaultPet();
        }

        refreshTrayMenu();
      },
    },
    {
      label: shellState.paused ? "Resume All Pets" : "Pause All Pets",
      click: () => {
        const paused = togglePaused();
        setDefaultPetPaused(paused);
        info("tray", "pause toggled", { paused });
        console.log(paused ? "OpenPets paused." : "OpenPets resumed.");
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Manage Pets...",
      click: () => openControlCenterWindow("pets"),
    },
    {
      label: "Control Center...",
      click: () => openControlCenterWindow(),
    },
    {
      label: "Integrations...",
      click: () => openControlCenterWindow("integrations"),
    },
    {
      label: "Plugins...",
      click: () => openControlCenterWindow("plugins"),
    },
    {
      label: "Settings...",
      click: () => openControlCenterWindow("settings"),
    },
    {
      label: "Open Logs Folder...",
      click: () => { void openLogsFolder(); },
    },
    { type: "separator" },
    {
      label: "Quit PetDash",
      click: () => quitOpenPets(),
    },
  ]);

  tray.setContextMenu(menu);
}

function createUpdateMenuItems(): MenuItemConstructorOptions[] {
  const status = getUpdateStatus();
  if (status.state !== "available") return [];
  return [
    {
      label: `Update available: ${status.latestVersion ?? "latest"}...`,
      click: () => { void openUpdateReleasePage(); },
    },
  ];
}
