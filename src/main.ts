import { DEFAULT_VOLUME, SoundEngine } from "./audio";
import { initAnalytics, trackEvent } from "./analytics";
import { resolveOwnerMode } from "./owner";
import { PALETTE_PRESETS, loadPalette, matchingPreset, savePalette, type BlockPalette } from "./palette";
import { CanvasRecorder, downloadBlob } from "./recorder";
import { Renderer } from "./renderer";
import { patternFromUrl, patternLabel, patternUrl, shareText, syncAddressBar, xIntentUrl } from "./share";
import { CLASSIC_PATTERN, MAX_PATTERN, Simulation } from "./simulation";
import "./style.css";

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing required UI element: " + id);
  return element as T;
};

const canvas = byId<HTMLCanvasElement>("simulation");
const playButton = byId<HTMLButtonElement>("play-button");
const playIcon = byId<HTMLSpanElement>("play-icon");
const playLabel = byId<HTMLSpanElement>("play-label");
const resetButton = byId<HTMLButtonElement>("reset-button");
const statusDot = byId<HTMLSpanElement>("status-dot");
const statusLabel = byId<HTMLSpanElement>("status-label");
const timeValue = byId<HTMLElement>("time-value");
const ballsValue = byId<HTMLElement>("balls-value");
const brokenValue = byId<HTMLElement>("broken-value");
const clearValue = byId<HTMLElement>("clear-value");
const brokenUnit = byId<HTMLElement>("broken-unit");
const phaseTitle = byId<HTMLElement>("phase-title");
const phaseNumber = byId<HTMLElement>("phase-number");
const phaseDescription = byId<HTMLElement>("phase-description");
const comboValue = byId<HTMLElement>("combo-value");
const speedReadout = byId<HTMLElement>("speed-readout");
const downloadButton = byId<HTMLButtonElement>("download-button");
const recordNote = byId<HTMLElement>("record-note");
const patternName = byId<HTMLElement>("pattern-name");
const patternButton = byId<HTMLButtonElement>("pattern-button");
const classicButton = byId<HTMLButtonElement>("classic-button");
const fieldCorner = byId<HTMLElement>("field-corner");
const soundToggle = byId<HTMLButtonElement>("sound-toggle");
const soundVolume = byId<HTMLInputElement>("sound-volume");
const soundReadout = byId<HTMLElement>("sound-readout");
const downloadDialog = byId<HTMLDialogElement>("download-dialog");
const paletteName = byId<HTMLElement>("palette-name");
const palettePresets = byId<HTMLElement>("palette-presets");
const colorAInput = byId<HTMLInputElement>("color-a");
const colorBInput = byId<HTMLInputElement>("color-b");
const paletteSwap = byId<HTMLButtonElement>("palette-swap");
const shareButton = byId<HTMLButtonElement>("share-button");
const shareDialog = byId<HTMLDialogElement>("share-dialog");
const shareTitle = byId<HTMLElement>("share-dialog-title");
const shareUrlInput = byId<HTMLInputElement>("share-url");
const shareCopy = byId<HTMLButtonElement>("share-copy");
const shareX = byId<HTMLAnchorElement>("share-x");
const shareNative = byId<HTMLButtonElement>("share-native");
const phaseSegments = [...document.querySelectorAll<HTMLElement>(".phase-segment")];

