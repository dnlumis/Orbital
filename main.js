const path = require("path");
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray,
  WebContentsView,
} = require("electron");

// Floating YouTube Music shell notes, signed dnlumis.
const PARTITION = "persist:ytm-shell";
const WINDOW_BOUNDS = {
  expanded: { width: 430, height: 760 },
  compact: {
    1: { width: 360, height: 132 },
    2: { width: 468, height: 292 },
  },
};
const FLEX_BOUNDS = {
  minWidth: WINDOW_BOUNDS.expanded.width,
  minHeight: WINDOW_BOUNDS.expanded.height,
};
const SHELL_LAYOUT = {
  outerPadding: 0,
  titlebarHeight: 42,
  bottomPadding: 0,
  contentRadius: 0,
};
const SAFE_EXTERNAL_HOSTS = new Set([
  "music.youtube.com",
  "www.youtube.com",
  "youtube.com",
]);
const APP_ICON_PATH = path.join(__dirname, "assets", "tray-taskbar-icon.png");

let mainWindow = null;
let youtubeView = null;
let authWindow = null;
let metadataTimer = null;
let tray = null;
let isCompact = false;
let compactVariant = 1;
let isPinned = true;
let isContentReady = false;
let youtubeSession = null;
let isFlexible = false;
let lastMetadata = {
  title: "YouTube Music",
  artist: "Waiting for player",
  artworkUrl: "",
  playing: false,
  liked: false,
};
let lastHealth = {
  label: "Connecting",
  detail: "Waiting for player",
  tone: "neutral",
};

const METADATA_SCRIPT = `
  (() => {
    // Prefer Media Session data, then fall back to visible player-bar nodes.
    const media = navigator.mediaSession && navigator.mediaSession.metadata
      ? {
          title: navigator.mediaSession.metadata.title || "",
          artist: navigator.mediaSession.metadata.artist || "",
          artworkUrl: (navigator.mediaSession.metadata.artwork || []).slice(-1)[0]?.src || "",
          playing: navigator.mediaSession.playbackState === "playing"
        }
      : null;

    const titleNode = document.querySelector("ytmusic-player-bar .title");
    const artistNode = document.querySelector("ytmusic-player-bar .byline");
    const imageNode = document.querySelector("ytmusic-player-bar img");
    const playButton = document.querySelector("ytmusic-player-bar tp-yt-paper-icon-button.play-pause-button");
    const playLabel = playButton?.getAttribute("title") || playButton?.getAttribute("aria-label") || "";
    const mediaElement = document.querySelector("video, audio");

    function findLikeButton() {
      const roots = [
        document.querySelector("ytmusic-like-button-renderer"),
        document.querySelector("ytmusic-player-bar"),
        document,
      ].filter(Boolean);

      for (const root of roots) {
        const controls = root.querySelectorAll("button, tp-yt-paper-icon-button");
        for (const control of controls) {
          const label = (control.getAttribute("aria-label") || control.getAttribute("title") || control.textContent || "").trim();
          if (/like/i.test(label) && !/dislike/i.test(label)) {
            return control;
          }
        }
      }

      return null;
    }

    const likeButton = findLikeButton();
    const liked = likeButton?.getAttribute("aria-pressed") === "true" || likeButton?.dataset?.liked === "true";

    return {
      title: media?.title || titleNode?.textContent?.trim() || "",
      artist: media?.artist || artistNode?.textContent?.trim() || "",
      artworkUrl: media?.artworkUrl || imageNode?.src || "",
      playing: media?.playing || /pause/i.test(playLabel),
      currentTime: Number.isFinite(mediaElement?.currentTime) ? mediaElement.currentTime : 0,
      duration: Number.isFinite(mediaElement?.duration) ? mediaElement.duration : 0,
      liked,
    };
  })();
`;

