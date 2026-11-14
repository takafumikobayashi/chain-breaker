/** Colours of the two breakable block arrays (the upper-left triangle and the lower-right one). */
export type BlockPalette = { a: string; b: string };

export type PalettePreset = { id: string; name: string; colors: BlockPalette };

/**
 * Presets avoid the colours the field already uses for other meanings:
 * grey (concrete), gold (capsule blocks) and orange (bomb blocks).
 */
export const PALETTE_PRESETS: PalettePreset[] = [
  { id: "classic", name: "Classic", colors: { a: "#ef4859", b: "#4c79f4" } },
  { id: "neon", name: "Neon", colors: { a: "#ff3ea5", b: "#22e0ff" } },
  { id: "aurora", name: "Aurora", colors: { a: "#38e8a8", b: "#8b5cf6" } },
  { id: "sakura", name: "Sakura", colors: { a: "#ff8fb8", b: "#7aa2ff" } },
  { id: "forest", name: "Forest", colors: { a: "#3fbf6f", b: "#2a5fd6" } },
  { id: "ruby", name: "Ruby", colors: { a: "#d6304f", b: "#7b2fd6" } },
];

export const DEFAULT_PALETTE = PALETTE_PRESETS[0].colors;

const STORAGE_KEY = "chain-breaker:palette";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Last palette the viewer picked, or the default when none is stored or storage is unavailable. */
export function loadPalette(): BlockPalette {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<BlockPalette> | null;
    if (stored && HEX_COLOR.test(stored.a ?? "") && HEX_COLOR.test(stored.b ?? "")) {
      return { a: stored.a!.toLowerCase(), b: stored.b!.toLowerCase() };
    }
  } catch {
    // Storage blocked or corrupt: fall back to the default.
  }
  return { ...DEFAULT_PALETTE };
}

export function savePalette(palette: BlockPalette): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(palette));
  } catch {
    // Not persisting is fine; the palette still applies for this visit.
  }
}

export function matchingPreset(palette: BlockPalette): PalettePreset | undefined {
  return PALETTE_PRESETS.find((preset) => preset.colors.a === palette.a && preset.colors.b === palette.b);
}
