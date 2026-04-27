const usernameInput = document.getElementById("username");
const autoStartCheckbox = document.getElementById("autoStart");
const closeOnLaunchCheckbox = document.getElementById("closeOnLaunch");
const playButton = document.getElementById("playButton");
const cancelAutoStartButton = document.getElementById("cancelAutoStartButton");
const statusElement = document.getElementById("status");
const minimizeButton = document.getElementById("minimizeButton");
const closeButton = document.getElementById("closeButton");

let launchInProgress = false;
let autoStartTimer = null;
let autoStartCancelled = false;

function setStatus(message, type = "neutral") {
  statusElement.textContent = message;
  statusElement.dataset.state = type;
}

function setBusy(isBusy) {
  launchInProgress = isBusy;
  playButton.disabled = isBusy;
  cancelAutoStartButton.disabled = isBusy;
  usernameInput.disabled = isBusy;
  autoStartCheckbox.disabled = isBusy;
  closeOnLaunchCheckbox.disabled = isBusy;
  playButton.textContent = isBusy ? "Launching..." : "Play";
}

function clearAutoStartTimer() {
  if (autoStartTimer) {
    clearTimeout(autoStartTimer);
    autoStartTimer = null;
  }
}

function cancelAutoStart(showMessage = true) {
  autoStartCancelled = true;
  clearAutoStartTimer();
  cancelAutoStartButton.hidden = true;

  if (showMessage) {
    setStatus("Auto-start cancelled. Launcher will stay open.", "success");
  }
}

async function persistSettings() {
  return window.launcherApi.saveSettings({
    username: usernameInput.value,
    autoStart: autoStartCheckbox.checked,
    closeOnLaunch: closeOnLaunchCheckbox.checked
  });
}

async function handlePlay() {
  if (launchInProgress) {
    return;
  }

  try {
    setBusy(true);
    setStatus("Saving settings...", "neutral");
    const saved = await persistSettings();
    usernameInput.value = saved.username;
    autoStartCheckbox.checked = saved.autoStart;
    closeOnLaunchCheckbox.checked = saved.closeOnLaunch;

    setStatus("Launching T6MP in LAN mode...", "neutral");
    const result = await window.launcherApi.play({
      username: saved.username,
      closeOnLaunch: saved.closeOnLaunch
    });
    setStatus(`Launched ${result.username} from ${result.gameDir}`, "success");
  } catch (error) {
    setStatus(error.message || "Launch failed.", "error");
  } finally {
    setBusy(false);
  }
}

async function initialize() {
  try {
    const settings = await window.launcherApi.loadSettings();
    usernameInput.value = settings.username;
    autoStartCheckbox.checked = settings.autoStart;
    closeOnLaunchCheckbox.checked = settings.closeOnLaunch;

    if (settings.autoStart && settings.username.trim()) {
      autoStartCancelled = false;
      cancelAutoStartButton.hidden = false;
      setStatus("Auto-start in 5 seconds. Cancel if you need the launcher.", "neutral");
      autoStartTimer = setTimeout(async () => {
        autoStartTimer = null;
        cancelAutoStartButton.hidden = true;

        if (!autoStartCancelled) {
          await handlePlay();
        }
      }, 5000);
    }
  } catch (error) {
    setStatus(error.message || "Could not load settings.", "error");
  }
}

playButton.addEventListener("click", () => {
  clearAutoStartTimer();
  cancelAutoStartButton.hidden = true;
  handlePlay();
});

cancelAutoStartButton.addEventListener("click", () => {
  cancelAutoStart();
});

minimizeButton.addEventListener("click", () => {
  window.launcherApi.minimizeWindow();
});

closeButton.addEventListener("click", () => {
  window.launcherApi.closeWindow();
});

usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handlePlay();
  }
});

autoStartCheckbox.addEventListener("change", async () => {
  try {
    if (!autoStartCheckbox.checked) {
      cancelAutoStart(false);
    }

    const saved = await persistSettings();
    usernameInput.value = saved.username;
    autoStartCheckbox.checked = saved.autoStart;
    closeOnLaunchCheckbox.checked = saved.closeOnLaunch;
    setStatus("Settings saved.", "success");
  } catch (error) {
    setStatus(error.message || "Could not save settings.", "error");
  }
});

closeOnLaunchCheckbox.addEventListener("change", async () => {
  try {
    const saved = await persistSettings();
    usernameInput.value = saved.username;
    autoStartCheckbox.checked = saved.autoStart;
    closeOnLaunchCheckbox.checked = saved.closeOnLaunch;
    setStatus("Settings saved.", "success");
  } catch (error) {
    setStatus(error.message || "Could not save settings.", "error");
  }
});

usernameInput.addEventListener("blur", async () => {
  try {
    const saved = await persistSettings();
    usernameInput.value = saved.username;
  } catch (error) {
    setStatus(error.message || "Could not save username.", "error");
  }
});

initialize();