const HEALTH_SCRIPT = `
  (() => {
    // Reduce a few browser/network signals into a compact playback health badge.
    const nav = navigator;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection || null;
    const online = nav.onLine !== false;
    const media = document.querySelector("video, audio");
    const playButton = document.querySelector("ytmusic-player-bar tp-yt-paper-icon-button.play-pause-button");
    const playLabel = playButton?.getAttribute("title") || playButton?.getAttribute("aria-label") || "";

    const readyState = media ? media.readyState : 0;
    const networkState = media ? media.networkState : 0;
    const paused = media ? !!media.paused : !/pause/i.test(playLabel);
    const downlink = typeof connection?.downlink === "number" ? connection.downlink : null;
    const effectiveType = typeof connection?.effectiveType === "string" ? connection.effectiveType : null;
    const saveData = !!connection?.saveData;
    const speedSuffix = downlink !== null ? " at " + downlink.toFixed(1) + " Mbps" : "";

    function getConnectionQuality() {
      if (effectiveType === "4g") {
        return "good";
      }

      if (effectiveType === "3g") {
        return "fair";
      }

      if (effectiveType === "2g" || effectiveType === "slow-2g") {
        return "poor";
      }

      if (downlink !== null) {
        if (downlink >= 1.5) {
          return "good";
        }

        if (downlink >= 0.5) {
          return "fair";
        }

        return "poor";
      }

      return null;
    }

    const connectionQuality = getConnectionQuality();
    const connectionPhrase = connectionQuality ? " on " + connectionQuality + " connection" : "";

    let tone = "neutral";
    let label = "Connecting";
    let detail = "Waiting for player";

    if (!online) {
      tone = "bad";
      label = "Offline";
      detail = "No network connection";
    } else if (saveData) {
      tone = "warn";
      label = "Data Saver";
      detail = "Reduced network mode reported";
    } else if (networkState === 3) {
      tone = "bad";
      label = "Network Error";
      detail = "Playback could not load";
    } else if (readyState >= 4 && !paused) {
      tone = downlink !== null && downlink < 1.5 ? "warn" : "good";
      label = tone === "good" ? "Stable" : "Adaptive";
      detail = connectionQuality
        ? "Streaming" + connectionPhrase + speedSuffix
        : "Playback buffer is healthy";
    } else if (readyState >= 3 && paused) {
      tone = "good";
      label = "Ready";
      detail = "Buffered and ready to play";
    } else {
      tone = "warn";
      label = "Buffering";
      detail = connectionQuality
        ? "Recovering" + connectionPhrase + speedSuffix
        : "Player is building buffer";
    }

    return {
      tone,
      label,
      detail,
      readyState,
      networkState,
      paused,
      effectiveType,
      downlink,
    };
  })();
`;

const PLAYER_ACTION_SCRIPT = `
  ((action) => {
    const roots = [
      document.querySelector("ytmusic-player-bar"),
      document,
    ].filter(Boolean);

    const selectorMap = {
      playPause: [
        "tp-yt-paper-icon-button.play-pause-button",
        "button.play-pause-button",
        '[aria-label*="Pause"]',
        '[aria-label*="Play"]',
        '[title*="Pause"]',
        '[title*="Play"]',
      ],
      next: [
        "tp-yt-paper-icon-button.next-button",
        "button.next-button",
        '[aria-label*="Next"]',
        '[title*="Next"]',
      ],
      prev: [
        "tp-yt-paper-icon-button.previous-button",
        "button.previous-button",
        '[aria-label*="Previous"]',
        '[title*="Previous"]',
      ],
      like: [
        "ytmusic-like-button-renderer button",
        "ytmusic-like-button-renderer tp-yt-paper-icon-button",
      ],
    };

    function findControl(selectors) {
      for (const root of roots) {
        for (const selector of selectors) {
          const matches = root.querySelectorAll(selector);
          for (const match of matches) {
            const label = (match.getAttribute("aria-label") || match.getAttribute("title") || match.textContent || "").trim();
            if (action === "like" && /dislike/i.test(label)) {
              continue;
            }

            if (match) {
              return match;
            }
          }
        }
      }

      return null;
    }

    function activateControl(control) {
      if (!control) {
        return false;
      }

      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, composed: true }));
      control.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, composed: true }));
      control.click();
      return true;
    }

    const control = findControl(selectorMap[action] || []);
    if (activateControl(control)) {
      return true;
    }

    if (action === "playPause") {
      const media = document.querySelector("video, audio");
      if (!media) {
        return false;
      }

      if (media.paused) {
        media.play?.();
      } else {
        media.pause?.();
      }

      return true;
    }

    return false;
  })
`;

