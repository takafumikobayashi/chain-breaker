import type { ItemKind } from "./simulation";

/**
 * A 12×12 pixel-art icon. Each row is 12 characters; "." is transparent and every other
 * character is looked up in `colors`.
 */
export type PixelSprite = { rows: string[]; colors: Record<string, string> };

/** Capsule look: "normal" keeps the original labelled pills; the others draw an icon per capsule kind. */
export type ItemTheme = { id: string; name: string; sprites: Record<ItemKind, PixelSprite> | null };

export const SPRITE_SIZE = 12;

const OUTLINE = "#1b1420";

const CHICK: PixelSprite = {
  rows: [
    "............",
    "....kkkk....",
    "...kyyyyk...",
    "..kyyyyyyk..",
    "..kyykyyyk..",
    "..kyyyyyook.",
    "..kyyyyyyk..",
    ".kyyyyyyyyk.",
    ".kyyyyyyyyk.",
    "..kyyyyyyk..",
    "...kkkkkk...",
    "....o..o....",
  ],
  colors: { k: OUTLINE, y: "#ffe14d", o: "#ff8a2a" },
};

const RABBIT: PixelSprite = {
  rows: [
    "..kk....kk..",
    ".kwpk..kwpk.",
    ".kwpk..kwpk.",
    ".kwpk..kwpk.",
    "..kwkkkkwk..",
    ".kwwwwwwwwk.",
    "kwwkwwwwkwwk",
    "kwwwwppwwwwk",
    "kwpwwwwwwpwk",
    ".kwwwwwwwwk.",
    "..kkkkkkkk..",
    "............",
  ],
  colors: { k: OUTLINE, w: "#fbf8ff", p: "#ff9cc2" },
};

const PUFFERFISH: PixelSprite = {
  rows: [
    "....k.k.k...",
    "...kkkkkkk..",
    "k.kfffffffk.",
    "kkfffffkkffk",
    "kfkffffkwkfk",
    "kffffffffffo",
    "kfkffffffffk",
    "kkfwwwwwwwfk",
    "k.kwwwwwwwk.",
    "...kkkkkkk..",
    "....k.k.k...",
    "............",
  ],
  colors: { k: OUTLINE, f: "#f2c14e", w: "#fff4d6", o: "#ff6b6b" },
};

const ONIGIRI: PixelSprite = {
  rows: [
    ".....kk.....",
    "....kwwk....",
    "...kwwwwk...",
    "...kwwwwk...",
    "..kwwwwwwk..",
    "..kwwwwwwk..",
    ".kwwwwwwwwk.",
    ".kwwnnnnwwk.",
    "kwwwnnnnwwwk",
    "kwwwnnnnwwwk",
    ".kkknnnnkkk.",
    "............",
  ],
  colors: { k: OUTLINE, w: "#ffffff", n: "#24412f" },
};

const SUSHI: PixelSprite = {
  rows: [
    "............",
    "............",
    "...kkkkkkk..",
    "..ksslsslsk.",
    ".ksslsslssk.",
    ".kslsslsslk.",
    ".kkkkkkkkkk.",
    ".kwwwwwwwwk.",
    ".kwwwwwwwwk.",
    "..kwwwwwwk..",
    "...kkkkkk...",
    "............",
  ],
  colors: { k: OUTLINE, s: "#ff7f50", l: "#ffd2bd", w: "#ffffff" },
};

const CHILI: PixelSprite = {
  rows: [
    ".........g..",
    "........gg..",
    ".......kgk..",
    "......krrk..",
    ".....krhrk..",
    "....krhrdk..",
    "...krhrdk...",
    "..krrrdk....",
    ".krrrdk.....",
    ".krrdk......",
    "..kkk.......",
    "............",
  ],
  colors: { k: OUTLINE, r: "#ff3b30", d: "#b3141c", h: "#ff9a8f", g: "#3fbf4a" },
};

const CANDY: PixelSprite = {
  rows: [
    "............",
    "............",
    "pp..kkkk..pp",
    "ppkkccwckkpp",
    "pkccwccwcckp",
    "kkcwccwccwkk",
    "pkccwccwcckp",
    "ppkkcwcckkpp",
    "pp..kkkk..pp",
    "............",
    "............",
    "............",
  ],
  colors: { k: OUTLINE, c: "#ff5fa2", w: "#ffffff", p: "#ffc2dc" },
};

const DONUT: PixelSprite = {
  rows: [
    "............",
    "...kkkkkk...",
    "..kiiyiiik..",
    ".kibiiiiyik.",
    ".kiiikkiiik.",
    ".kyik..kibk.",
    ".kiik..kiik.",
    ".kdiikkiidk.",
    ".kddiiiiddk.",
    "..kddddddk..",
    "...kkkkkk...",
    "............",
  ],
  colors: { k: OUTLINE, i: "#ff8cc0", d: "#d9954a", y: "#ffe14d", b: "#5cc8ff" },
};

const CAKE: PixelSprite = {
  rows: [
    ".....y......",
    "....yoy.....",
    ".....c......",
    ".....c...r..",
    "..kkkkkkkrk.",
    ".kwwwwwwwwwk",
    ".ksssssssssk",
    ".krrrrrrrrrk",
    ".ksssssssssk",
    ".kwwwwwwwwwk",
    ".kkkkkkkkkkk",
    "............",
  ],
  colors: { k: OUTLINE, y: "#ffe14d", o: "#ff8a2a", c: "#7aa2ff", w: "#fffaf0", s: "#f2c879", r: "#ff4d6a" },
};

export const ITEM_THEMES: ItemTheme[] = [
  { id: "normal", name: "Normal", sprites: null },
  { id: "animals", name: "Animals", sprites: { plus: CHICK, times: RABBIT, bomb: PUFFERFISH } },
  { id: "food", name: "Food", sprites: { plus: ONIGIRI, times: SUSHI, bomb: CHILI } },
  { id: "sweets", name: "Sweets", sprites: { plus: CANDY, times: DONUT, bomb: CAKE } },
];

const STORAGE_KEY = "chain-breaker:item-theme";

/** Draws a sprite at 1 canvas pixel per sprite pixel; scale it up with image smoothing off. */
export function spriteCanvas(sprite: PixelSprite): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const context = canvas.getContext("2d")!;
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const color = sprite.colors[row[x]];
      if (!color) continue;
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

/** Theme the viewer last picked, or Normal when none is stored or storage is unavailable. */
export function loadItemTheme(): ItemTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const theme = ITEM_THEMES.find((candidate) => candidate.id === stored);
    if (theme) return theme;
  } catch {
    // Storage blocked: fall back to Normal.
  }
  return ITEM_THEMES[0];
}

export function saveItemTheme(theme: ItemTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {
    // Not persisting is fine; the theme still applies for this visit.
  }
}