const simulation = new Simulation();
const renderer = new Renderer(canvas);
const recorder = new CanvasRecorder(canvas);
const sound = new SoundEngine();
const recordingSupported = CanvasRecorder.isSupported();
/** Seconds to keep recording after the field is cleared, so the video ends on the "FIELD CLEARED" card. */
const RECORDING_TAIL_SECONDS = 2;
let finishedAt: number | null = null;
/** True while the recorder is being stopped and the file assembled. */
let finalizing = false;
/** Set once this run's recording has ended (cleared, or saved early), so it is not restarted mid-run. */
let recordingClosed = false;
/** Bumped on reset so a stop that finishes afterwards does not keep footage from the discarded run. */
let recordingGeneration = 0;
/** Pattern on screen when the current recording started; the finished video keeps it. */
let recordingPatternId = simulation.getPattern().id;
/** Finished video plus the pattern it actually shows (the field may have been switched since). */
let lastVideo: { blob: Blob; extension: string; patternId: number } | null = null;
/** Most balls on the field at once in the current run, quoted in the share text after a clear. */
let peakBalls = 0;
renderer.showStatsLine = recordingSupported;
let lastFrame = 0;
let accumulator = 0;
let uiRefreshFrame = 0;
const fixedStep = 1 / 120;
const phaseCopy = [
  ["Quiet beginning", "A single ball tests the edge of the packed field."],
  ["First chain", "Caught capsules bring in new balls and open new paths."],
  ["Acceleration", "More collisions feed a faster, wider chain reaction."],
  ["Cascade", "The packed field gives way to a storm of light and color."],
];

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return minutes + ":" + remainder;
}

function refreshUI(): void {
  const view = simulation.getView();
  const labels = {
    ready: ["READY TO RUN", "Start simulation", "▶"],
    running: ["SIMULATION LIVE", "Pause simulation", "Ⅱ"],
    paused: ["SIMULATION PAUSED", "Resume simulation", "▶"],
    finished: ["FIELD CLEARED", "Run it again", "↻"],
  }[view.status];

  statusLabel.textContent = labels[0];
  statusDot.classList.toggle("is-running", view.status === "running");
  statusDot.classList.toggle("is-paused", view.status === "paused");
  playLabel.textContent = labels[1];
  playIcon.textContent = labels[2];
  playButton.setAttribute("aria-label", labels[1]);
  timeValue.textContent = formatTime(view.elapsed);
  ballsValue.textContent = view.balls.length.toString().padStart(2, "0");
  brokenValue.textContent = view.destroyed.toLocaleString("en-US");
  brokenUnit.textContent = "OF " + view.breakableTotal.toLocaleString("en-US") + " BLOCKS";
  clearValue.textContent = ((view.destroyed / view.breakableTotal) * 100).toFixed(1) + "%";
  phaseNumber.textContent = view.phase.toString().padStart(2, "0");
  phaseTitle.textContent = phaseCopy[view.phase - 1][0];
  phaseDescription.textContent = phaseCopy[view.phase - 1][1];
  phaseSegments.forEach((segment, index) => {
    segment.classList.toggle("active", index < view.phase);
    segment.classList.toggle("current", index === view.phase - 1);
  });
  comboValue.textContent = view.combo > 1 ? "×" + view.combo : view.bestCombo > 1 ? "BEST ×" + view.bestCombo : "—";
  speedReadout.textContent = simulation.getSpeed().toString() + "×";

  refreshRecordUI();

  document.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((button) => {
    button.setAttribute("aria-pressed", Number(button.dataset.speed) === simulation.getSpeed() ? "true" : "false");
  });
}

function refreshRecordUI(): void {
  const active = recorder.state !== "idle";
  downloadButton.disabled = !recordingSupported || finalizing || (!active && !lastVideo);
  downloadButton.classList.toggle("is-ready", !active && !!lastVideo);
  downloadButton.classList.toggle("is-recording", active);
  if (!recordingSupported) {
    recordNote.textContent = "This browser cannot record video from the canvas.";
  } else if (finalizing) {
    recordNote.textContent = "Preparing video…";
  } else if (active) {
    const paused = recorder.state === "paused" ? " (PAUSED)" : "";
    recordNote.textContent = "● REC " + formatTime(recorder.duration) + paused + " · ↓ saves the footage so far";
  } else if (lastVideo) {
    recordNote.textContent = "Video ready · click ↓ to save it";
  } else {
    recordNote.textContent = "Each run is recorded automatically. Use ↓ to save it as a video.";
  }
}