function isYoutubeHost(hostname) {
  return hostname === "music.youtube.com" || hostname === "youtube.com" || hostname === "www.youtube.com";
}

function isAllowedInternalHost(hostname) {
  return (
    isYoutubeHost(hostname) ||
    hostname === "consent.youtube.com" ||
    hostname === "accounts.youtube.com" ||
    /^accounts\.google\.[a-z.]+$/i.test(hostname)
  );
}

function parseUrl(url) {
  try {
    return new URL(url);
  } catch (_error) {
    return null;
  }
}

function isAllowedInternalUrl(url) {
  const parsed = parseUrl(url);
  return !!parsed && parsed.protocol === "https:" && isAllowedInternalHost(parsed.hostname);
}

function isAllowedExternalUrl(url) {
  const parsed = parseUrl(url);
  return !!parsed && parsed.protocol === "https:" && SAFE_EXTERNAL_HOSTS.has(parsed.hostname);
}

function getCompactBounds(variant = compactVariant) {
  return WINDOW_BOUNDS.compact[variant] || WINDOW_BOUNDS.compact[1];
}

function getBottomLeftPosition(width, height) {
  const area = screen.getPrimaryDisplay().workArea;

  return {
    x: area.x + 20,
    y: area.y + area.height - height - 20,
  };
}

function getAppIcon() {
  const icon = nativeImage.createFromPath(APP_ICON_PATH);
  return icon.isEmpty() ? null : icon;
}

function createTrayIcon() {
  const icon = getAppIcon();
  return icon ? icon.resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
}

function isWindowVisible() {
  return !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized();
}

function getTrayTooltip() {
  const title = lastMetadata.title || "YouTube Music";
  const artist = lastMetadata.artist || "Waiting for player";
  return `Orbital\n${title}\n${artist}`;
}

function setTrayMetadata(data) {
  lastMetadata = {
    title: data?.title || "YouTube Music",
    artist: data?.artist || "Waiting for player",
    artworkUrl: data?.artworkUrl || "",
    playing: !!data?.playing,
    liked: !!data?.liked,
  };
  updateTrayMenu();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.hide();
}

function toggleMainWindowVisibility() {
  if (isWindowVisible()) {
    hideMainWindow();
    return;
  }

  showMainWindow();
}

function setCompactMode(nextCompact, nextVariant = compactVariant) {
  compactVariant = Number(nextVariant) === 2 ? 2 : 1;
  isCompact = !!nextCompact;
  resizeForMode(isCompact);
}

function togglePinnedState() {
  if (!mainWindow) {
    return;
  }

  isPinned = !isPinned;
  mainWindow.setAlwaysOnTop(isPinned, "screen-saver");
  broadcast("window:state", { compact: isCompact, compactVariant, pinned: isPinned, flexible: isFlexible });
  updateTrayMenu();
}

function toggleFlexibleState() {
  if (!mainWindow || isCompact) {
    return;
  }

  isFlexible = !isFlexible;
  applyResizePolicy();
  broadcast("window:state", { compact: isCompact, compactVariant, pinned: isPinned, flexible: isFlexible });
  updateTrayMenu();
}

