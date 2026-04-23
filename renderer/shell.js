const compactButton = document.getElementById("compactButton");
const compactAltButton = document.getElementById("compactAltButton");
const pinButton = document.getElementById("pinButton");
const flexButton = document.getElementById("flexButton");
const minimizeButton = document.getElementById("minimizeButton");
const closeButton = document.getElementById("closeButton");
const compactPlayer = document.getElementById("compactPlayer");
const compactPlayerAlt = document.getElementById("compactPlayerAlt");
const expandButton = document.getElementById("expandButton");
const expandButtonAlt = document.getElementById("expandButtonAlt");
const prevButton = document.getElementById("prevButton");
const playButton = document.getElementById("playButton");
const nextButton = document.getElementById("nextButton");
const likeButton = document.getElementById("likeButton");
const prevButtonAlt = document.getElementById("prevButtonAlt");
const playButtonAlt = document.getElementById("playButtonAlt");
const nextButtonAlt = document.getElementById("nextButtonAlt");
const likeButtonAlt = document.getElementById("likeButtonAlt");
const trackTitle = document.getElementById("trackTitle");
const trackArtist = document.getElementById("trackArtist");
const trackTitleAlt = document.getElementById("trackTitleAlt");
const trackArtistAlt = document.getElementById("trackArtistAlt");
const artwork = document.getElementById("artwork");
const artworkAlt = document.getElementById("artworkAlt");
const loadingOverlay = document.getElementById("loadingOverlay");
const healthDot = document.getElementById("healthDot");
const healthSubline = document.getElementById("healthSubline");
const progressCurrentAlt = document.getElementById("progressCurrentAlt");
const progressDurationAlt = document.getElementById("progressDurationAlt");
const progressFillAlt = document.getElementById("progressFillAlt");
const progressThumbAlt = document.getElementById("progressThumbAlt");
const scrollingElements = [trackTitle, trackArtist, trackTitleAlt, trackArtistAlt];

// Renderer shell state and interaction notes, signed dnlumis.
let shellState = {
  compact: false,
  compactVariant: 1,
  pinned: true,
  flexible: false,
};

function setShellMode(compact, compactVariant = shellState.compactVariant) {
  const normalizedVariant = Number(compactVariant) === 2 ? 2 : 1;
  shellState.compact = compact;
  shellState.compactVariant = normalizedVariant;
  document.body.classList.toggle("mode-compact", compact);
  document.body.classList.toggle("mode-expanded", !compact);
  document.body.classList.toggle("compact-variant-1", compact && normalizedVariant === 1);
  document.body.classList.toggle("compact-variant-2", compact && normalizedVariant === 2);
  compactButton.classList.toggle("is-active", compact && normalizedVariant === 1);
  compactAltButton.classList.toggle("is-active", compact && normalizedVariant === 2);
  compactButton.title = compact && normalizedVariant === 1 ? "Compact mode active" : "Compact mode";
  compactAltButton.title = compact && normalizedVariant === 2 ? "Alt compact mode active" : "Alt compact mode";
}

function setPinned(pinned) {
  shellState.pinned = pinned;
  pinButton.classList.toggle("is-active", pinned);
  pinButton.title = pinned ? "Pinned" : "Pin";
}

function setFlexible(flexible) {
  shellState.flexible = flexible;
  flexButton.classList.toggle("is-active", flexible);
  flexButton.title = flexible ? "Lock size" : "Adjust size";
  flexButton.disabled = shellState.compact;
}

function formatTime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function updateProgress(currentTime, duration) {
  const safeCurrent = Number.isFinite(currentTime) ? currentTime : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const ratio = safeDuration > 0 ? Math.min(1, safeCurrent / safeDuration) : 0;

  progressCurrentAlt.textContent = formatTime(safeCurrent);
  progressDurationAlt.textContent = formatTime(safeDuration);
  progressFillAlt.style.width = `${ratio * 100}%`;
  progressThumbAlt.style.left = `${ratio * 100}%`;
}

