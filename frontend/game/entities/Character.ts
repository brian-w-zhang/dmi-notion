import Phaser from 'phaser';
import { Polygon, isPointInAnyPolygon } from '../systems/CollisionSystem';

export type FacingDirection = 'right' | 'back' | 'left' | 'front';

/**
 * Cardinal direction from one feet position toward another (top-down).
 * Matches scripted path facing in `_advancePath` so walking up to someone and
 * “face toward” use the same rule.
 */
export function facingTowardWorldPoint(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): FacingDirection {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 0 && dy === 0) return 'front';
  return Math.abs(dx) >= Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'front' : 'back');
}

/**
 * Booleans describing which movement directions are active this frame.
 * Accepting plain booleans (not Phaser key refs) keeps Character input-source-agnostic:
 * keyboard, AI agent, or behavior tree all produce the same interface.
 */
export interface CharacterKeys {
  up:    boolean;
  down:  boolean;
  left:  boolean;
  right: boolean;
}

export interface CharacterConfig {
  scene:     Phaser.Scene;
  spriteKey: string;
  x:         number;
  y:         number;
  /**
   * Render depth. Should be set to the flat index of the 'sprites' layer in
   * map.layers so characters appear above background/shadows but below
   * foreground furniture. Defaults to 9999 (above everything) as a safe
   * fallback for isolated/test scenes.
   */
  depth?: number;
  /** World pixels moved per frame. Default 4. */
  speed?: number;
  /**
   * Polygons (world coordinates) where the character is allowed to walk.
   * The test point is the character's feet (sprite origin = bottom-center).
   * If empty, movement is unrestricted.
   */
  walkableZones?: Polygon[];
  /**
   * Polygons (world coordinates) that block movement regardless of walkable zones.
   */
  colliders?: Polygon[];
}

const DEFAULT_DEPTH = 9999;
const DEFAULT_SPEED = 3;

export class Character {
  /** Exposed for external reads (position, depth sorting, future physics handoff). */
  readonly sprite: Phaser.GameObjects.Sprite;

  private readonly spriteKey: string;
  private facing: FacingDirection = 'front';
  private isMoving: boolean = false;
  readonly speed: number;

  private readonly walkableZones: Polygon[];
  private readonly colliders: Polygon[];

  private _isSitting = false;
  get isSitting(): boolean { return this._isSitting; }
  get isWalking(): boolean { return this.isMoving; }

  private preSitX = 0;
  private preSitY = 0;

  private _pathQueue: { x: number; y: number }[] = [];
  private _pathOnComplete: (() => void) | null = null;
  get isScriptedWalking(): boolean { return this._pathQueue.length > 0; }

  constructor(config: CharacterConfig) {
    const {
      scene, spriteKey, x, y,
      depth = DEFAULT_DEPTH,
      speed = DEFAULT_SPEED,
      walkableZones = [],
      colliders = [],
    } = config;

    this.walkableZones = walkableZones;
    this.colliders     = colliders;

    this.spriteKey = spriteKey;
    this.speed     = speed;

    this.sprite = scene.add.sprite(x, y, spriteKey);

    this.sprite.setDepth(depth);
    // Anchor at feet — correct for top-down: depth sorting and tile alignment
    // are both based on where the character stands, not the center of the frame.
    this.sprite.setOrigin(0.5, 1);

    this.playAnim('idle-full', this.facing);
  }

  /**
   * Call once per game update tick.
   * Moves the sprite and switches animations when facing/moving state changes.
   *
   * Direction priority for diagonal input: right > left > up > down.
   * All pressed axes move simultaneously (free 4-directional movement).
   * up   → facing 'back'  (character walks away from camera)
   * down → facing 'front' (character walks toward camera)
   */
  /**
   * Snap the character to a sit point and play the appropriate sit animation.
   * Movement is blocked until stand() is called.
   * sit-legs plays for right/left; idle-full plays for front/back (no sit anim exists).
   */
  sit(x: number, y: number, facing: FacingDirection): void {
    this.preSitX     = this.sprite.x;
    this.preSitY     = this.sprite.y;
    this._isSitting  = true;
    this.facing      = facing;
    this.isMoving    = false;
    this.sprite.x    = x;
    this.sprite.y    = y;
    const animBase = (facing === 'right' || facing === 'left') ? 'sit-legs' : 'idle-full';
    this.playAnim(animBase, facing, { randomizeLoopPhase: true });
  }

  /**
   * Begin a scripted walk to (x, y). Player input is ignored until the
   * destination is reached, then onComplete fires and control returns.
   * Scripted walks bypass walkable-zone checks — the path is designer-set.
   */
  walkTo(x: number, y: number, onComplete: () => void): void {
    this._pathQueue = [{ x, y }];
    this._pathOnComplete = onComplete;
  }

  /** Walk through a sequence of waypoints (tile-center pixels from PathfindingSystem). */
  followPath(waypoints: { x: number; y: number }[], onComplete: () => void): void {
    if (waypoints.length === 0) { onComplete(); return; }
    this._pathQueue = [...waypoints];
    this._pathOnComplete = onComplete;
  }