function quitFromTray() {
  app.quit();
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const visibilityLabel = isWindowVisible() ? "Hide Orbital" : "Show Orbital";
  const trackLabel = [lastMetadata.title, lastMetadata.artist].filter(Boolean).join(" - ") || "YouTube Music";
  const menu = Menu.buildFromTemplate([
    { label: visibilityLabel, click: () => toggleMainWindowVisibility() },
    { type: "separator" },
    { label: trackLabel, enabled: false },
    { label: lastMetadata.playing ? "Pause" : "Play", click: () => runPlayerAction("playPause") },
    { label: "Previous", click: () => runPlayerAction("prev") },
    { label: "Next", click: () => runPlayerAction("next") },
    { label: lastMetadata.liked ? "Unlike" : "Like", click: () => runPlayerAction("like") },
    { type: "separator" },
    {
      label: "Layout",
      submenu: [
        { label: "Expanded", type: "radio", checked: !isCompact, click: () => setCompactMode(false) },
        { label: "Compact", type: "radio", checked: isCompact && compactVariant === 1, click: () => setCompactMode(true, 1) },
        { label: "Compact Wide", type: "radio", checked: isCompact && compactVariant === 2, click: () => setCompactMode(true, 2) },
      ],
    },
    { label: "Always On Top", type: "checkbox", checked: isPinned, click: () => togglePinnedState() },
    { label: "Adjust Size", type: "checkbox", checked: isFlexible, enabled: !isCompact, click: () => toggleFlexibleState() },
    { type: "separator" },
    { label: "Quit", click: () => quitFromTray() },
  ]);

  tray.setToolTip(getTrayTooltip());
  tray.setContextMenu(menu);
}

