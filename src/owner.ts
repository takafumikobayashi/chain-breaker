/**
 * "Owner mode" hides the follow prompt and the credit line for the site owner.
 *
 * Opening the site once with `#owner=<passphrase>` remembers this browser as the owner;
 * `#owner=off` forgets it. Only the SHA-256 hash of the passphrase lives in the source, and the
 * fragment never reaches the server. This is a convenience switch, not access control: everything
 * runs in the visitor's browser anyway.
 */
const OWNER_PASSPHRASE_SHA256 = "469a0e45ed00d8b4cb21cfd4405c0eb8f33af931975a7af5b882206b806dcccb";
const STORAGE_KEY = "chain-breaker:owner";

export async function resolveOwnerMode(): Promise<boolean> {
  const match = window.location.hash.match(/(?:^#|&)owner=([^&]*)/);
  if (match) {
    // Drop the passphrase from the address bar and history right away.
    history.replaceState(null, "", window.location.pathname + window.location.search);
    const value = decodeURIComponent(match[1]);
    if (value === "off") {
      writeStored(null);
      return false;
    }
    if (await matchesOwnerHash(value)) {
      writeStored(value);
      return true;
    }
  }
  const stored = readStored();
  return stored !== null && (await matchesOwnerHash(stored));
}

async function matchesOwnerHash(passphrase: string): Promise<boolean> {
  if (!window.crypto?.subtle) return false;
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(passphrase));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex === OWNER_PASSPHRASE_SHA256;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Without storage the owner link simply has to be opened again next time.
  }
}