  cancelPath(): void {
    this._pathQueue = [];
    this._pathOnComplete = null;
    this.isMoving = false;
    this.playAnim('idle-full', this.facing);
  }

  /** Instantly move the sprite to (x, y) without animation or callbacks. */
  teleportTo(x: number, y: number): void {
    this.sprite.setPosition(x, y);
  }

  /** Return to the pre-sit position and play standing idle. */
  stand(): void {
    this._isSitting = false;
    this.sprite.x   = this.preSitX;
    this.sprite.y   = this.preSitY;
    this.playAnim('idle-full', this.facing);
  }

  /** Face a direction immediately and play idle animation. */
  face(direction: FacingDirection): void {
    if (this._isSitting) return;
    this.facing = direction;
    this.isMoving = false;
    this.playAnim('idle-full', direction);
  }

  /**
   * Lower-body collider footprint for character-vs-character blocking.
   * Keeping this near the sprite's lower half avoids a "floating" hitbox while
   * still preventing overlap with occupied chair space.
   */
  getColliderPolygon(): Polygon {
    const x = this.sprite.x;
    const y = this.sprite.y;
    // Horizontal extent from center to each side (larger = more personal space).
    const sideExtent = 24;
    // Vertical extents from feet anchor (y).
    const topOffset = 44;
    const bottomOffset = 14;

    return {
      vertices: [
        { x: x - sideExtent, y: y - topOffset },
        { x: x + sideExtent, y: y - topOffset },
        { x: x + sideExtent, y: y + bottomOffset },
        { x: x - sideExtent, y: y + bottomOffset },
      ],
    };
  }

  update(keys: CharacterKeys): void {
    if (this._isSitting) return;

    if (this._pathQueue.length > 0) {
      this._advancePath();
      return;
    }

    const { up, down, left, right } = keys;
    const anyMovement = right || left || up || down;

    // Determine facing — first match in priority order
    let newFacing: FacingDirection = this.facing;
    if      (right) newFacing = 'right';
    else if (left)  newFacing = 'left';
    else if (up)    newFacing = 'back';
    else if (down)  newFacing = 'front';

    // Move in all pressed axes, respecting walkable zones and colliders.
    // Axes are tested independently so the character slides along boundaries.
    const dx = (right ? this.speed : 0) - (left ? this.speed : 0);
    const dy = (down  ? this.speed : 0) - (up   ? this.speed : 0);

    if (dx !== 0) {
      const nx = this.sprite.x + dx;
      if (this.canMoveTo(nx, this.sprite.y)) this.sprite.x = nx;
    }
    if (dy !== 0) {
      const ny = this.sprite.y + dy;
      if (this.canMoveTo(this.sprite.x, ny)) this.sprite.y = ny;
    }

    // Switch animation only when state changes — avoids restarting mid-cycle
    const facingChanged = newFacing !== this.facing;
    const movingChanged = anyMovement !== this.isMoving;

    if (facingChanged || movingChanged) {
      this.facing   = newFacing;
      this.isMoving = anyMovement;
      this.playAnim(anyMovement ? 'walk' : 'idle-full', this.facing);
    }
  }

  private _advancePath(): void {
    const target = this._pathQueue[0];
    const dx = target.x - this.sprite.x;
    const dy = target.y - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= this.speed) {
      this.sprite.setPosition(target.x, target.y);
      this._pathQueue.shift();

      if (this._pathQueue.length === 0) {
        this.isMoving = false;
        this.playAnim('idle-full', this.facing);
        const cb = this._pathOnComplete;
        this._pathOnComplete = null;
        cb?.();
      }
      return;
    }

    const step = this.speed / dist;
    this.sprite.x += dx * step;
    this.sprite.y += dy * step;

    const newFacing: FacingDirection =
      Math.abs(dx) >= Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'front' : 'back');

    if (newFacing !== this.facing || !this.isMoving) {
      this.facing   = newFacing;
      this.isMoving = true;
      this.playAnim('walk', newFacing);
    }
  }

  /**
   * Returns true if the character's feet may occupy (x, y).
   * When no walkable zones are configured, all positions are allowed.
   */
  private canMoveTo(x: number, y: number): boolean {
    if (this.walkableZones.length === 0) return true;
    return isPointInAnyPolygon(x, y, this.walkableZones) &&
           !isPointInAnyPolygon(x, y, this.colliders);
  }

  private playAnim(
    animName: string,
    direction: FacingDirection,
    options?: { randomizeLoopPhase?: boolean }
  ): void {
    const key = `${this.spriteKey}-${animName}-${direction}`;
    if (this.sprite.anims.currentAnim?.key !== key) {
      this.sprite.play(key);
      if (options?.randomizeLoopPhase) this.randomizeCurrentLoopFrame();
    }
  }

  private randomizeCurrentLoopFrame(): void {
    const anim = this.sprite.anims.currentAnim;
    if (!anim) return;
    if (anim.frames.length <= 1) return;

    const randomFrame = Phaser.Utils.Array.GetRandom(anim.frames);
    this.sprite.anims.setCurrentFrame(randomFrame);
  }
}