function timestampForFilename(): string {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Ends the current recording and keeps the result as the video the download button saves. */
async function finalizeRecording(): Promise<void> {
  if (recorder.state === "idle" || finalizing) return;
  finalizing = true;
  recordingClosed = true;
  const generation = recordingGeneration;
  const extension = recorder.extension;
  refreshRecordUI();
  const blob = await recorder.stop();
  finalizing = false;
  if (generation === recordingGeneration && blob.size > 0) lastVideo = { blob, extension, patternId: recordingPatternId };
  refreshRecordUI();
}

/** Drops the in-progress recording when the run it belongs to is reset. */
function discardRecording(): void {
  recordingGeneration += 1;
  recordingClosed = false;
  finishedAt = null;
  if (recorder.state !== "idle") void recorder.stop();
}

function resetSimulation(): void {
  discardRecording();
  peakBalls = 0;
  simulation.reset();
}

/* ---------- Patterns ---------- */

const PATTERN_STORAGE_KEY = "chain-breaker:pattern";

function loadPattern(): number {
  try {
    const stored = Number(localStorage.getItem(PATTERN_STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= 0 && stored <= MAX_PATTERN) return stored;
  } catch {
    // Storage unavailable: start on the classic layout.
  }
  return CLASSIC_PATTERN;
}

function refreshPatternUI(): void {
  const pattern = simulation.getPattern();
  const number = "#" + pattern.id.toString().padStart(4, "0");
  patternName.textContent = number + " · " + pattern.name;
  patternName.title = patternName.textContent;
  fieldCorner.textContent = "PATTERN " + number;
  classicButton.disabled = pattern.id === CLASSIC_PATTERN;
}

/** Switches the field to another layout; the current recording belongs to the old one and is dropped. */
function usePattern(pattern: number): void {
  discardRecording();
  peakBalls = 0;
  simulation.setPattern(pattern);
  syncAddressBar(simulation.getPattern().id);
  try {
    localStorage.setItem(PATTERN_STORAGE_KEY, String(simulation.getPattern().id));
  } catch {
    // Not persisting is fine.
  }
  refreshPatternUI();
  refreshUI();
}

function newPattern(): void {
  const current = simulation.getPattern().id;
  let next = current;
  while (next === current) next = 1 + Math.floor(Math.random() * MAX_PATTERN);
  usePattern(next);
  trackEvent("new_pattern", { pattern_id: next });
}

async function downloadVideo(): Promise<void> {
  if (recorder.state !== "idle") await finalizeRecording();
  if (!lastVideo) return;
  downloadBlob(lastVideo.blob, `chain-breaker-${timestampForFilename()}.${lastVideo.extension}`);
  trackEvent("video_download", { pattern_id: lastVideo.patternId, file_type: lastVideo.extension });
}

/** Starts, pauses and resumes recording with playback, and closes it shortly after the field is cleared. */
function syncRecorder(): void {
  if (!recordingSupported || finalizing) return;
  const status = simulation.getView().status;
  if (status === "running") {
    if (recorder.state === "idle" && !recordingClosed) {
      lastVideo = null;
      recordingPatternId = simulation.getPattern().id;
      recorder.start(sound.recordingStream());
    } else {
      recorder.resume();
    }
  } else if (status === "paused") {
    recorder.pause();
  } else if (status === "finished" && recorder.state !== "idle") {
    finishedAt ??= performance.now();
    if (performance.now() - finishedAt >= RECORDING_TAIL_SECONDS * 1_000) void finalizeRecording();
  }
}

let lastTrackedStatus = simulation.getView().status;

/** Reports a run starting from the beginning and a run clearing the field. */
function trackRunMilestones(): void {
  const view = simulation.getView();
  if (view.status === lastTrackedStatus) return;
  const pattern_id = simulation.getPattern().id;
  // "Run it again" resets and starts in the same tick, so a restart shows up as finished → running.
  const fromTop = lastTrackedStatus === "ready" || lastTrackedStatus === "finished";
  if (fromTop && view.status === "running") trackEvent("run_start", { pattern_id });
  if (view.status === "finished") trackEvent("run_clear", { pattern_id, seconds: Math.round(view.elapsed) });
  lastTrackedStatus = view.status;
}

function animate(timestamp: number): void {
  if (lastFrame === 0) lastFrame = timestamp;
  const elapsed = Math.min((timestamp - lastFrame) / 1_000, 0.05);
  lastFrame = timestamp;

  if (simulation.getView().status === "running") {
    accumulator += elapsed * simulation.getSpeed();
    let steps = 0;
    while (accumulator >= fixedStep && steps < 32) {
      simulation.step(fixedStep);
      accumulator -= fixedStep;
      steps += 1;
      if (simulation.getView().status === "finished") break;
    }
    if (steps === 32) accumulator = 0;
    peakBalls = Math.max(peakBalls, simulation.getView().balls.length);
  } else {
    accumulator = 0;
  }

  sound.play(simulation.takeSoundCues(), simulation.getView().status === "running", elapsed);
  trackRunMilestones();
  renderer.draw(simulation);
  syncRecorder();
  if (uiRefreshFrame++ % 6 === 0) refreshUI();
  requestAnimationFrame(animate);
}

playButton.addEventListener("click", () => {
  if (simulation.getView().status === "finished") resetSimulation();
  simulation.togglePlayback();
  refreshUI();
});

patternButton.addEventListener("click", newPattern);
classicButton.addEventListener("click", () => usePattern(CLASSIC_PATTERN));

/* ---------- Copyright ---------- */

/** First year of publication; later years extend it to a range such as "2026–2027". */
const COPYRIGHT_START_YEAR = 2026;
const COPYRIGHT_HOLDER = "tariki-code";
{
  const currentYear = new Date().getFullYear();
  const years = currentYear > COPYRIGHT_START_YEAR ? `${COPYRIGHT_START_YEAR}–${currentYear}` : `${COPYRIGHT_START_YEAR}`;
  const copyright = document.querySelector<HTMLElement>("#copyright");
  if (copyright) copyright.textContent = `© ${years} ${COPYRIGHT_HOLDER}`;
}

/* ---------- Owner mode, credit and follow prompt ---------- */

const X_HANDLE = "@kobatch_tk";
const CREDIT_LINE = "CHAIN BREAKER · " + X_HANDLE;
/** Visitors get the credit line and the follow prompt; the owner (see owner.ts) gets neither. */
let ownerMode = false;
renderer.creditLine = CREDIT_LINE;
void resolveOwnerMode().then((isOwner) => {
  ownerMode = isOwner;
  renderer.creditLine = isOwner ? null : CREDIT_LINE;
  // The owner's own visits are not measured: analytics is never loaded in owner mode.
  if (!isOwner) initAnalytics();
});

document.querySelector(".follow-button")?.addEventListener("click", () => trackEvent("follow_click", { handle: X_HANDLE }));

downloadButton.addEventListener("click", () => {
  if (ownerMode || typeof downloadDialog.showModal !== "function") {
    void downloadVideo();
    return;
  }
  downloadDialog.returnValue = "";
  downloadDialog.showModal();
});

downloadDialog.addEventListener("close", () => {
  if (downloadDialog.returnValue === "save") void downloadVideo();
});

/* ---------- Share ---------- */

/** What to share: the pattern on screen, with the result once this run has cleared it. */
function currentShare(): { url: string; text: string; pattern: number } {
  const view = simulation.getView();
  const pattern = simulation.getPattern().id;
  const cleared = view.status === "finished" ? { seconds: view.elapsed, peakBalls } : null;
  return { url: patternUrl(pattern), text: shareText({ pattern, cleared }), pattern };
}

function trackShare(method: string, pattern: number): void {
  trackEvent("share", { method, content_type: "pattern", item_id: patternLabel(pattern), pattern_id: pattern });
}

/** Opens the OS share sheet; resolves false when it is unavailable or fails (a user cancel counts as handled). */
async function shareNatively(share: ReturnType<typeof currentShare>): Promise<boolean> {
  const data = { title: "CHAIN BREAKER " + patternLabel(share.pattern), text: share.text, url: share.url };
  if (typeof navigator.share !== "function" || (navigator.canShare && !navigator.canShare(data))) return false;
  try {
    await navigator.share(data);
    trackShare("native", share.pattern);
    return true;
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError";
  }
}

function openShareDialog(share: ReturnType<typeof currentShare>): void {
  const pattern = simulation.getPattern();
  shareTitle.textContent = patternLabel(pattern.id) + " · " + pattern.name;
  shareUrlInput.value = share.url;
  // "via" appends " via @kobatch_tk" to the post, for the owner too.
  shareX.href = xIntentUrl(share.text, share.url, X_HANDLE.slice(1));
  shareCopy.textContent = "Copy link";
  shareNative.hidden = typeof navigator.share !== "function";
  if (typeof shareDialog.showModal === "function") shareDialog.showModal();
  else window.prompt("Link to this pattern", share.url);
}

// Phones and tablets go straight to the OS share sheet (LINE, X, Messages…); other devices get the dialog.
const prefersShareSheet = window.matchMedia?.("(pointer: coarse)").matches ?? false;

shareButton.addEventListener("click", async () => {
  const share = currentShare();
  if (prefersShareSheet && (await shareNatively(share))) return;
  openShareDialog(share);
});

shareCopy.addEventListener("click", async () => {
  const share = currentShare();
  let copied = false;
  try {
    await navigator.clipboard.writeText(shareUrlInput.value);
    copied = true;
  } catch {
    // Older browsers or no clipboard permission: select the link so it can be copied by hand.
    shareUrlInput.focus();
    shareUrlInput.select();
    copied = document.execCommand?.("copy") ?? false;
  }
  shareCopy.textContent = copied ? "Copied ✓" : "Press ⌘C / Ctrl+C";
  if (copied) trackShare("copy_link", share.pattern);
});

shareUrlInput.addEventListener("focus", () => shareUrlInput.select());
// Clicking the dimmed backdrop (outside the panel) closes the dialog as well as × and Done.
shareDialog.addEventListener("click", (event) => {
  if (event.target === shareDialog) shareDialog.close();
});
shareX.addEventListener("click", () => trackShare("x", simulation.getPattern().id));
shareNative.addEventListener("click", async () => {
  if (await shareNatively(currentShare())) shareDialog.close();
});

resetButton.addEventListener("click", () => {
  resetSimulation();
  refreshUI();
});

document.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((button) => {
  button.addEventListener("click", () => {
    simulation.setSpeed(Number(button.dataset.speed));
    refreshUI();
  });
});

window.addEventListener("keydown", (event) => {
  if (downloadDialog.open || shareDialog.open) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
  if (event.code === "Space") {
    if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
    event.preventDefault();
    if (simulation.getView().status === "finished") resetSimulation();
    simulation.togglePlayback();
    refreshUI();
  } else if (event.key.toLowerCase() === "m") {
    toggleMute();
  } else if (event.key.toLowerCase() === "n") {
    newPattern();
  } else if (event.key.toLowerCase() === "r") {
    resetSimulation();
    refreshUI();
  }
});

/* ---------- Palette ---------- */

let palette: BlockPalette = loadPalette();

function applyPalette(next: BlockPalette, persist: boolean): void {
  palette = { a: next.a.toLowerCase(), b: next.b.toLowerCase() };
  renderer.setBlockColors(palette.a, palette.b);
  simulation.setBlockColors(palette.a, palette.b);
  document.documentElement.style.setProperty("--block-a", palette.a);
  document.documentElement.style.setProperty("--block-b", palette.b);
  colorAInput.value = palette.a;
  colorBInput.value = palette.b;
  const preset = matchingPreset(palette);
  paletteName.textContent = preset ? preset.name : "Custom";
  palettePresets.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.preset === preset?.id ? "true" : "false");
  });
  if (persist) savePalette(palette);
}