function createTray() {
  if (tray) {
    updateTrayMenu();
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.setIgnoreDoubleClickEvents(true);
  tray.on("click", () => {
    toggleMainWindowVisibility();
  });
  updateTrayMenu();
}

function broadcast(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function applyWindowMaterial() {
  if (!mainWindow || typeof mainWindow.setBackgroundMaterial !== "function" || process.platform !== "win32") {
    return;
  }

  try {
    // Keep both modes on acrylic so the expanded shell matches the mini player's glass feel.
    mainWindow.setBackgroundMaterial("acrylic");
  } catch (_error) {
    // Ignore on unsupported Windows versions.
  }
}

function applyResizePolicy() {
  if (!mainWindow) {
    return;
  }

  if (isCompact) {
    const target = getCompactBounds();
    mainWindow.setResizable(false);
    mainWindow.setMinimumSize(target.width, target.height);
    mainWindow.setMaximumSize(target.width, target.height);
    return;
  }

  if (isFlexible) {
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(FLEX_BOUNDS.minWidth, FLEX_BOUNDS.minHeight);
    // Use a very large ceiling so "Adjust" behaves like an uncapped resize mode.
    mainWindow.setMaximumSize(10000, 10000);
    return;
  }

  const target = WINDOW_BOUNDS.expanded;
  mainWindow.setResizable(false);
  mainWindow.setMinimumSize(target.width, target.height);
  mainWindow.setMaximumSize(target.width, target.height);
}

function setLoadingState(loading) {
  broadcast("player:loading", { loading });
}

function setHealthState(nextHealth) {
  lastHealth = nextHealth;
  broadcast("player:health", nextHealth);
}

function getContentBounds() {
  if (!mainWindow) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  // Keep the embedded YouTube surface aligned with the shell's visible content area.
  const [width, height] = mainWindow.getContentSize();
  const topInset = SHELL_LAYOUT.outerPadding + SHELL_LAYOUT.titlebarHeight;
  const horizontalInset = SHELL_LAYOUT.outerPadding;
  const bottomInset = SHELL_LAYOUT.outerPadding + SHELL_LAYOUT.bottomPadding;

  return {
    x: horizontalInset,
    y: topInset,
    width: Math.max(0, width - horizontalInset * 2),
    height: Math.max(0, height - topInset - bottomInset),
  };
}

function refreshYoutubeView() {
  if (!mainWindow || !youtubeView || mainWindow.isDestroyed() || mainWindow.isMinimized()) {
    return;
  }

  updateYoutubeBounds();
  if (!isCompact) {
    youtubeView.setVisible(true);
  }
}

function updateYoutubeBounds() {
  if (!youtubeView || !mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    return;
  }

  if (isCompact) {
    // Hide the native webview in compact mode so only the custom mini player is visible.
    youtubeView.setBounds({ x: -10000, y: -10000, width: 1, height: 1 });
    youtubeView.setVisible(false);
    return;
  }

  const bounds = getContentBounds();
  youtubeView.setVisible(true);
  youtubeView.setBounds(bounds);
}

async function pushMetadata() {
  if (!youtubeView || !isContentReady) {
    return;
  }

  try {
    const data = await youtubeView.webContents.executeJavaScript(METADATA_SCRIPT);
    setTrayMetadata(data);
    broadcast("player:metadata", data);
  } catch (_error) {
    const fallback = {
      title: "",
      artist: "Sign in and start playback",
      artworkUrl: "",
      playing: false,
      liked: false,
    };
    setTrayMetadata(fallback);
    broadcast("player:metadata", fallback);
  }
}

async function pushHealth() {
  if (!youtubeView || !isContentReady) {
    setHealthState({
      label: "Connecting",
      detail: "Waiting for player",
      tone: "neutral",
    });
    return;
  }

  try {
    const health = await youtubeView.webContents.executeJavaScript(HEALTH_SCRIPT);
    setHealthState(health);
  } catch (_error) {
    setHealthState({
      label: "Unknown",
      detail: "Health signal unavailable",
      tone: "neutral",
    });
  }
}

function startMetadataLoop() {
  clearInterval(metadataTimer);
  // Polling is the most reliable option here because the embedded site is third-party UI.
  metadataTimer = setInterval(() => {
    pushMetadata();
    pushHealth();
  }, 1500);
}

function createAuthWindow(url) {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    authWindow.loadURL(url);
    return;
  }

  authWindow = new BrowserWindow({
    width: 520,
    height: 760,
    parent: mainWindow || undefined,
    modal: false,
    autoHideMenuBar: true,
    show: false,
    title: "Google Sign In",
    icon: APP_ICON_PATH,
    backgroundColor: "#0b1018",
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      spellcheck: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  authWindow.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    if (isAllowedInternalUrl(nextUrl)) {
      authWindow.loadURL(nextUrl);
      return { action: "deny" };
    }

    if (isAllowedExternalUrl(nextUrl)) {
      shell.openExternal(nextUrl);
    }

    return { action: "deny" };
  });

  authWindow.webContents.on("will-navigate", (event, nextUrl) => {
    if (!isAllowedInternalUrl(nextUrl)) {
      event.preventDefault();
      if (isAllowedExternalUrl(nextUrl)) {
        shell.openExternal(nextUrl);
      }
    }
  });

  authWindow.webContents.on("will-redirect", (event, nextUrl) => {
    if (!isAllowedInternalUrl(nextUrl)) {
      event.preventDefault();
      if (isAllowedExternalUrl(nextUrl)) {
        shell.openExternal(nextUrl);
      }
    }
  });

  authWindow.webContents.on("did-finish-load", async () => {
    authWindow.show();
    const currentUrl = authWindow.webContents.getURL();
    if (parseUrl(currentUrl)?.hostname === "music.youtube.com") {
      await youtubeView?.webContents.loadURL("https://music.youtube.com");
      pushMetadata();
      pushHealth();
      authWindow.close();
    }
  });

  authWindow.on("closed", () => {
    authWindow = null;
  });

  authWindow.loadURL(url);
}

function attachSessionGuards() {
  if (!youtubeSession) {
    return;
  }

  youtubeSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  youtubeSession.setPermissionCheckHandler(() => false);

  if (typeof youtubeSession.setDisplayMediaRequestHandler === "function") {
    youtubeSession.setDisplayMediaRequestHandler((_request, callback) => {
      callback({ video: null, audio: null });
    });
  }

  if (typeof youtubeSession.setDevicePermissionHandler === "function") {
    youtubeSession.setDevicePermissionHandler(() => false);
  }

  youtubeSession.webRequest.onBeforeRequest((details, callback) => {
    if (details.resourceType !== "mainFrame") {
      callback({ cancel: false });
      return;
    }

    callback({ cancel: !isAllowedInternalUrl(details.url) });
  });
}

function attachYoutubeGuards() {
  youtubeView.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedInternalUrl(url)) {
      createAuthWindow(url);
      return { action: "deny" };
    }

    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  youtubeView.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedInternalUrl(url)) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) {
        shell.openExternal(url);
      }
    }
  });

  youtubeView.webContents.on("will-redirect", (event, url) => {
    if (!isAllowedInternalUrl(url)) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) {
        shell.openExternal(url);
      }
    }
  });
}

