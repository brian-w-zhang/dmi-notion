import Phaser from 'phaser';
import { CarDirection } from '../data/carAnimations';
import { CharacterKeys } from './Character';
import { Polygon, isPointInAnyPolygon } from '../systems/CollisionSystem';

export const DEFAULT_CAR_SPEED = 7;
type InputDirection = keyof CharacterKeys;

export interface CarConfig {
  scene:          Phaser.Scene;
  textureKey:     string;
  x:              number;  // pivot x — center of the car in world coords
  y:              number;  // pivot y — center of the car in world coords
  initialFacing?: CarDirection;
  depth?:         number;
  speed?:         number;
  /** Polygons the car's edges must remain inside. Empty = unrestricted. */
  walkableZones?: Polygon[];
  /**
   * Half of the car's longer pixel dimension (used for edge-based boundary checks).
   * Default 96 = car_3 long-axis half (192 / 2).
   */
  halfLong?:      number;
  /**
   * Half of the car's shorter pixel dimension.
   * Default 48 = car_3 short-axis half (96 / 2).
   */
  halfShort?:     number;
}

/**
 * Car entity. Movement is driven by the same CharacterKeys interface as Character.
 *
 * Reference point (pivot): center of the car sprite (origin 0.5, 0.5 always).
 *
 * Boundary checks test the car's leading EDGE (not center) so the visible body
 * never crosses a zone boundary:
 *   Moving horizontally → checks (pivot.x ± halfW, pivot.y)
 *   Moving vertically   → checks (pivot.x, pivot.y ± halfH)
 * where halfW/halfH swap between halfLong/halfShort depending on facing.
 *
 * Frame dimensions for car_3 (6×6-tile blocks):
 *   Right / Left: 192 × 96 px   Back / Front: 96 × 192 px
 *
 * Reverse (shift): moves opposite to current facing, keeping animation unchanged.
 */
export class Car {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly textureKey:    string;
  private readonly walkableZones: Polygon[];
  private readonly halfLong:      number;
  private readonly halfShort:     number;

  private facing:   CarDirection = 'front';
  private isMoving: boolean      = false;

  readonly speed: number;

  private pivotX: number;
  private pivotY: number;

  constructor(config: CarConfig) {
    const {
      scene, textureKey, x, y,
      initialFacing = 'front',
      depth         = 17,
      speed         = DEFAULT_CAR_SPEED,
      walkableZones = [],
      halfLong      = 96,
      halfShort     = 48,
    } = config;

    this.textureKey    = textureKey;
    this.speed         = speed;
    this.walkableZones = walkableZones;
    this.halfLong      = halfLong;
    this.halfShort     = halfShort;
    this.pivotX        = x;
    this.pivotY        = y;
    this.facing        = initialFacing;

    this.sprite = scene.add.sprite(x, y, textureKey);
    this.sprite.setDepth(depth);
    this.sprite.setOrigin(0.5, 0.5);

    this.playAnim('idle', this.facing);
    this.sprite.setPosition(x, y);
  }

  /**
   * @param keys   WASD / arrow input — used for normal driving when shift is not held
   * @param shift  When true, car reverses (moves opposite to facing); WASD ignored
   */
  update(keys: CharacterKeys, shift: boolean, oldestHeldDirection: InputDirection | null = null): void {
    const { up, down, left, right } = keys;
    const prevFacing = this.facing;
    let dx = 0;
    let dy = 0;
    let shouldMove = false;

    if (shift) {
      // Reverse: move opposite to current facing, don't change facing
      shouldMove = true;
      switch (this.facing) {
        case 'right': dx = -this.speed; break;
        case 'left':  dx = +this.speed; break;
        case 'back':  dy = +this.speed; break;
        case 'front': dy = -this.speed; break;
      }
    } else {
      const anyMovement = right || left || up || down;
      shouldMove = anyMovement;

      if (anyMovement) {
        // If multiple keys are held, face in the oldest-held direction.
        // Fallback to static priority when no order hint is provided.
        if (oldestHeldDirection === 'right') this.facing = 'right';
        else if (oldestHeldDirection === 'left') this.facing = 'left';
        else if (oldestHeldDirection === 'up') this.facing = 'back';
        else if (oldestHeldDirection === 'down') this.facing = 'front';
        else if (right) this.facing = 'right';
        else if (left)  this.facing = 'left';
        else if (up)    this.facing = 'back';
        else if (down)  this.facing = 'front';

        dx = (right ? this.speed : 0) - (left ? this.speed : 0);
        dy = (down  ? this.speed : 0) - (up   ? this.speed : 0);
      }
    }

    const facingChanged = this.facing !== prevFacing;
    const movingChanged = shouldMove  !== this.isMoving;

    if (facingChanged || movingChanged) {
      this.isMoving = shouldMove;
      this.playAnim(shouldMove ? 'drive' : 'idle', this.facing);
    }

    // Axis-independent movement — tests the leading edge, not the center
    if (dx !== 0) {
      const nx = this.pivotX + dx;
      if (this.canMoveX(nx, dx)) this.pivotX = nx;
    }
    if (dy !== 0) {
      const ny = this.pivotY + dy;
      if (this.canMoveY(ny, dy)) this.pivotY = ny;
    }

    this.sprite.setPosition(this.pivotX, this.pivotY);
  }

