import {
  BLUE,
  BOMB_BLOCK,
  CAPSULE_BLOCK,
  CONCRETE,
  ITEM_COLORS,
  RED,
  WORLD,
  type Item,
  type Simulation,
  type SimulationView,
} from "./simulation";

const DEFAULT_BLOCK_COLORS: Record<number, string> = {
  [RED]: "#ef4859",
  [BLUE]: "#4c79f4",
  [CAPSULE_BLOCK]: "#ffcf3f",
  [BOMB_BLOCK]: "#ff7a2f",
};
const CONCRETE_BASE = "#a3a8b2";
const CONCRETE_EDGE = "#d4d8df";
const CONCRETE_SHADE = "#737985";
const FIELD_BACKGROUND = "#0b0d12";
const ITEM_LABELS: Record<Item["kind"], string> = { plus: "+3", times: "×3", bomb: "BOMB" };
/** Ball sprites include a baked glow; this is the sprite's half size in world px. */
const BALL_SPRITE_HALF = 9;

export class Renderer {
  private context: CanvasRenderingContext2D;
  private blockCanvas = document.createElement("canvas");
  private blockContext: CanvasRenderingContext2D;
  private pixelRatio = 1;
  private latestBricks: SimulationView["bricks"] = new Uint8Array(WORLD.columns * WORLD.rows);
  private ballSprites = new Map<string, HTMLCanvasElement>();
  private blockColors: Record<number, string> = { ...DEFAULT_BLOCK_COLORS };
  /** When true, a stats line is drawn into the canvas so recorded videos carry it. */
  showStatsLine = false;
  /** Credit drawn under the field (and therefore into recordings); null shows the plain caption. */
  creditLine: string | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: false });
    const blockContext = this.blockCanvas.getContext("2d", { alpha: true });
    if (!context || !blockContext) throw new Error("Canvas 2D is not available in this browser.");
    this.context = context;
    this.blockContext = blockContext;
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  draw(simulation: Simulation): void {
    const view = simulation.getView();
    const changed = simulation.takeBrokenCells();
    if (view.bricks !== this.latestBricks) this.drawBlocks(view.bricks);
    else if (changed.length > 0) this.drawChangedBlocks(view.bricks, changed);
    this.drawScene(view);
  }

  /** Recolours the two breakable block arrays and repaints the block layer. */
  setBlockColors(colorA: string, colorB: string): void {
    this.blockColors[RED] = colorA;
    this.blockColors[BLUE] = colorB;
    this.drawBlocks(this.latestBricks);
  }

  destroy(): void {
    window.removeEventListener("resize", this.resize);
  }

  private resize = (): void => {
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(WORLD.width * this.pixelRatio);
    this.canvas.height = Math.round(WORLD.height * this.pixelRatio);
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.blockCanvas.width = Math.round(WORLD.width * this.pixelRatio);
    this.blockCanvas.height = Math.round(WORLD.height * this.pixelRatio);
    this.blockContext.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.ballSprites.clear();
    this.drawBlocks(this.latestBricks);
  };

  /** Pre-rendered glowing ball, so hundreds of balls cost one drawImage each instead of a shadow blur. */
  private ballSprite(color: string): HTMLCanvasElement {
    const cached = this.ballSprites.get(color);
    if (cached) return cached;
    const sprite = document.createElement("canvas");
    const size = Math.ceil(BALL_SPRITE_HALF * 2 * this.pixelRatio);
    sprite.width = size;
    sprite.height = size;
    const context = sprite.getContext("2d");
    if (context) {
      const scale = size / (BALL_SPRITE_HALF * 2);
      context.scale(scale, scale);
      const glow = context.createRadialGradient(BALL_SPRITE_HALF, BALL_SPRITE_HALF, 1, BALL_SPRITE_HALF, BALL_SPRITE_HALF, BALL_SPRITE_HALF);
      glow.addColorStop(0, color);
      glow.addColorStop(0.3, hexToRgba(color, 0.45));
      glow.addColorStop(1, hexToRgba(color, 0));
      context.fillStyle = glow;
      context.fillRect(0, 0, BALL_SPRITE_HALF * 2, BALL_SPRITE_HALF * 2);
      context.fillStyle = color;
      context.beginPath();
      context.arc(BALL_SPRITE_HALF, BALL_SPRITE_HALF, 3.2, 0, Math.PI * 2);
      context.fill();
    }
    this.ballSprites.set(color, sprite);
    return sprite;
  }

  private drawBlocks(bricks: Uint8Array): void {
    this.latestBricks = bricks;
    this.blockContext.clearRect(0, 0, WORLD.width, WORLD.height);
    this.blockContext.fillStyle = FIELD_BACKGROUND;
    this.blockContext.fillRect(WORLD.gridX - 2, WORLD.gridY - 2, WORLD.columns * WORLD.cell + 4, WORLD.rows * WORLD.cell + 4);
    for (let index = 0; index < bricks.length; index += 1) {
      const kind = bricks[index];
      if (kind === 0) continue;
      const row = Math.floor(index / WORLD.columns);
      const column = index - row * WORLD.columns;
      if (kind === CONCRETE) this.drawConcrete(bricks, column, row);
      else this.drawBlock(column, row, kind);
    }
  }

  private drawChangedBlocks(bricks: Uint8Array, cells: number[]): void {
    this.latestBricks = bricks;
    this.blockContext.fillStyle = FIELD_BACKGROUND;
    for (const index of cells) {
      const row = Math.floor(index / WORLD.columns);
      const column = index - row * WORLD.columns;
      this.blockContext.fillRect(WORLD.gridX + column * WORLD.cell, WORLD.gridY + row * WORLD.cell, WORLD.cell, WORLD.cell);
    }
  }

  private drawBlock(column: number, row: number, kind: number): void {
    const context = this.blockContext;
    const x = WORLD.gridX + column * WORLD.cell;
    const y = WORLD.gridY + row * WORLD.cell;
    const size = WORLD.cell - 0.7;
    context.globalAlpha = row % 2 === 0 ? 1 : 0.96;
    context.fillStyle = this.blockColors[kind];
    context.fillRect(x, y, size, size);
    context.globalAlpha = 1;
    if (kind === CAPSULE_BLOCK) {
      context.fillStyle = "#fff6c9";
      context.fillRect(x + 0.8, y + 0.8, 1.4, 1.4);
    } else if (kind === BOMB_BLOCK) {
      context.fillStyle = "#3b1408";
      context.fillRect(x + 1.4, y + 1.4, size - 2.8, size - 2.8);
      context.fillStyle = "#ffd34d";
      context.fillRect(x + size / 2 - 0.5, y + size / 2 - 0.5, 1, 1);
    }
  }

  /** Concrete cells are drawn edge to edge so neighbouring cells read as one solid slab. */
  private drawConcrete(bricks: Uint8Array, column: number, row: number): void {
    const context = this.blockContext;
    const x = WORLD.gridX + column * WORLD.cell;
    const y = WORLD.gridY + row * WORLD.cell;
    const isConcrete = (c: number, r: number) =>
      c >= 0 && c < WORLD.columns && r >= 0 && r < WORLD.rows && bricks[r * WORLD.columns + c] === CONCRETE;

    context.fillStyle = CONCRETE_BASE;
    context.fillRect(x, y, WORLD.cell, WORLD.cell);
    if (!isConcrete(column, row - 1)) {
      context.fillStyle = CONCRETE_EDGE;
      context.fillRect(x, y, WORLD.cell, 0.9);
    }
    if (!isConcrete(column, row + 1)) {
      context.fillStyle = CONCRETE_SHADE;
      context.fillRect(x, y + WORLD.cell - 0.9, WORLD.cell, 0.9);
    }
    if ((column * 7 + row * 13) % 5 === 0) {
      context.fillStyle = "rgba(60, 64, 74, 0.35)";
      context.fillRect(x + 1.6, y + 2, 1, 1);
    }
  }

  private drawScene(view: SimulationView): void {
    const context = this.context;
    context.fillStyle = "#090b10";
    context.fillRect(0, 0, WORLD.width, WORLD.height);

    context.save();
    if (view.shake > 0) {
      context.translate((Math.random() - 0.5) * view.shake * 2, (Math.random() - 0.5) * view.shake * 2);
    }

    const glow = context.createRadialGradient(WORLD.width / 2, 252, 70, WORLD.width / 2, 270, 430);
    glow.addColorStop(0, "rgba(29, 39, 63, 0.35)");
    glow.addColorStop(1, "rgba(9, 11, 16, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, WORLD.width, WORLD.height);

    context.drawImage(this.blockCanvas, 0, 0, WORLD.width, WORLD.height);
    context.strokeStyle = "rgba(174, 188, 220, 0.14)";
    context.lineWidth = 0.75;
    context.strokeRect(WORLD.gridX - 2, WORLD.gridY - 2, WORLD.columns * WORLD.cell + 4, WORLD.rows * WORLD.cell + 4);

    context.fillStyle = "rgba(255, 255, 255, 0.055)";
    context.fillRect(12, 619, WORLD.width - 24, 1);

    this.drawExplosions(view);

    for (const particle of view.particles) {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1;

    this.drawBalls(view);
    this.drawBeams(view);
    for (const item of view.items) this.drawItem(item);

    context.shadowColor = "rgba(255, 139, 83, 0.75)";
    context.shadowBlur = 15;
    context.fillStyle = "#ff9257";
    context.fillRect(view.paddle.x - view.paddle.width / 2, view.paddle.y, view.paddle.width, view.paddle.height);
    context.shadowBlur = 0;

    this.drawPopups(view);
    context.restore();

    if (view.flash > 0) {
      context.fillStyle = `rgba(255, 246, 225, ${Math.min(0.55, view.flash * 0.7)})`;
      context.fillRect(0, 0, WORLD.width, WORLD.height);
    }

    context.textAlign = "center";
    if (this.creditLine) {
      context.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.fillStyle = "rgba(236, 240, 250, 0.72)";
      context.fillText(this.creditLine, WORLD.width / 2, 671);
    } else {
      context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.fillStyle = "rgba(210, 215, 231, 0.48)";
      context.fillText("AUTOMATIC SIMULATION", WORLD.width / 2, 671);
    }
    if (this.showStatsLine) this.drawStatsLine(view);

    if (view.status === "ready") {
      this.drawOverlay("READY WHEN YOU ARE", "PRESS START TO RELEASE THE FIRST BALL");
    } else if (view.status === "finished") {
      this.drawOverlay("FIELD CLEARED", "ALL " + view.breakableTotal.toLocaleString("en-US") + " BLOCKS DESTROYED");
    }
  }

  private drawBalls(view: SimulationView): void {
    const context = this.context;
    const size = BALL_SPRITE_HALF * 2;
    for (const ball of view.balls) {
      const sprite = this.ballSprite(ball.color);
      const trail = ball.trail;
      for (let index = 0; index < trail.length; index += 1) {
        const scale = (index + 1) / (trail.length + 1);
        context.globalAlpha = scale * 0.32;
        const trailSize = size * scale;
        context.drawImage(sprite, trail[index].x - trailSize / 2, trail[index].y - trailSize / 2, trailSize, trailSize);
      }
      context.globalAlpha = 1;
      context.drawImage(sprite, ball.x - BALL_SPRITE_HALF, ball.y - BALL_SPRITE_HALF, size, size);
    }
  }

  private drawExplosions(view: SimulationView): void {
    const context = this.context;
    for (const blast of view.explosions) {
      const progress = Math.min(1, blast.radius / blast.maxRadius);
      const fade = blast.radius > blast.maxRadius ? Math.max(0, 1 - (blast.radius - blast.maxRadius) / 18) : 1;
      const core = context.createRadialGradient(blast.x, blast.y, 0, blast.x, blast.y, Math.max(1, blast.radius));
      core.addColorStop(0, `rgba(255, 240, 200, ${0.5 * (1 - progress * 0.6) * fade})`);
      core.addColorStop(0.6, hexToRgba(blast.color, 0.28 * fade));
      core.addColorStop(1, hexToRgba(blast.color, 0));
      context.fillStyle = core;
      context.beginPath();
      context.arc(blast.x, blast.y, Math.max(1, blast.radius), 0, Math.PI * 2);
      context.fill();
    }
  }

  private drawBeams(view: SimulationView): void {
    const context = this.context;
    for (const beam of view.beams) {
      const alpha = beam.life / beam.maxLife;
      context.strokeStyle = `rgba(255, 120, 80, ${alpha})`;
      context.lineWidth = 3 * alpha + 0.5;
      context.beginPath();
      context.moveTo(beam.x1, beam.y1);
      context.lineTo(beam.x2, beam.y2);
      context.stroke();
      context.strokeStyle = `rgba(255, 245, 220, ${alpha})`;
      context.lineWidth = 0.8;
      context.stroke();
    }
  }

  /** Capsules are drawn as glowing pills with their effect written on them. */
  private drawItem(item: Item): void {
    const context = this.context;
    const color = ITEM_COLORS[item.kind];
    const width = item.kind === "bomb" ? 44 : 32;
    const height = 16;
    const pulse = 0.75 + Math.sin(item.age * 9) * 0.25;
    const left = item.x - width / 2;
    const top = item.y - height / 2;

    context.shadowColor = color;
    context.shadowBlur = 14 * pulse;
    context.fillStyle = color;
    roundedRect(context, left, top, width, height, height / 2);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = "rgba(255, 255, 255, 0.35)";
    roundedRect(context, left + 3, top + 2, width - 6, 4, 2);
    context.fill();

    context.fillStyle = "#11141b";
    context.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(ITEM_LABELS[item.kind], item.x, item.y + 0.5);
    context.textBaseline = "alphabetic";
  }

  private drawPopups(view: SimulationView): void {
    const context = this.context;
    context.textAlign = "center";
    context.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    for (const popup of view.popups) {
      context.globalAlpha = Math.min(1, (popup.life / popup.maxLife) * 1.6);
      context.fillStyle = "rgba(7, 9, 14, 0.7)";
      context.fillText(popup.text, popup.x + 1, popup.y + 1);
      context.fillStyle = popup.color;
      context.fillText(popup.text, popup.x, popup.y);
    }
    context.globalAlpha = 1;
  }

  private drawStatsLine(view: SimulationView): void {
    const context = this.context;
    const minutes = Math.floor(view.elapsed / 60).toString().padStart(2, "0");
    const seconds = Math.floor(view.elapsed % 60).toString().padStart(2, "0");
    const cleared = ((view.destroyed / view.breakableTotal) * 100).toFixed(1);
    context.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillStyle = "rgba(230, 234, 245, 0.78)";
    context.textAlign = "left";
    context.fillText(`${minutes}:${seconds}`, 24, 700);
    context.textAlign = "center";
    context.fillText(`BALLS ${view.balls.length}`, WORLD.width / 2, 700);
    context.textAlign = "right";
    context.fillText(`CLEARED ${cleared}%`, WORLD.width - 24, 700);
  }

  private drawOverlay(title: string, subtitle: string): void {
    const context = this.context;
    context.fillStyle = "rgba(7, 9, 14, 0.68)";
    context.fillRect(28, 520, WORLD.width - 56, 80);
    context.strokeStyle = "rgba(176, 191, 222, 0.18)";
    context.strokeRect(28.5, 520.5, WORLD.width - 57, 79);
    context.textAlign = "center";
    context.fillStyle = "#f4f6fc";
    context.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(title, WORLD.width / 2, 552);
    context.fillStyle = "rgba(198, 205, 221, 0.72)";
    context.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(subtitle, WORLD.width / 2, 573);
  }
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