for (const preset of PALETTE_PRESETS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "palette-preset";
  button.dataset.preset = preset.id;
  button.setAttribute("aria-pressed", "false");
  const chip = document.createElement("span");
  chip.className = "palette-chip";
  chip.setAttribute("aria-hidden", "true");
  for (const color of [preset.colors.a, preset.colors.b]) {
    const half = document.createElement("i");
    half.style.background = color;
    chip.append(half);
  }
  button.append(chip, preset.name);
  button.addEventListener("click", () => applyPalette(preset.colors, true));
  palettePresets.append(button);
}

// "input" fires continuously while dragging in the picker, so the field recolours live.
colorAInput.addEventListener("input", () => applyPalette({ a: colorAInput.value, b: palette.b }, true));
colorBInput.addEventListener("input", () => applyPalette({ a: palette.a, b: colorBInput.value }, true));
paletteSwap.addEventListener("click", () => applyPalette({ a: palette.b, b: palette.a }, true));
applyPalette(palette, false);

// A shared link (?p=1234) wins over the pattern this browser last used, and becomes the remembered one.
const linkedPattern = patternFromUrl(MAX_PATTERN);
if (linkedPattern !== null) usePattern(linkedPattern);
else {
  simulation.setPattern(loadPattern());
  syncAddressBar(simulation.getPattern().id);
  refreshPatternUI();
}

