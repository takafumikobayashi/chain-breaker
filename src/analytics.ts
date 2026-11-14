/**
 * Google Analytics 4 (gtag.js), loaded asynchronously, on the production hostname only. Nothing is
 * loaded while the measurement ID is empty, and main.ts skips initialisation entirely in owner
 * mode, so the owner's own visits are not counted. If gtag.js is blocked, the site keeps working and events are dropped.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** GA4 measurement ID for chain-breaker.tariki-code.tokyo. Empty disables analytics. */
const GA_MEASUREMENT_ID = "G-SQZK8PYKW5";
/** Only the production site is measured, so localhost and Cloudflare preview URLs stay out of the numbers. */
const PRODUCTION_HOSTNAME = "chain-breaker.tariki-code.tokyo";

let enabled = false;

export function initAnalytics(): void {
  if (enabled || !GA_MEASUREMENT_ID || window.location.hostname !== PRODUCTION_HOSTNAME) return;
  enabled = true;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js expects the arguments object itself, not a rest array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.append(script);
}

/** Sends a GA4 event; a no-op until analytics is initialised (and always for the owner). */
export function trackEvent(name: string, params: Record<string, string | number> = {}): void {
  if (!enabled) return;
  window.gtag?.("event", name, params);
}