function setLikedState(liked) {
  [likeButton, likeButtonAlt].forEach((button) => {
    button.classList.toggle("is-active", !!liked);
    button.setAttribute("aria-pressed", liked ? "true" : "false");
    button.title = liked ? "Liked" : "Like";
  });
}

function setPlayState(button, playing) {
  button.dataset.playing = playing ? "true" : "false";
  button.setAttribute("aria-label", playing ? "Pause" : "Play");
  button.title = playing ? "Pause" : "Play";
}

function updateScrollingBehavior(element) {
  const track = element.querySelector(".scroll-track");
  if (!track) {
    return;
  }

  const copies = track.querySelectorAll(".scroll-copy");
  const primaryCopy = copies[0];
  if (!primaryCopy) {
    return;
  }

  const gap = 28;
  const overflow = primaryCopy.scrollWidth - element.clientWidth;
  if (overflow <= 2) {
    element.classList.add("is-static");
    element.style.removeProperty("--scroll-distance");
    element.style.removeProperty("--marquee-duration");
    return;
  }

  const distance = primaryCopy.scrollWidth + gap;
  const speed = 42;
  const baseDuration = Number.parseFloat(getComputedStyle(element).getPropertyValue("--base-duration")) || 12;
  const duration = Math.max(baseDuration, distance / speed);

  element.classList.remove("is-static");
  element.style.setProperty("--scroll-distance", `${distance}px`);
  element.style.setProperty("--marquee-duration", `${duration.toFixed(2)}s`);
}

function setScrollingText(element, text) {
  const safeText = text || "";
  if (element.getAttribute("aria-label") === safeText && element.querySelector(".scroll-track")) {
    requestAnimationFrame(() => updateScrollingBehavior(element));
    return;
  }

  element.textContent = "";
  element.setAttribute("aria-label", safeText);
  element.classList.add("is-static");

  const track = document.createElement("span");
  track.className = "scroll-track";

  for (let index = 0; index < 2; index += 1) {
    const copy = document.createElement("span");
    copy.className = "scroll-copy";
    copy.textContent = safeText;
    track.appendChild(copy);
  }

  element.appendChild(track);
  requestAnimationFrame(() => updateScrollingBehavior(element));
}

function setMetadata(data) {
  if (!data) {
    return;
  }

  // Keep the compact player readable even when the hosted page reports partial metadata.
  const title = data.title || "YouTube Music";
  const artist = data.artist || "Sign in and start playback";

  setScrollingText(trackTitle, title);
  setScrollingText(trackArtist, artist);
  setScrollingText(trackTitleAlt, title);
  setScrollingText(trackArtistAlt, artist);
  setPlayState(playButton, !!data.playing);
  setPlayState(playButtonAlt, !!data.playing);
  updateProgress(data.currentTime, data.duration);
  setLikedState(data.liked);

  const artworkUrl = data.artworkUrl || "";
  if (artworkUrl) {
    const artworkBackground = `linear-gradient(145deg, rgba(255,255,255,0.16), transparent 42%), url("${artworkUrl}")`;
    artwork.style.backgroundImage = artworkBackground;
    artworkAlt.style.backgroundImage = artworkBackground;
  } else {
    artwork.style.backgroundImage = "";
    artworkAlt.style.backgroundImage = "";
  }
}

function setLoadingState(loading) {
  loadingOverlay.classList.toggle("hidden", !loading);
}

function getHeaderConnectionLabel(health) {
  const effectiveType = typeof health?.effectiveType === "string" ? health.effectiveType.toLowerCase() : "";

  if (effectiveType === "4g") {
    return "Good";
  }

  if (effectiveType === "3g") {
    return "Fair";
  }

  if (effectiveType === "2g" || effectiveType === "slow-2g") {
    return "Poor";
  }

  if (typeof health?.downlink === "number") {
    if (health.downlink >= 1.5) {
      return "Good";
    }

    if (health.downlink >= 0.5) {
      return "Fair";
    }

    return "Poor";
  }

  return "Network";
}