  getDriverDoorPosition(): { x: number; y: number; facing: CarDirection } {
    const gap        = 40;
    const edge       = this.halfShort + gap;  // perpendicular distance from pivot to door
    const SW         = 32;  // sprite width
    const SH         = 64;  // sprite height
    switch (this.facing) {
      case 'right': return { x: this.pivotX + SW,       y: this.pivotY - edge + Math.round(SH * 1.1), facing: 'back'  };
      case 'back':  return { x: this.pivotX - edge + SW, y: this.pivotY,                facing: 'left'  };
      case 'left':  return { x: this.pivotX - SW,       y: this.pivotY + edge,          facing: 'front' };
      case 'front': return { x: this.pivotX + edge - SW, y: this.pivotY + SH,           facing: 'right' };
    }
  }

  getPivot(): { x: number; y: number } {
    return { x: this.pivotX, y: this.pivotY };
  }

  /**
   * Axis-aligned bounding rectangle of the car as a Polygon, using the same
   * asymmetric dimensions as the edge-detection checks (front = halfLong,
   * back = halfLong - 32). Pass to Character as a collider after dismounting
   * so Dwight can't walk through the parked car.
   */
  getColliderPolygon(): Polygon {
    const hL  = this.halfLong;
    const hLb = this.halfLong - 32;  // trimmed back edge
    const hS  = this.halfShort;
    const px  = this.pivotX;
    const py  = this.pivotY;
    switch (this.facing) {
      case 'right': return { vertices: [
        { x: px - hLb, y: py - (hS - 32) }, { x: px + hL,  y: py - (hS - 32) },
        { x: px + hL,  y: py + hS        }, { x: px - hLb, y: py + hS        },
      ]};
      case 'left': return { vertices: [
        { x: px - hL,  y: py - (hS - 32) }, { x: px + hLb, y: py - (hS - 32) },
        { x: px + hLb, y: py + hS        }, { x: px - hL,  y: py + hS        },
      ]};
      case 'back': return { vertices: [
        { x: px - hS, y: py - hL  }, { x: px + hS, y: py - hL  },
        { x: px + hS, y: py + hLb }, { x: px - hS, y: py + hLb },
      ]};
      case 'front': return { vertices: [
        { x: px - hS, y: py - hLb }, { x: px + hS, y: py - hLb },
        { x: px + hS, y: py + hL  }, { x: px - hS, y: py + hL  },
      ]};
    }
  }

  /**
   * Asymmetric edge check for horizontal movement.
   * The car is visually 5 tiles long — the front is flush with the sprite edge
   * but the back has 32px of empty padding, so:
   *   toward front  → offset = halfLong      (full 96 px)
   *   toward back   → offset = halfLong - 32 (trimmed 64 px)
   * Lateral movement (perpendicular to car length) always uses halfShort.
   */
  private canMoveX(nx: number, dx: number): boolean {
    if (this.walkableZones.length === 0) return true;
    let offset: number;
    if (this.facing === 'right' || this.facing === 'left') {
      const towardFront = (this.facing === 'right' && dx > 0) || (this.facing === 'left' && dx < 0);
      offset = towardFront ? this.halfLong : this.halfLong - 32;
    } else {
      offset = this.halfShort;
    }
    return isPointInAnyPolygon(nx + (dx > 0 ? offset : -offset), this.pivotY, this.walkableZones);
  }

  /** Same asymmetric logic for vertical movement. */
  private canMoveY(ny: number, dy: number): boolean {
    if (this.walkableZones.length === 0) return true;
    let offset: number;
    if (this.facing === 'back' || this.facing === 'front') {
      const towardFront = (this.facing === 'back' && dy < 0) || (this.facing === 'front' && dy > 0);
      offset = towardFront ? this.halfLong : this.halfLong - 32;
    } else {
      // Left/right facing: top edge trimmed by 32 px (less padding above the car roof)
      offset = dy < 0 ? this.halfShort - 32 : this.halfShort;
    }
    return isPointInAnyPolygon(this.pivotX, ny + (dy > 0 ? offset : -offset), this.walkableZones);
  }

  private playAnim(animName: string, dir: CarDirection): void {
    const key = `${this.textureKey}-${animName}-${dir}`;
    if (this.sprite.anims.currentAnim?.key !== key) {
      this.sprite.play(key);
    }
  }
}
