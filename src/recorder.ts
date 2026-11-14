/** Container/codec candidates in order of preference. MP4 plays almost everywhere, WebM is the fallback. */
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.640028",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];
const FRAME_RATE = 60;
const VIDEO_BITS_PER_SECOND = 10_000_000;

export type RecorderState = "idle" | "recording" | "paused";

/** Records a canvas to a video file with the browser's MediaRecorder. */
export class CanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";
  private startedAt = 0;
  private pausedAt = 0;
  private pausedTotal = 0;

  constructor(private canvas: HTMLCanvasElement) {}

  static isSupported(): boolean {
    return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function" && pickMimeType() !== null;
  }

  get state(): RecorderState {
    if (!this.recorder || this.recorder.state === "inactive") return "idle";
    return this.recorder.state === "paused" ? "paused" : "recording";
  }

  /** Seconds of footage recorded so far, excluding paused time. */
  get duration(): number {
    if (this.state === "idle") return 0;
    const now = this.state === "paused" ? this.pausedAt : performance.now();
    return (now - this.startedAt - this.pausedTotal) / 1_000;
  }

  /** File extension matching the chosen container. */
  get extension(): string {
    return this.mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  }

  start(): void {
    if (this.state !== "idle") return;
    const mimeType = pickMimeType();
    if (!mimeType) throw new Error("Video recording is not supported in this browser.");
    this.mimeType = mimeType;
    this.chunks = [];
    const stream = this.canvas.captureStream(FRAME_RATE);
    this.recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
    this.recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start(1_000);
    this.startedAt = performance.now();
    this.pausedTotal = 0;
  }

  pause(): void {
    if (this.state !== "recording" || !this.recorder) return;
    this.recorder.pause();
    this.pausedAt = performance.now();
  }

  resume(): void {
    if (this.state !== "paused" || !this.recorder) return;
    this.recorder.resume();
    this.pausedTotal += performance.now() - this.pausedAt;
  }

  /** Stops recording and resolves with the finished video. */
  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return Promise.resolve(new Blob([], { type: this.mimeType }));
    return new Promise((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          recorder.stream.getTracks().forEach((track) => track.stop());
          resolve(new Blob(this.chunks, { type: this.mimeType.split(";")[0] }));
          this.chunks = [];
          this.recorder = null;
        },
        { once: true },
      );
      recorder.stop();
    });
  }
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/** Saves a blob through a temporary download link. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