function getHeaderDotTone(headerLabel, fallbackTone) {
  if (headerLabel === "Good") {
    return "good";
  }

  if (headerLabel === "Fair") {
    return "warn";
  }

  if (headerLabel === "Poor") {
    return "bad";
  }

  return fallbackTone || "neutral";
}

function setHealthState(health) {
  if (!health) {
    return;
  }

  // The header and compact footer mirror the same health signal at different emphasis levels.
  const downlinkText = typeof health.downlink === "number" ? `${health.downlink.toFixed(1)} Mbps` : "No downlink";
  const headerLabel = getHeaderConnectionLabel(health);
  const headerDotTone = getHeaderDotTone(headerLabel, health.tone);
  const headerSubline = typeof health.downlink === "number"
    ? `${headerLabel} • ${downlinkText}`
    : headerLabel;

  healthSubline.textContent = headerSubline;
  healthDot.classList.remove("tone-good", "tone-warn", "tone-bad", "tone-neutral");
  healthDot.classList.add(`tone-${headerDotTone}`);
}

async function initializeShell() {
  const state = await window.ytmShell.getState();
  setShellMode(state.compact, state.compactVariant);
  setPinned(state.pinned);
  setFlexible(state.flexible);
}

async function toggleCompactMode() {
  const state = await window.ytmShell.toggleCompact();
  setShellMode(state.compact, state.compactVariant);
  setPinned(state.pinned);
  setFlexible(state.flexible);
}

async function enterCompactVariant(variant) {
  const state = await window.ytmShell.enterCompactVariant(variant);
  setShellMode(state.compact, state.compactVariant);
  setPinned(state.pinned);
  setFlexible(state.flexible);
}

async function expandFromCompact() {
  if (!shellState.compact) {
    return;
  }

  await toggleCompactMode();
}

compactButton.addEventListener("click", () => enterCompactVariant(1));
compactAltButton.addEventListener("click", () => enterCompactVariant(2));

pinButton.addEventListener("click", async () => {
  const state = await window.ytmShell.togglePin();
  setPinned(state.pinned);
  setFlexible(state.flexible);
});

flexButton.addEventListener("click", async () => {
  const state = await window.ytmShell.toggleFlexible();
  setPinned(state.pinned);
  setFlexible(state.flexible);
});

minimizeButton.addEventListener("click", () => {
  window.ytmShell.minimize();
});

closeButton.addEventListener("click", () => {
  window.ytmShell.close();
});

expandButton.addEventListener("click", expandFromCompact);
expandButtonAlt.addEventListener("click", expandFromCompact);
playButton.addEventListener("click", () => window.ytmShell.playerAction("playPause"));
prevButton.addEventListener("click", () => window.ytmShell.playerAction("prev"));
nextButton.addEventListener("click", () => window.ytmShell.playerAction("next"));
likeButton.addEventListener("click", () => window.ytmShell.playerAction("like"));
playButtonAlt.addEventListener("click", () => window.ytmShell.playerAction("playPause"));
prevButtonAlt.addEventListener("click", () => window.ytmShell.playerAction("prev"));
nextButtonAlt.addEventListener("click", () => window.ytmShell.playerAction("next"));
likeButtonAlt.addEventListener("click", () => window.ytmShell.playerAction("like"));

compactPlayer.addEventListener("dblclick", (event) => {
  if (event.target.closest(".player-button")) {
    return;
  }

  // Double-clicking the compact background is the quick path back to expanded mode.
  expandFromCompact();
});

compactPlayerAlt.addEventListener("dblclick", (event) => {
  if (event.target.closest(".player-button")) {
    return;
  }

  expandFromCompact();
});

window.ytmShell.onWindowState((state) => {
  setShellMode(state.compact, state.compactVariant);
  setPinned(state.pinned);
  setFlexible(state.flexible);
});

window.ytmShell.onPlayerMetadata((data) => {
  setMetadata(data);
});

window.ytmShell.onPlayerLoading((state) => {
  setLoadingState(state.loading);
});

window.ytmShell.onPlayerHealth((health) => {
  setHealthState(health);
});

window.addEventListener("resize", () => {
  scrollingElements.forEach(updateScrollingBehavior);
});

initializeShell();
