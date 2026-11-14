export const WORLD = {
  width: 480,
  height: 720,
  columns: 80,
  rows: 80,
  cell: 5.2,
  gridX: 32,
  gridY: 50,
};

/** Cell kinds stored in the brick array. */
export const EMPTY = 0;
export const RED = 1;
export const BLUE = 2;
export const CONCRETE = 3;
/** Gold block that releases a falling capsule when broken. */
export const CAPSULE_BLOCK = 4;
/** Block that explodes when broken and sets off nearby bomb blocks. */
export const BOMB_BLOCK = 5;

const TOTAL_CELLS = WORLD.columns * WORLD.rows;
const MAX_BALLS = 600;
const MAX_PARTICLES = 1_400;
const MAX_ITEMS = 10;
const PLAY_LEFT = 10;
const PLAY_RIGHT = WORLD.width - 10;
const PLAY_TOP = 11;
/** With one ball left the paddle moves this much faster than strictly needed to reach it in time. */
const LAST_BALL_CHASE_MARGIN = 1.4;
/** Longest distance (px) a ball may travel in one collision sub-step; keep below WORLD.cell / 2. */
const MAX_SUBSTEP_DISTANCE = 2.4;
/** Each extra ball in play adds this much to the speed multiplier, up to the cap. */
const BALL_SPEED_BOOST_PER_BALL = 0.014;
const BALL_SPEED_BOOST_MAX = 1.1;

const BALL_COLORS = ["#fff1a8", "#65e5ff", "#b8ff7a", "#ffad70", "#e5a0ff", "#ffffff"];
const BREAK_COLORS: Record<number, string> = {
  [RED]: "#f45463",
  [BLUE]: "#5584ff",
  [CAPSULE_BLOCK]: "#ffd34d",
  [BOMB_BLOCK]: "#ff7a2f",
};
const CONCRETE_SPARK = "#c9ced8";
export const ITEM_COLORS: Record<ItemKind, string> = {
  plus: "#65e5ff",
  times: "#b8ff7a",
  bomb: "#ff5a3c",
};

/* ---------- Layout ---------- */

/**
 * Centre line of the zigzag entry channel, in cell units (x = column, y = row).
 * It starts below the field (the only opening in the outer frame) and ends deep inside it.
 */
const CLASSIC_CHANNEL_PATH: Point[] = [
  { x: 40, y: 81 },
  { x: 40, y: 64 },
  { x: 62, y: 42 },
  { x: 28, y: 17 },
  { x: 28, y: 8 },
];
const CHANNEL_HALF_WIDTH = 2.3;
const CHANNEL_WALL_THICKNESS = 1.4;
/** Along the channel, the wall opens for GAP_LENGTH cells out of every GAP_EVERY cells. */
const CHANNEL_GAP_EVERY = 13;
const CHANNEL_GAP_LENGTH = 4;
/** The first stretch of the channel is solid so it works as an entry chute. */
const CHANNEL_SOLID_START = 9;
const CAPSULE_BLOCK_COUNT = 30;
const BOMB_BLOCK_COUNT = 26;

/** Pattern number of the hand-made original layout. Any other number is generated from that seed. */
export const CLASSIC_PATTERN = 0;
export const MAX_PATTERN = 9_999;
/** Generation retries before falling back to the classic layout (never needed in practice). */
const PATTERN_ATTEMPTS = 40;
/** Pixel y of the channel mouth (the bottom edge of the field). */
const ENTRANCE_Y = WORLD.gridY + WORLD.rows * WORLD.cell;

/* ---------- Effects ---------- */

const BOMB_BLOCK_RADIUS = 3.4 * WORLD.cell;
const BOMB_ITEM_RADIUS = 10.5 * WORLD.cell;
const EXPLOSION_GROWTH = 230;
const ITEM_FALL_SPEED = 74;
/** Chance that an ordinary block drops a capsule. */
const RANDOM_DROP_CHANCE = 1 / 260;
/** Higher drop chances while few balls are in play, since capsules are the only way to gain balls. */
const FEW_BALLS_DROP_CHANCE = 1 / 30;
const SOME_BALLS_DROP_CHANCE = 1 / 110;
/** How many capsule blocks sit just behind the channel walls, where the first balls reach early. */
const CHANNEL_CAPSULE_COUNT = 15;
/** Once fewer than this share of blocks remain, bomb capsules are dropped from the top regularly. */
const ENDGAME_SHARE = 0.03;
const ENDGAME_BOMB_INTERVAL = 4.5;
/** While fewer than SUPPLY_BALL_LIMIT balls are in play, a +3 capsule falls from the top this often. */
const SUPPLY_INTERVAL = 6;
const SUPPLY_FIRST_AT = 3;
const SUPPLY_BALL_LIMIT = 4;
/** A ×3 capsule triples the balls in play but adds at most this many, so the climax builds instead of jumping. */
const TIMES_MAX_GAIN = 100;

/** Result of probing a point for a block. */
const enum Hit {
  None,
  Broken,
  Concrete,
}

type Point = { x: number; y: number };

export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  trail: Point[];
  trailClock: number;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

export type ItemKind = "plus" | "times" | "bomb";

/** A capsule falling toward the paddle. It passes through blocks and walls. */
export type Item = { x: number; y: number; kind: ItemKind; age: number };

/** An expanding blast that destroys every breakable cell its radius reaches. */
export type Explosion = { x: number; y: number; radius: number; maxRadius: number; color: string };

/** Floating text such as "×3 → 120 BALLS". */
export type Popup = { x: number; y: number; text: string; color: string; life: number; maxLife: number };

/** Short-lived line drawn from the paddle to a bomb's target. */
export type Beam = { x1: number; y1: number; x2: number; y2: number; life: number; maxLife: number };