function attachYoutubeEvents() {
  const contents = youtubeView.webContents;

  contents.on("did-start-loading", () => {
    setLoadingState(true);
  });

  contents.on("did-stop-loading", async () => {
    setLoadingState(false);
    isContentReady = true;
    // Keep the host shell glassy, but give the embedded site an opaque dark base so
    // wallpaper/acrylic texture does not bleed through YouTube Music's content surfaces.
    await contents.insertCSS(`
      html, body {
        background: #05070c !important;
      }

      ytmusic-app,
      ytmusic-app-layout,
      ytmusic-player-page {
        background: #05070c !important;
      }
    `);
    pushMetadata();
    pushHealth();
  });

  contents.on("did-navigate", () => {
    pushMetadata();
    pushHealth();
  });

  contents.on("page-title-updated", (event) => {
    event.preventDefault();
    pushMetadata();
  });

  contents.on("media-started-playing", () => {
    pushMetadata();
    pushHealth();
  });

  contents.on("media-paused", () => {
    pushMetadata();
    pushHealth();
  });

  contents.on("render-process-gone", () => {
    isContentReady = false;
    setLoadingState(true);
    setHealthState({
      label: "Reloading",
      detail: "Player process restarted",
      tone: "warn",
    });
  });
}

function createYoutubeView() {
  youtubeView = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      spellcheck: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      autoplayPolicy: "document-user-activation-required",
    },
  });

  if (typeof youtubeView.setBorderRadius === "function") {
    // This stays in sync with SHELL_LAYOUT when we choose to round embedded content.
    youtubeView.setBorderRadius(SHELL_LAYOUT.contentRadius);
  }

  if (typeof youtubeView.webContents.setBackgroundColor === "function") {
    youtubeView.webContents.setBackgroundColor("#00000000");
  }

  mainWindow.contentView.addChildView(youtubeView);
  attachYoutubeGuards();
  attachYoutubeEvents();
  updateYoutubeBounds();
  youtubeView.webContents.loadURL("https://music.youtube.com");
}