/* ---------- Sound ---------- */

const SOUND_STORAGE_KEY = "chain-breaker:sound";

function loadSoundSettings(): { volume: number; muted: boolean } {
  try {
    const stored = JSON.parse(localStorage.getItem(SOUND_STORAGE_KEY) ?? "null") as { volume?: unknown; muted?: unknown } | null;
    if (stored && typeof stored.volume === "number" && typeof stored.muted === "boolean") {
      return { volume: Math.max(0, Math.min(1, stored.volume)), muted: stored.muted };
    }
  } catch {
    // Storage blocked or corrupt: use defaults.
  }
  return { volume: DEFAULT_VOLUME, muted: false };
}

let soundSettings = loadSoundSettings();

function applySoundSettings(persist: boolean): void {
  sound.setVolume(soundSettings.volume);
  sound.setMuted(soundSettings.muted);
  const percent = Math.round(soundSettings.volume * 100);
  soundVolume.value = String(percent);
  soundReadout.textContent = soundSettings.muted ? "MUTED" : percent + "%";
  soundToggle.setAttribute("aria-pressed", soundSettings.muted ? "true" : "false");
  soundToggle.setAttribute("aria-label", soundSettings.muted ? "Unmute sound" : "Mute sound");
  if (persist) {
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(soundSettings));
    } catch {
      // Not persisting is fine.
    }
  }
}

function toggleMute(): void {
  soundSettings = { ...soundSettings, muted: !soundSettings.muted };
  applySoundSettings(true);
}

// Browsers only allow audio after a user gesture. On touch screens a finger going down does not
// count yet (only lifting it does), so listen for the release events too; every gesture retries
// until the context is really running, which also recovers from iOS interruptions.
const unlockAudio = () => {
  if (!sound.running) sound.unlock();
};
for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
  window.addEventListener(type, unlockAudio, { capture: true, passive: true });
}

soundToggle.addEventListener("click", toggleMute);
soundVolume.addEventListener("input", () => {
  soundSettings = { volume: Number(soundVolume.value) / 100, muted: false };
  applySoundSettings(true);
});
applySoundSettings(false);

window.addEventListener("pagehide", () => renderer.destroy(), { once: true });

refreshUI();
requestAnimationFrame(animate);