export type GameStatus = "ready" | "running" | "paused" | "finished";

export type SimulationView = {
  status: GameStatus;
  bricks: Uint8Array;
  breakableTotal: number;
  balls: Ball[];
  particles: Particle[];
  items: Item[];
  explosions: Explosion[];
  popups: Popup[];
  beams: Beam[];
  paddle: { x: number; y: number; width: number; height: number };
  shake: number;
  flash: number;
  elapsed: number;
  destroyed: number;
  phase: number;
  combo: number;
  bestCombo: number;
  splitCount: number;
};

const isBreakable = (kind: number) => kind !== EMPTY && kind !== CONCRETE;

export class Simulation {
  private seed = 1_234_567;
  private bricks = new Uint8Array(TOTAL_CELLS);
  private breakableTotal = TOTAL_CELLS;
  private balls: Ball[] = [];
  private particles: Particle[] = [];
  private items: Item[] = [];
  private explosions: Explosion[] = [];
  private popups: Popup[] = [];
  private beams: Beam[] = [];
  private brokenCells: number[] = [];
  private paddle = { x: WORLD.width / 2, y: 632, width: 76, height: 8 };
  private shake = 0;
  private flash = 0;
  private elapsed = 0;
  private destroyed = 0;
  private phase = 1;
  private lastBreakAt = -1;
  private nextEndgameBombAt = 0;
  private nextSupplyAt = SUPPLY_FIRST_AT;
  /** How often the last-ball safety net had to snap the paddle (diagnostics; expected to stay 0). */
  private lastBallSnaps = 0;
  private combo = 0;
  private bestCombo = 0;
  private splitCount = 0;
  private status: GameStatus = "ready";
  private speed = 1;
  private pattern = CLASSIC_PATTERN;
  private patternName = "Classic";
  private channelPath: Point[] = CLASSIC_CHANNEL_PATH;
  /** Pixel x of the channel mouth: where the paddle tries to send balls. */
  private entranceX = WORLD.gridX + CLASSIC_CHANNEL_PATH[0].x * WORLD.cell;
  /** Spark colours per block kind; the two array colours follow the chosen palette. */
  private breakColors: Record<number, string> = { ...BREAK_COLORS };

  constructor() {
    this.reset();
  }

  reset(): void {
    if (this.pattern === CLASSIC_PATTERN || !this.generatePattern()) this.buildClassic();
    this.entranceX = WORLD.gridX + this.channelPath[0].x * WORLD.cell;
    this.breakableTotal = this.bricks.reduce((count, kind) => count + (isBreakable(kind) ? 1 : 0), 0);

    this.balls = [];
    this.particles = [];
    this.items = [];
    this.explosions = [];
    this.popups = [];
    this.beams = [];
    this.brokenCells = [];
    this.shake = 0;
    this.flash = 0;
    this.elapsed = 0;
    this.destroyed = 0;
    this.phase = 1;
    this.lastBreakAt = -1;
    this.nextEndgameBombAt = 0;
    this.nextSupplyAt = SUPPLY_FIRST_AT;
    this.lastBallSnaps = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.splitCount = 0;
    this.status = "ready";
    this.paddle = { x: WORLD.width / 2, y: 632, width: 76, height: 8 };
    this.addBall(this.entranceX - 14, 560, 70, -250);
  }

  start(): void {
    if (this.status === "ready" || this.status === "paused") this.status = "running";
  }

  pause(): void {
    if (this.status === "running") this.status = "paused";
  }

  togglePlayback(): void {
    if (this.status === "running") this.pause();
    else this.start();
  }

  setSpeed(speed: number): void {
    if ([0.5, 1, 2, 4].includes(speed)) this.speed = speed;
  }

  /** Applies palette colours to the sparks of the two breakable block arrays. */
  setBlockColors(colorA: string, colorB: string): void {
    this.breakColors[RED] = colorA;
    this.breakColors[BLUE] = colorB;
  }

  /** Switches to another layout (0 = classic) and resets the run onto it. */
  setPattern(pattern: number): void {
    this.pattern = Math.max(0, Math.min(MAX_PATTERN, Math.floor(pattern)));
    this.reset();
  }

  getPattern(): { id: number; name: string } {
    return { id: this.pattern, name: this.patternName };
  }

  getSpeed(): number {
    return this.speed;
  }

  getView(): SimulationView {
    return {
      status: this.status,
      bricks: this.bricks,
      breakableTotal: this.breakableTotal,
      balls: this.balls,
      particles: this.particles,
      items: this.items,
      explosions: this.explosions,
      popups: this.popups,
      beams: this.beams,
      paddle: this.paddle,
      shake: this.shake,
      flash: this.flash,
      elapsed: this.elapsed,
      destroyed: this.destroyed,
      phase: this.phase,
      combo: this.combo,
      bestCombo: this.bestCombo,
      splitCount: this.splitCount,
    };
  }

  takeBrokenCells(): number[] {
    const cells = this.brokenCells;
    this.brokenCells = [];
    return cells;
  }