function createWindow() {
  const startBounds = WINDOW_BOUNDS.expanded;
  const startPosition = getBottomLeftPosition(startBounds.width, startBounds.height);

  mainWindow = new BrowserWindow({
    width: startBounds.width,
    height: startBounds.height,
    x: startPosition.x,
    y: startPosition.y,
    minWidth: startBounds.width,
    minHeight: startBounds.height,
    maxWidth: startBounds.width,
    maxHeight: startBounds.height,
    frame: false,
    transparent: true,
    roundedCorners: false,
    show: false,
    backgroundColor: "#00000000",
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: "Orbital",
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true,
      spellcheck: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // The renderer paints the shell chrome; Electron just hosts the transparent window.
  mainWindow.loadFile(path.join(__dirname, "renderer", "shell.html"));
  mainWindow.once("ready-to-show", () => {
    applyWindowMaterial();
    mainWindow.show();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    broadcast("window:state", { compact: isCompact, compactVariant, pinned: isPinned, flexible: isFlexible });
    broadcast("player:health", lastHealth);
  });

  mainWindow.on("resize", refreshYoutubeView);
  mainWindow.on("move", refreshYoutubeView);
  mainWindow.on("hide", () => {
    updateTrayMenu();
  });
  mainWindow.on("minimize", () => {
    updateTrayMenu();
  });
  mainWindow.on("restore", () => {
    updateTrayMenu();
    setTimeout(refreshYoutubeView, 50);
  });
  mainWindow.on("show", () => {
    updateTrayMenu();
    setTimeout(refreshYoutubeView, 50);
  });
  mainWindow.on("focus", () => {
    setTimeout(refreshYoutubeView, 0);
  });
  mainWindow.on("closed", () => {
    clearInterval(metadataTimer);
    metadataTimer = null;
    youtubeView = null;
    mainWindow = null;
  });

  createYoutubeView();
  startMetadataLoop();
  applyResizePolicy();
}

function resizeForMode(nextCompact) {
  if (!mainWindow) {
    return;
  }

  const mode = nextCompact ? "compact" : "expanded";
  const target = nextCompact ? getCompactBounds() : WINDOW_BOUNDS[mode];
  const [x, y] = mainWindow.getPosition();
  const [currentWidth, currentHeight] = mainWindow.getSize();
  const nextY = y + (currentHeight - target.height);

  if (nextCompact) {
    isFlexible = false;
  }

  // Update the window constraints before resizing so Windows doesn't clamp
  // the new mode to the previous mode's fixed min/max size.
  applyResizePolicy();
  mainWindow.setBounds({
    x,
    y: Math.max(0, nextY),
    width: target.width,
    height: target.height,
  });
  applyWindowMaterial();
  updateYoutubeBounds();
  broadcast("window:state", { compact: isCompact, compactVariant, pinned: isPinned, flexible: isFlexible });
  updateTrayMenu();
}

async function runPlayerAction(action) {
  if (!youtubeView || !["playPause", "next", "prev", "like"].includes(action)) {
    return false;
  }

  try {
    const didTrigger = await youtubeView.webContents.executeJavaScript(
      `${PLAYER_ACTION_SCRIPT}(${JSON.stringify(action)})`
    );
    await pushMetadata();
    await pushHealth();
    return !!didTrigger;
  } catch (_error) {
    return false;
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.orbital.player");
  youtubeSession = session.fromPartition(PARTITION);
  attachSessionGuards();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      return;
    }

    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("window:get-state", () => ({
  compact: isCompact,
  compactVariant,
  pinned: isPinned,
  flexible: isFlexible,
}));

ipcMain.handle("window:toggle-compact", () => {
  isCompact = !isCompact;
  resizeForMode(isCompact);
  return { compact: isCompact, compactVariant, pinned: isPinned, flexible: isFlexible };
});

ipcMain.handle("window:enter-compact-variant", (_event, variant) => {
  const nextVariant = Number(variant) === 2 ? 2 : 1;
  compactVariant = nextVariant;

  if (!isCompact) {
    isCompact = true;
  }

  resizeForMode(true);
  return { compact: isCompact, compactVariant, pinned: isPinned, flexible: isFlexible };
});

ipcMain.handle("window:toggle-pin", () => {
  togglePinnedState();
  return { compact: isCompact, compactVariant, pinned: isPinned, flexible: isFlexible };
});

ipcMain.handle("window:toggle-flexible", () => {
  toggleFlexibleState();
  return { compact: isCompact, compactVariant, pinned: isPinned, flexible: isFlexible };
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:open-external", async (_event, url) => {
  if (typeof url === "string" && url.length > 0) {
    await shell.openExternal(url);
  }
});

ipcMain.handle("player:action", async (_event, action) => {
  return runPlayerAction(action);
});
