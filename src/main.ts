import { PALETTE_PRESETS, loadPalette, matchingPreset, savePalette, type BlockPalette } from "./palette";
import { CanvasRecorder, downloadBlob } from "./recorder";
import { Renderer } from "./renderer";
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
const paletteName = byId<HTMLElement>("palette-name");
const palettePresets = byId<HTMLElement>("palette-presets");
const colorAInput = byId<HTMLInputElement>("color-a");
const colorBInput = byId<HTMLInputElement>("color-b");
const paletteSwap = byId<HTMLButtonElement>("palette-swap");
const phaseSegments = [...document.querySelectorAll<HTMLElement>(".phase-segment")];

const simulation = new Simulation();
const renderer = new Renderer(canvas);
const recorder = new CanvasRecorder(canvas);
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
let lastVideo: { blob: Blob; extension: string } | null = null;
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
  if (generation === recordingGeneration && blob.size > 0) lastVideo = { blob, extension };
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
  simulation.setPattern(pattern);
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
}

async function downloadVideo(): Promise<void> {
  if (recorder.state !== "idle") await finalizeRecording();
  if (!lastVideo) return;
  downloadBlob(lastVideo.blob, `chain-breaker-${timestampForFilename()}.${lastVideo.extension}`);
}

/** Starts, pauses and resumes recording with playback, and closes it shortly after the field is cleared. */
function syncRecorder(): void {
  if (!recordingSupported || finalizing) return;
  const status = simulation.getView().status;
  if (status === "running") {
    if (recorder.state === "idle" && !recordingClosed) {
      lastVideo = null;
      recorder.start();
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
  } else {
    accumulator = 0;
  }

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

downloadButton.addEventListener("click", () => {
  void downloadVideo();
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
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
  if (event.code === "Space") {
    if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
    event.preventDefault();
    if (simulation.getView().status === "finished") resetSimulation();
    simulation.togglePlayback();
    refreshUI();
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

simulation.setPattern(loadPattern());
refreshPatternUI();

window.addEventListener("pagehide", () => renderer.destroy(), { once: true });

refreshUI();
requestAnimationFrame(animate);