  step(dt: number): void {
    if (this.status !== "running") return;
    this.elapsed += dt;
    this.updatePhase();

    const speedFactor = this.currentSpeedFactor();
    this.movePaddle(dt, speedFactor);

    const trailLength = this.balls.length > 240 ? 2 : this.balls.length > 100 ? 4 : 7;
    for (let index = this.balls.length - 1; index >= 0; index -= 1) {
      const ball = this.balls[index];
      // Split fast movement into short sub-steps so a ball never skips a cell or tunnels through concrete.
      const travel = Math.hypot(ball.vx, ball.vy) * dt * speedFactor;
      const substeps = Math.max(1, Math.ceil(travel / MAX_SUBSTEP_DISTANCE));
      const substepTime = (dt * speedFactor) / substeps;
      for (let substep = 0; substep < substeps; substep += 1) this.moveBall(ball, substepTime);

      if (ball.y - ball.radius > WORLD.height + 4) {
        this.balls.splice(index, 1);
        continue;
      }

      ball.trailClock += dt;
      if (ball.trailClock > 0.035) {
        ball.trailClock = 0;
        ball.trail.push({ x: ball.x, y: ball.y });
      }
      while (ball.trail.length > trailLength) ball.trail.shift();
    }

    // Balls only multiply through capsules, and the paddle always returns the last ball, so the count never reaches zero.

    this.updateItems(dt);
    this.updateExplosions(dt);
    this.updateEffects(dt);

    if (this.balls.length < SUPPLY_BALL_LIMIT && this.elapsed >= this.nextSupplyAt) {
      this.items.push({ x: 80 + this.random() * (WORLD.width - 160), y: 30, kind: "plus", age: 0 });
      this.nextSupplyAt = this.elapsed + SUPPLY_INTERVAL;
    }

    const remainingShare = 1 - this.destroyed / this.breakableTotal;
    if (remainingShare > 0 && remainingShare < ENDGAME_SHARE && this.elapsed >= this.nextEndgameBombAt) {
      this.items.push({ x: 60 + this.random() * (WORLD.width - 120), y: 30, kind: "bomb", age: 0 });
      this.nextEndgameBombAt = this.elapsed + ENDGAME_BOMB_INTERVAL;
    }

    if (this.destroyed >= this.breakableTotal) this.status = "finished";
  }

  /* ---------- Paddle ---------- */

  private movePaddle(dt: number, speedFactor: number): void {
    const { x: target, arrival } = this.paddleTarget(speedFactor);
    let maxStep = 470 * dt * Math.max(1, speedFactor * 0.85);
    // With a single ball left, the paddle speeds up as much as it needs to reach the landing point in time.
    if (this.balls.length === 1 && arrival !== null) {
      const needed = (Math.abs(target - this.paddle.x) / Math.max(arrival, dt)) * dt * LAST_BALL_CHASE_MARGIN;
      maxStep = Math.max(maxStep, needed);
    }
    this.paddle.x += Math.max(-maxStep, Math.min(maxStep, target - this.paddle.x));
    this.clampPaddle();
  }

  private clampPaddle(): void {
    const margin = this.paddle.width / 2 + 12;
    this.paddle.x = Math.max(margin, Math.min(WORLD.width - margin, this.paddle.x));
  }

  /**
   * Picks whichever arrives first: a descending ball or a falling capsule. Balls are met at the
   * paddle offset that sends them back toward the channel mouth. With one ball left, capsules are
   * only chased when there is plenty of time to get back to the ball.
   * `arrival` is the real time (s) until the chosen ball reaches the paddle, or null.
   */
  private paddleTarget(speedFactor: number): { x: number; arrival: number | null } {
    let ballTime = Infinity;
    let ballX = 0;
    const span = WORLD.width - 20;
    for (const ball of this.balls) {
      if (ball.vy <= 0) continue;
      const time = (this.paddle.y - ball.y) / (ball.vy * speedFactor);
      if (time < 0 || time >= ballTime) continue;
      const left = PLAY_LEFT + ball.radius;
      const width = span - ball.radius * 2;
      const unfolded = (((ball.x + ball.vx * speedFactor * time - left) % (width * 2)) + width * 2) % (width * 2);
      ballTime = time;
      ballX = left + (unfolded <= width ? unfolded : width * 2 - unfolded);
    }

    let itemTime = Infinity;
    let itemX = 0;
    for (const item of this.items) {
      const time = (this.paddle.y - item.y) / ITEM_FALL_SPEED;
      if (time >= 0 && time < itemTime) {
        itemTime = time;
        itemX = item.x;
      }
    }

    const itemLead = this.balls.length === 1 ? -0.8 : 0.25;
    if (itemTime !== Infinity && itemTime - itemLead <= ballTime) return { x: itemX, arrival: null };
    if (ballTime !== Infinity) return { x: this.aimedPaddleX(ballX), arrival: ballTime };
    return { x: WORLD.width / 2 + Math.sin(this.elapsed * 0.68) * 64, arrival: null };
  }

  /** Paddle centre that makes a ball landing at `landingX` bounce toward the channel mouth. */
  private aimedPaddleX(landingX: number): number {
    const angle = Math.atan2(this.entranceX - landingX, this.paddle.y - ENTRANCE_Y);
    const wobble = Math.sin(this.elapsed * 1.7) * 0.06;
    const offset = Math.max(-0.85, Math.min(0.85, angle / 0.98 + wobble));
    return landingX - offset * (this.paddle.width / 2);
  }

  /** Launches balls from the paddle aimed at the channel mouth, fanned by `spread` radians. */
  private launchFromPaddle(count: number, spread: number): void {
    const x = this.paddle.x;
    const y = this.paddle.y - 12;
    const base = Math.atan2(this.entranceX - x, y - ENTRANCE_Y);
    for (let index = 0; index < count && this.balls.length < MAX_BALLS; index += 1) {
      const fan = count === 1 ? (this.random() - 0.5) * spread : (index / (count - 1) - 0.5) * spread;
      const angle = base + fan;
      this.addBall(x, y, Math.sin(angle) * 265, -Math.cos(angle) * 265);
    }
    this.emitParticles(x, y, "#ffb27a", 8);
  }

  /* ---------- Balls ---------- */

  /** Global speed multiplier: grows slowly with time and destruction, and strongly with the ball count. */
  private currentSpeedFactor(): number {
    const progressBoost = Math.min(0.34, this.elapsed / 280 + this.destroyed / 20_000);
    const ballBoost = Math.min(BALL_SPEED_BOOST_MAX, (this.balls.length - 1) * BALL_SPEED_BOOST_PER_BALL);
    return 1 + progressBoost + Math.max(0, ballBoost);
  }

