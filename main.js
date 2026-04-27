const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SETTINGS_FILE = "settings.json";
const LAUNCHER_SCRIPT_FILE = "launch-plutonium.cmd";

function createWindow() {
  const window = new BrowserWindow({
    width: 460,
    height: 460,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "src", "index.html"));
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function getLauncherScriptPath() {
  return path.join(app.getPath("userData"), LAUNCHER_SCRIPT_FILE);
}

async function loadSettings() {
  try {
    const raw = await fs.readFile(getSettingsPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      username: typeof parsed.username === "string" ? parsed.username : "",
      autoStart: Boolean(parsed.autoStart),
      closeOnLaunch: Boolean(parsed.closeOnLaunch)
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to load settings:", error);
    }

    return {
      username: "",
      autoStart: false,
      closeOnLaunch: false
    };
  }
}

async function saveSettings(settings) {
  const nextSettings = {
    username: typeof settings.username === "string" ? settings.username.trim() : "",
    autoStart: Boolean(settings.autoStart),
    closeOnLaunch: Boolean(settings.closeOnLaunch)
  };

  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(getSettingsPath(), JSON.stringify(nextSettings, null, 2), "utf8");
  return nextSettings;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findBootstrapper() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error("LOCALAPPDATA is not available on this system.");
  }

  const directCandidates = [
    path.join(localAppData, "Plutonium", "bin", "plutonium-bootstrapper-win32.exe"),
    path.join(localAppData, "Plutonium", "plutonium-bootstrapper-win32.exe")
  ];

  for (const candidate of directCandidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  const roots = [
    path.join(localAppData, "Plutonium"),
    localAppData
  ];

  for (const root of roots) {
    if (!(await fileExists(root))) {
      continue;
    }

    const match = await walkForBootstrapper(root);
    if (match) {
      return match;
    }
  }

  throw new Error("Could not find plutonium-bootstrapper-win32.exe.");
}

async function walkForBootstrapper(root) {
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    let entries;

    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isFile() && entry.name.toLowerCase() === "plutonium-bootstrapper-win32.exe") {
        return fullPath;
      }

      if (entry.isDirectory()) {
        queue.push(fullPath);
      }
    }
  }

  return null;
}

async function readGameDirFromConfig(plutoConfigPath) {
  const raw = await fs.readFile(plutoConfigPath, "utf8");
  const parsed = JSON.parse(raw);

  if (typeof parsed.t6Path !== "string" || parsed.t6Path.trim() === "") {
    throw new Error(`Could not read t6Path from ${plutoConfigPath}.`);
  }

  return parsed.t6Path.trim();
}

async function launchGame(username) {
  const trimmedUsername = typeof username === "string" ? username.trim() : "";
  if (!trimmedUsername) {
    throw new Error("Enter a username before launching.");
  }

  const bootstrapperPath = await findBootstrapper();
  const plutoniumRoot = path.resolve(path.dirname(bootstrapperPath), "..");
  const plutoniumConfigPath = path.join(plutoniumRoot, "config.json");

  if (!(await fileExists(plutoniumConfigPath))) {
    throw new Error(`Could not find Plutonium config at ${plutoniumConfigPath}.`);
  }

  const gameDir = await readGameDirFromConfig(plutoniumConfigPath);
  if (!(await fileExists(gameDir))) {
    throw new Error(`Saved t6Path does not exist: ${gameDir}`);
  }

  const launcherScript = [
    "@echo off",
    "setlocal EnableExtensions DisableDelayedExpansion",
    `cd /d "${plutoniumRoot}"`,
    `start "Plutonium Bootstrapper" "${bootstrapperPath}" t6mp "${gameDir}" +name "${trimmedUsername}" -lan`,
    "exit /b 0",
    ""
  ].join("\r\n");

  const launcherScriptPath = getLauncherScriptPath();
  await fs.writeFile(launcherScriptPath, launcherScript, "utf8");

  spawn(
    "cmd.exe",
    ["/c", launcherScriptPath],
    {
      cwd: plutoniumRoot,
      detached: false,
      windowsHide: false
    }
  );

  return {
    bootstrapperPath,
    gameDir,
    username: trimmedUsername
  };
}

ipcMain.handle("settings:load", async () => loadSettings());
ipcMain.handle("settings:save", async (_event, settings) => saveSettings(settings));
ipcMain.handle("launcher:play", async (event, payload) => {
  const username = typeof payload?.username === "string" ? payload.username : "";
  const closeOnLaunch = Boolean(payload?.closeOnLaunch);
  const result = await launchGame(username);

  if (closeOnLaunch) {
    const window = BrowserWindow.fromWebContents(event.sender);
    setTimeout(() => {
      window?.close();
    }, 300);
  }

  return result;
});
ipcMain.on("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
