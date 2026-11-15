/**
 * Pattern links: `?p=1234` opens that pattern. A pattern number fixes both the field and the whole
 * run, so the link alone is enough for someone else to watch the same thing happen.
 */
const PATTERN_PARAM = "p";

/** The pattern number in the current address, or null when absent or invalid. */
export function patternFromUrl(maxPattern: number): number | null {
  const raw = new URLSearchParams(window.location.search).get(PATTERN_PARAM);
  if (raw === null || !/^\d{1,6}$/.test(raw.trim())) return null;
  const pattern = Number(raw.trim());
  return pattern <= maxPattern ? pattern : null;
}

/** Absolute link to a pattern on this site. */
export function patternUrl(pattern: number): string {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set(PATTERN_PARAM, String(pattern));
  return url.toString();
}

/** Keeps the address bar on the pattern being shown, so copying it shares that pattern too. */
export function syncAddressBar(pattern: number): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get(PATTERN_PARAM) === String(pattern)) return;
  params.set(PATTERN_PARAM, String(pattern));
  try {
    history.replaceState(history.state, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  } catch {
    // Some embedded browsers refuse replaceState; the share button still builds the link itself.
  }
}

export interface ShareRun {
  pattern: number;
  /** Set when the field has been cleared in this run. */
  cleared: { seconds: number; peakBalls: number } | null;
}

const japanese = (): boolean => (navigator.language ?? "").toLowerCase().startsWith("ja");

export function patternLabel(pattern: number): string {
  return "#" + pattern.toString().padStart(4, "0");
}

/** The post text, in Japanese for Japanese browsers and English otherwise. */
export function shareText({ pattern, cleared }: ShareRun): string {
  const label = patternLabel(pattern);
  if (cleared) {
    const seconds = cleared.seconds.toFixed(1);
    return japanese()
      ? `CHAIN BREAKER パターン ${label} を全部崩しました（${seconds}秒・最大${cleared.peakBalls}ボール）`
      : `Cleared CHAIN BREAKER pattern ${label} in ${seconds}s (peak ${cleared.peakBalls} balls)`;
  }
  return japanese()
    ? `CHAIN BREAKER パターン ${label} の連鎖、見てみてください`
    : `Watch CHAIN BREAKER pattern ${label} fall apart`;
}

/** X (Twitter) post composer prefilled with the text and link. */
export function xIntentUrl(text: string, url: string, via: string | null): string {
  const intent = new URL("https://x.com/intent/post");
  intent.searchParams.set("text", text);
  intent.searchParams.set("url", url);
  if (via) intent.searchParams.set("via", via);
  return intent.toString();
}