  /** Advances one ball by `time` seconds of scaled simulation time and resolves its collisions. */
  private moveBall(ball: Ball, time: number): void {
    const previousX = ball.x;
    const previousY = ball.y;
    const dx = ball.vx * time;
    const dy = ball.vy * time;
    ball.x += dx;
    ball.y += dy;

    if (ball.x - ball.radius < PLAY_LEFT) {
      ball.x = PLAY_LEFT + ball.radius;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x + ball.radius > PLAY_RIGHT) {
      ball.x = PLAY_RIGHT - ball.radius;
      ball.vx = -Math.abs(ball.vx);
    }

    if (ball.y - ball.radius < PLAY_TOP) {
      ball.y = PLAY_TOP + ball.radius;
      ball.vy = Math.abs(ball.vy);
    }

    const crossesPaddle = ball.vy > 0 && previousY + ball.radius <= this.paddle.y && ball.y + ball.radius >= this.paddle.y;
    // Safety net: the last ball is always returned. If the chase still came up short, the paddle snaps under it.
    if (crossesPaddle && this.balls.length === 1 && Math.abs(ball.x - this.paddle.x) > this.paddle.width / 2 + ball.radius) {
      this.paddle.x = ball.x;
      this.clampPaddle();
      this.lastBallSnaps += 1;
    }

    if (crossesPaddle && Math.abs(ball.x - this.paddle.x) <= this.paddle.width / 2 + ball.radius) {
      ball.y = this.paddle.y - ball.radius;
      const hitOffset = (ball.x - this.paddle.x) / (this.paddle.width / 2);
      const angle = hitOffset * 0.98;
      const currentSpeed = Math.max(250, Math.hypot(ball.vx, ball.vy));
      ball.vx = Math.sin(angle) * currentSpeed;
      ball.vy = -Math.cos(angle) * currentSpeed;
    }

    const horizontalHit = dx === 0 ? Hit.None : this.hitAt(ball.x + Math.sign(dx) * ball.radius, ball.y);
    const verticalHit = dy === 0 ? Hit.None : this.hitAt(ball.x, ball.y + Math.sign(dy) * ball.radius);
    let concreteHit = false;
    if (horizontalHit !== Hit.None) {
      ball.vx *= -1;
      if (horizontalHit === Hit.Concrete) {
        ball.x = previousX;
        concreteHit = true;
      }
    }
    if (verticalHit !== Hit.None) {
      ball.vy *= -1;
      if (verticalHit === Hit.Concrete) {
        ball.y = previousY;
        concreteHit = true;
      }
    }
    if (horizontalHit === Hit.None && verticalHit === Hit.None && (dx !== 0 || dy !== 0)) {
      const cornerHit = this.hitAt(
        ball.x + Math.sign(dx) * ball.radius * 0.72,
        ball.y + Math.sign(dy) * ball.radius * 0.72,
      );
      if (cornerHit !== Hit.None) {
        ball.vx *= -1;
        ball.vy *= -1;
        if (cornerHit === Hit.Concrete) {
          ball.x = previousX;
          ball.y = previousY;
          concreteHit = true;
        }
      }
    }
    if (concreteHit) this.jitterBounce(ball);
  }

  /**
   * Nudges a ball's direction after it bounces off concrete so it cannot settle into
   * a repeating loop, and keeps it from travelling almost horizontally.
   */
  private jitterBounce(ball: Ball): void {
    const speed = Math.hypot(ball.vx, ball.vy);
    let angle = Math.atan2(ball.vy, ball.vx) + (this.random() - 0.5) * 0.16;
    const minVertical = 0.28;
    if (Math.abs(Math.sin(angle)) < minVertical) {
      const sign = Math.sign(Math.sin(angle)) || (this.random() < 0.5 ? -1 : 1);
      angle = Math.atan2(sign * minVertical, Math.sign(Math.cos(angle)) * Math.sqrt(1 - minVertical ** 2));
    }
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    if (this.balls.length < 150 && this.random() < 0.35) this.emitParticles(ball.x, ball.y, CONCRETE_SPARK, 1);
  }

  private splitBall(parent: Ball, angleOffset: number): void {
    if (this.balls.length >= MAX_BALLS) return;
    const angle = Math.atan2(parent.vy, parent.vx) + angleOffset;
    const speed = Math.hypot(parent.vx, parent.vy);
    this.addBall(parent.x, parent.y, Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.splitCount += 1;
    if (this.balls.length < 200) this.emitParticles(parent.x, parent.y, "#fff0a4", 6);
  }

  private addBall(x: number, y: number, vx: number, vy: number): void {
    const speed = Math.max(250, Math.hypot(vx, vy));
    const angle = Math.atan2(vy, vx);
    this.balls.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 3.2,
      color: BALL_COLORS[Math.floor(this.random() * BALL_COLORS.length)],
      trail: [],
      trailClock: 0,
    });
  }

  /* ---------- Blocks ---------- */

  private hitAt(x: number, y: number): Hit {
    const column = Math.floor((x - WORLD.gridX) / WORLD.cell);
    const row = Math.floor((y - WORLD.gridY) / WORLD.cell);
    if (column < 0 || column >= WORLD.columns || row < 0 || row >= WORLD.rows) return Hit.None;
    const kind = this.bricks[row * WORLD.columns + column];
    if (kind === EMPTY) return Hit.None;
    if (kind === CONCRETE) return Hit.Concrete;
    this.breakCell(column, row, false);
    return Hit.Broken;
  }

  /** Destroys one breakable cell and triggers whatever it carries (capsule, bomb, split). */
  private breakCell(column: number, row: number, byExplosion: boolean): void {
    const index = row * WORLD.columns + column;
    const kind = this.bricks[index];
    if (!isBreakable(kind)) return;

    this.bricks[index] = EMPTY;
    this.brokenCells.push(index);
    this.destroyed += 1;
    this.combo = this.elapsed - this.lastBreakAt <= 0.56 ? this.combo + 1 : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastBreakAt = this.elapsed;

    const centerX = WORLD.gridX + (column + 0.5) * WORLD.cell;
    const centerY = WORLD.gridY + (row + 0.5) * WORLD.cell;
    const busy = this.balls.length > 150 || byExplosion;
    const sparks = this.destroyed % 36 === 0 ? 10 : busy ? (this.random() < 0.5 ? 1 : 0) : 2;
    if (sparks > 0) this.emitParticles(centerX, centerY, this.breakColors[kind], sparks);

    if (kind === CAPSULE_BLOCK) {
      this.dropItem(centerX, centerY, this.pickItemKind());
    } else if (kind === BOMB_BLOCK) {
      this.detonate(centerX, centerY, BOMB_BLOCK_RADIUS, "#ff8a3d");
      this.shake = Math.max(this.shake, 2.6);
    } else if (!byExplosion && this.random() < this.dropChance()) {
      this.dropItem(centerX, centerY, this.pickItemKind());
    }

    this.updatePhase();
  }

  /* ---------- Capsules ---------- */

  /** Bombs become more likely as the field empties, so stragglers get cleaned up. */
  private dropChance(): number {
    if (this.balls.length < 8) return FEW_BALLS_DROP_CHANCE;
    if (this.balls.length < 40) return SOME_BALLS_DROP_CHANCE;
    return RANDOM_DROP_CHANCE;
  }

  /** Ball capsules dominate while balls are scarce; bombs take over as the field empties. */
  private pickItemKind(): ItemKind {
    const remainingShare = 1 - this.destroyed / this.breakableTotal;
    const bombChance = remainingShare < 0.15 ? 0.45 : this.balls.length < 8 ? 0.08 : 0.2;
    // ×3 is the big multiplier: common early, rare once the field is already crowded.
    const timesShare = this.balls.length < 40 ? 0.4 : this.balls.length < 150 ? 0.18 : 0.05;
    const roll = this.random();
    if (roll < bombChance) return "bomb";
    return roll < bombChance + (1 - bombChance) * (1 - timesShare) ? "plus" : "times";
  }

  private dropItem(x: number, y: number, kind: ItemKind): void {
    if (this.items.length >= MAX_ITEMS) return;
    this.items.push({ x, y, kind, age: 0 });
  }

  private updateItems(dt: number): void {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      const previousY = item.y;
      item.age += dt;
      item.y += ITEM_FALL_SPEED * dt;
      const caught =
        previousY <= this.paddle.y &&
        item.y >= this.paddle.y &&
        Math.abs(item.x - this.paddle.x) <= this.paddle.width / 2 + 14;
      if (caught) {
        this.items.splice(index, 1);
        this.activateItem(item);
      } else if (item.y > WORLD.height + 12) {
        this.items.splice(index, 1);
      }
    }
  }

  private activateItem(item: Item): void {
    const x = this.paddle.x;
    const y = this.paddle.y - 14;
    if (item.kind === "plus") {
      this.launchFromPaddle(3, 0.32);
      this.addPopup(x, y, "+3 BALLS", ITEM_COLORS.plus);
      this.shake = Math.max(this.shake, 1.5);
    } else if (item.kind === "times") {
      const parents = this.balls.slice();
      const limit = Math.min(MAX_BALLS, this.balls.length + TIMES_MAX_GAIN);
      for (const parent of parents) {
        if (this.balls.length >= limit) break;
        this.splitBall(parent, -0.42);
        this.splitBall(parent, 0.42);
      }
      this.addPopup(x, y, "×3 → " + this.balls.length + " BALLS", ITEM_COLORS.times);
      this.shake = Math.max(this.shake, 4);
      this.flash = Math.max(this.flash, 0.35);
    } else {
      const target = this.densestCluster();
      this.addPopup(x, y, "BOMB!", ITEM_COLORS.bomb);
      if (!target) return;
      this.beams.push({ x1: x, y1: y, x2: target.x, y2: target.y, life: 0.32, maxLife: 0.32 });
      this.detonate(target.x, target.y, BOMB_ITEM_RADIUS, "#ff5a3c");
      this.addPopup(target.x, target.y - 18, "BOOM", "#ffd34d");
      this.shake = Math.max(this.shake, 8);
      this.flash = Math.max(this.flash, 0.6);
    }
  }

  /** Centre (px) of the 10×10-cell tile holding the most remaining breakable blocks. */
  private densestCluster(): Point | null {
    const tile = 10;
    let best = 0;
    let bestPoint: Point | null = null;
    for (let tileRow = 0; tileRow < WORLD.rows; tileRow += tile) {
      for (let tileColumn = 0; tileColumn < WORLD.columns; tileColumn += tile) {
        let count = 0;
        let sumColumn = 0;
        let sumRow = 0;
        for (let row = tileRow; row < tileRow + tile; row += 1) {
          for (let column = tileColumn; column < tileColumn + tile; column += 1) {
            if (!isBreakable(this.bricks[row * WORLD.columns + column])) continue;
            count += 1;
            sumColumn += column;
            sumRow += row;
          }
        }
        if (count > best) {
          best = count;
          bestPoint = {
            x: WORLD.gridX + (sumColumn / count + 0.5) * WORLD.cell,
            y: WORLD.gridY + (sumRow / count + 0.5) * WORLD.cell,
          };
        }
      }
    }
    return bestPoint;
  }

  /* ---------- Explosions ---------- */

  private detonate(x: number, y: number, maxRadius: number, color: string): void {
    this.explosions.push({ x, y, radius: 0, maxRadius, color });
  }

  /** Grows each blast outward; cells inside the radius are destroyed, which may chain other bombs. */
  private updateExplosions(dt: number): void {
    for (let index = 0; index < this.explosions.length; index += 1) {
      const blast = this.explosions[index];
      blast.radius = Math.min(blast.maxRadius, blast.radius + EXPLOSION_GROWTH * dt);
      const minColumn = Math.max(0, Math.floor((blast.x - blast.radius - WORLD.gridX) / WORLD.cell));
      const maxColumn = Math.min(WORLD.columns - 1, Math.floor((blast.x + blast.radius - WORLD.gridX) / WORLD.cell));
      const minRow = Math.max(0, Math.floor((blast.y - blast.radius - WORLD.gridY) / WORLD.cell));
      const maxRow = Math.min(WORLD.rows - 1, Math.floor((blast.y + blast.radius - WORLD.gridY) / WORLD.cell));
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          if (!isBreakable(this.bricks[row * WORLD.columns + column])) continue;
          const cx = WORLD.gridX + (column + 0.5) * WORLD.cell;
          const cy = WORLD.gridY + (row + 0.5) * WORLD.cell;
          if (Math.hypot(cx - blast.x, cy - blast.y) <= blast.radius) this.breakCell(column, row, true);
        }
      }
    }
    // Keep finished blasts briefly so the renderer can fade their shockwave.
    this.explosions = this.explosions.filter((blast) => blast.radius < blast.maxRadius + 18);
    for (const blast of this.explosions) {
      if (blast.radius >= blast.maxRadius) blast.radius += EXPLOSION_GROWTH * 0.4 * dt;
    }
  }

  /* ---------- Effects ---------- */

  private updateEffects(dt: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 52 * dt;
      particle.life -= dt;
      if (particle.life <= 0) this.particles.splice(index, 1);
    }
    for (let index = this.popups.length - 1; index >= 0; index -= 1) {
      const popup = this.popups[index];
      popup.y -= 22 * dt;
      popup.life -= dt;
      if (popup.life <= 0) this.popups.splice(index, 1);
    }
    for (let index = this.beams.length - 1; index >= 0; index -= 1) {
      this.beams[index].life -= dt;
      if (this.beams[index].life <= 0) this.beams.splice(index, 1);
    }
    this.shake *= Math.exp(-dt * 7);
    this.flash *= Math.exp(-dt * 6);
    if (this.shake < 0.05) this.shake = 0;
    if (this.flash < 0.01) this.flash = 0;
  }

  private addPopup(x: number, y: number, text: string, color: string): void {
    this.popups.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
    if (this.popups.length > 8) this.popups.shift();
  }

  private emitParticles(x: number, y: number, color: string, count: number): void {
    if (this.particles.length + count > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length + count - MAX_PARTICLES);
    }
    for (let index = 0; index < count; index += 1) {
      const angle = this.random() * Math.PI * 2;
      const speed = 34 + this.random() * 125;
      const life = 0.24 + this.random() * 0.48;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 0.8 + this.random() * 1.8,
        color,
      });
    }
  }

  /* ---------- Phases & layout ---------- */

  private updatePhase(): void {
    if (this.elapsed >= 64 || this.destroyed >= 4_100) this.phase = 4;
    else if (this.elapsed >= 44 || this.destroyed >= 1_700) this.phase = 3;
    else if (this.elapsed >= 24 || this.destroyed >= 360) this.phase = 2;
    else this.phase = 1;
  }

  /** The original hand-made layout, reproduced exactly as before patterns existed. */
  private buildClassic(): void {
    this.seed = 1_234_567;
    this.patternName = "Classic";
    this.channelPath = CLASSIC_CHANNEL_PATH;
    this.bricks = new Uint8Array(TOTAL_CELLS);
    for (let row = 0; row < WORLD.rows; row += 1) {
      const diagonal = 8 + row * 0.9;
      for (let column = 0; column < WORLD.columns; column += 1) {
        this.bricks[row * WORLD.columns + column] = column < diagonal ? RED : BLUE;
      }
    }
    this.carveFrameAndChannel();
    this.placeSpecialBlocks();
  }

  /**
   * Builds a layout from the pattern number: colour split, channel route and extra walls are all
   * drawn from a seeded generator, so the same number always gives the same field and run.
   * Layouts where some block cannot be reached by a ball are rejected and regenerated.
   */
  private generatePattern(): boolean {
    for (let attempt = 0; attempt < PATTERN_ATTEMPTS; attempt += 1) {
      this.seed = hashSeed(this.pattern * 131 + attempt);
      const style = this.randomColorStyle();
      this.bricks = new Uint8Array(TOTAL_CELLS);
      for (let row = 0; row < WORLD.rows; row += 1) {
        for (let column = 0; column < WORLD.columns; column += 1) {
          this.bricks[row * WORLD.columns + column] = style.colorAt(column, row);
        }
      }
      this.channelPath = this.randomChannelPath();
      this.carveFrameAndChannel();
      const walls = this.placeObstacles();
      if (!this.everyBlockReachable()) continue;

      this.placeSpecialBlocks();
      this.patternName = style.name + (walls > 0 ? " + " + walls + (walls === 1 ? " wall" : " walls") : "");
      // The run itself gets its own seed derived from the pattern, independent of how many attempts were needed.
      this.seed = hashSeed(this.pattern ^ 0x5bd1e995);
      return true;
    }
    return false;
  }

  /** Picks one of several ways to split the field between the two block colours. */
  private randomColorStyle(): { name: string; colorAt: (column: number, row: number) => number } {
    const pick = (a: boolean) => (a ? RED : BLUE);
    const flip = this.random() < 0.5;
    const roll = Math.floor(this.random() * 6);
    if (roll === 0) {
      const slope = (this.random() * 2 - 1) * 1.3;
      const offset = 40 - slope * 40 + (this.random() - 0.5) * 24;
      return { name: "Diagonal", colorAt: (c, r) => pick((c < offset + slope * r) !== flip) };
    }
    if (roll === 1) {
      const amplitude = 6 + this.random() * 12;
      const frequency = 0.07 + this.random() * 0.14;
      const phase = this.random() * Math.PI * 2;
      const vertical = this.random() < 0.5;
      return {
        name: "Wave",
        colorAt: (c, r) => pick(vertical ? c < 40 + amplitude * Math.sin(r * frequency + phase) : r < 40 + amplitude * Math.sin(c * frequency + phase)),
      };
    }
    if (roll === 2) {
      const cx = 20 + this.random() * 40;
      const cy = 18 + this.random() * 40;
      const width = 6 + this.random() * 7;
      return { name: "Rings", colorAt: (c, r) => pick((Math.floor(Math.hypot(c - cx, r - cy) / width) % 2 === 0) !== flip) };
    }
    if (roll === 3) {
      const angle = this.random() * Math.PI;
      const width = 6 + this.random() * 9;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return { name: "Stripes", colorAt: (c, r) => pick(mod2(Math.floor((c * cos + r * sin) / width)) === 0) };
    }
    if (roll === 4) {
      const width = 10 + Math.floor(this.random() * 11);
      return { name: "Checker", colorAt: (c, r) => pick(mod2(Math.floor(c / width) + Math.floor(r / width)) === 0) };
    }
    const cx = 25 + this.random() * 30;
    const cy = 22 + this.random() * 30;
    const arms = 2 + Math.floor(this.random() * 2);
    const pitch = 9 + this.random() * 8;
    return {
      name: "Spiral",
      colorAt: (c, r) => {
        const turn = (Math.atan2(r - cy, c - cx) / (Math.PI * 2)) * arms + Math.hypot(c - cx, r - cy) / pitch;
        return pick(mod2(Math.floor(turn)) === 0);
      },
    };
  }

  /**
   * A channel from a random point on the bottom edge that zigzags upward. Every bend moves up by
   * at least 8 rows, so the route never crosses itself.
   */
  private randomChannelPath(): Point[] {
    const entry = 14 + Math.floor(this.random() * 52);
    let x = entry;
    let y = 64 + this.random() * 9;
    const path: Point[] = [{ x: entry, y: 81 }, { x, y }];
    const topY = 6 + this.random() * 8;
    const bends = 2 + Math.floor(this.random() * 3);
    let direction = this.random() < 0.5 ? -1 : 1;
    for (let bend = 0; bend < bends && y > topY + 8; bend += 1) {
      const share = (y - topY) / (bends - bend);
      y = Math.max(topY, y - Math.max(8, share * (0.75 + this.random() * 0.5)));
      let nextX = x + direction * (14 + this.random() * 30);
      if (nextX < 8 || nextX > 72) {
        direction *= -1;
        nextX = x + direction * (14 + this.random() * 30);
      }
      x = Math.max(8, Math.min(72, nextX));
      path.push({ x, y });
      direction *= -1;
    }
    if (y - 5 >= 4) path.push({ x, y: y - 5 });
    return path;
  }

  /** Adds 0–5 small concrete walls (bars, pillars, diagonal dashes) away from the channel. Returns how many. */
  private placeObstacles(): number {
    const count = Math.floor(this.random() * 6);
    const keepAway = CHANNEL_HALF_WIDTH + CHANNEL_WALL_THICKNESS + 2.5;
    const setConcrete = (column: number, row: number) => {
      if (column < 2 || column > WORLD.columns - 3 || row < 2 || row > WORLD.rows - 3) return;
      const index = row * WORLD.columns + column;
      const kind = this.bricks[index];
      if (kind !== RED && kind !== BLUE) return;
      if (closestOnPath(column + 0.5, row + 0.5, this.channelPath).distance <= keepAway) return;
      this.bricks[index] = CONCRETE;
    };
    for (let n = 0; n < count; n += 1) {
      const column = 6 + Math.floor(this.random() * 68);
      const row = 6 + Math.floor(this.random() * 62);
      const shape = this.random();
      if (shape < 0.45) {
        const length = 6 + Math.floor(this.random() * 11);
        const thickness = this.random() < 0.5 ? 1 : 2;
        for (let dx = 0; dx < length; dx += 1) for (let dy = 0; dy < thickness; dy += 1) setConcrete(column + dx, row + dy);
      } else if (shape < 0.75) {
        const width = 2 + Math.floor(this.random() * 2);
        const height = 2 + Math.floor(this.random() * 3);
        for (let dx = 0; dx < width; dx += 1) for (let dy = 0; dy < height; dy += 1) setConcrete(column + dx, row + dy);
      } else {
        const length = 6 + Math.floor(this.random() * 5);
        const slope = this.random() < 0.5 ? 1 : -1;
        for (let step = 0; step < length; step += 1) {
          setConcrete(column + step, row + step * slope);
          setConcrete(column + step + 1, row + step * slope);
        }
      }
    }
    return count;
  }

  /**
   * Checks reachability at ball size: a ball needs a 2×2-cell opening, so the flood fill walks
   * over 2×2 windows free of concrete, starting at the channel mouth. Every breakable cell must lie
   * in or next to a reached window.
   */
  private everyBlockReachable(): boolean {
    const { columns, rows } = WORLD;
    const windowOpen = (column: number, row: number) =>
      column >= 0 && row >= 0 && column < columns - 1 && row < rows - 1 &&
      this.bricks[row * columns + column] !== CONCRETE &&
      this.bricks[row * columns + column + 1] !== CONCRETE &&
      this.bricks[(row + 1) * columns + column] !== CONCRETE &&
      this.bricks[(row + 1) * columns + column + 1] !== CONCRETE;
    const visited = new Uint8Array(TOTAL_CELLS);
    const reachedCell = new Uint8Array(TOTAL_CELLS);
    const queue: number[] = [];
    for (let column = 0; column < columns - 1; column += 1) {
      if (windowOpen(column, rows - 2)) {
        visited[(rows - 2) * columns + column] = 1;
        queue.push((rows - 2) * columns + column);
      }
    }
    while (queue.length > 0) {
      const index = queue.pop()!;
      const column = index % columns;
      const row = Math.floor(index / columns);
      reachedCell[index] = reachedCell[index + 1] = reachedCell[index + columns] = reachedCell[index + columns + 1] = 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextColumn = column + dx;
        const nextRow = row + dy;
        const next = nextRow * columns + nextColumn;
        if (!windowOpen(nextColumn, nextRow) || visited[next]) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    for (let index = 0; index < TOTAL_CELLS; index += 1) {
      if (!isBreakable(this.bricks[index]) || reachedCell[index]) continue;
      const column = index % columns;
      const nearReached =
        (column > 0 && reachedCell[index - 1]) ||
        (column < columns - 1 && reachedCell[index + 1]) ||
        (index >= columns && reachedCell[index - columns]) ||
        (index + columns < TOTAL_CELLS && reachedCell[index + columns]);
      if (!nearReached) return false;
    }
    return true;
  }

  /**
   * Seals the field with a concrete frame and carves the zigzag entry channel (its only opening).
   * The channel walls have regular cracks and the channel's far end is open.
   */
  private carveFrameAndChannel(): void {
    const { columns, rows } = WORLD;
    for (let column = 0; column < columns; column += 1) {
      this.bricks[column] = CONCRETE;
      this.bricks[(rows - 1) * columns + column] = CONCRETE;
    }
    for (let row = 0; row < rows; row += 1) {
      this.bricks[row * columns] = CONCRETE;
      this.bricks[row * columns + columns - 1] = CONCRETE;
    }

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const { distance, along, length } = closestOnPath(column + 0.5, row + 0.5, this.channelPath);
        const index = row * columns + column;
        if (distance <= CHANNEL_HALF_WIDTH) {
          this.bricks[index] = EMPTY;
        } else if (distance <= CHANNEL_HALF_WIDTH + CHANNEL_WALL_THICKNESS && along < length - 1) {
          const crack = along > CHANNEL_SOLID_START && along % CHANNEL_GAP_EVERY >= CHANNEL_GAP_EVERY - CHANNEL_GAP_LENGTH;
          if (!crack) this.bricks[index] = CONCRETE;
        }
      }
    }
  }

  /** Scatters capsule blocks (half of them along the channel) and bomb blocks. */
  private placeSpecialBlocks(): void {
    this.placeChannelCapsules(CHANNEL_CAPSULE_COUNT);
    this.scatter(CAPSULE_BLOCK, CAPSULE_BLOCK_COUNT - CHANNEL_CAPSULE_COUNT);
    this.scatter(BOMB_BLOCK, BOMB_BLOCK_COUNT);
  }

  /** Puts capsule blocks in the band just behind the channel walls, spread along its length. */
  private placeChannelCapsules(count: number): void {
    const candidates: number[] = [];
    for (let index = 0; index < TOTAL_CELLS; index += 1) {
      const kind = this.bricks[index];
      if (kind !== RED && kind !== BLUE) continue;
      const column = index % WORLD.columns;
      const row = Math.floor(index / WORLD.columns);
      const { distance } = closestOnPath(column + 0.5, row + 0.5, this.channelPath);
      const wallOuter = CHANNEL_HALF_WIDTH + CHANNEL_WALL_THICKNESS;
      if (distance > wallOuter && distance <= wallOuter + 2) candidates.push(index);
    }
    // Candidates are in row order; taking evenly spaced ones spreads capsules along the channel.
    for (let n = 0; n < count && candidates.length > 0; n += 1) {
      const pick = Math.floor(((n + this.random() * 0.8) / count) * candidates.length);
      this.bricks[candidates[Math.min(pick, candidates.length - 1)]] = CAPSULE_BLOCK;
    }
  }

  /** Places `count` special blocks on random ordinary red/blue cells. */
  private scatter(kind: number, count: number): void {
    let placed = 0;
    while (placed < count) {
      const index = Math.floor(this.random() * TOTAL_CELLS);
      const current = this.bricks[index];
      if (current !== RED && current !== BLUE) continue;
      this.bricks[index] = kind;
      placed += 1;
    }
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1_664_525) + 1_013_904_223) >>> 0;
    return this.seed / 4_294_967_296;
  }
}

/** Spreads small integers into well-mixed 32-bit seeds (never 0). */
function hashSeed(value: number): number {
  let x = (value ^ 0x2545f491) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x === 0 ? 1 : x;
}

/** 0 or 1 for any integer, including negatives. */
function mod2(value: number): number {
  return ((value % 2) + 2) % 2;
}

/** Distance from a point to a polyline, plus how far along the polyline the closest point lies. */
function closestOnPath(x: number, y: number, path: Point[]): { distance: number; along: number; length: number } {
  let distance = Infinity;
  let along = 0;
  let travelled = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segment = Math.hypot(dx, dy);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (segment * segment)));
    const d = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
    if (d < distance) {
      distance = d;
      along = travelled + t * segment;
    }
    travelled += segment;
  }
  return { distance, along, length: travelled };
}
