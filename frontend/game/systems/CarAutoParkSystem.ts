import { findObjectGroupInJSON, type TiledMapJsonRoot } from './CollisionSystem';
import type { CharacterKeys } from '../entities/Character';

export interface ParkingSpot {
  id: number;
  name: string;
  /** Polygon centroid x — actual centre of the parking bay. */
  x: number;
  /** Polygon centroid y — actual centre of the parking bay. */
  y: number;
  handicap: boolean;
  /** World-space polygon vertices for hover highlight. */
  polygon: { x: number; y: number }[];
  /** X of the column approach lane (≈360 for left column, ≈465 for right column). */
  pathX: number;
  /** Target y in the lane to reach before entering the spot. */
  pathY: number;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

function parseActionPathPoints(tiledJSON: TiledMapJsonRoot): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const group = findObjectGroupInJSON(tiledJSON.layers, 'Action Points');
  if (!group) return result;
  for (const obj of (group.objects ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = obj as any;
    const name: string = raw.name ?? '';
    if (name.endsWith('_path') && !result.has(name)) {
      result.set(name, { x: raw.x, y: raw.y });
    }
  }
  return result;
}

/**
 * Parses ParkingSpot objects from the "Parking Spots" objectgroup and enriches
 * each with lane approach data from the "Action Points" layer (_path points).
 *
 * Left column  (centroid x ≈ 240): lane x = ps1_path.x    ≈ 360, entry = ps1_path.y    ≈ 1196
 * Right column (centroid x ≈ 590): lane x = handicap_path.x ≈ 465, entry = handicap_path.y ≈ 1106
 */
export function parseParkingSpots(tiledJSON: TiledMapJsonRoot): ParkingSpot[] {
  const pathPoints = parseActionPathPoints(tiledJSON);

  const group = findObjectGroupInJSON(tiledJSON.layers, 'Parking Spots');
  if (!group) {
    console.warn('[CarAutoPark] "Parking Spots" objectgroup not found in tilemap');
    return [];
  }

  return (group.objects ?? []).map((obj) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = obj as any;
    const name: string = raw.name ?? '';
    const handicap = (raw.properties ?? []).some(
      (p: { name: string; value: unknown }) => p.name === 'handicap' && p.value === true,
    );

    const rawVerts: { x: number; y: number }[] = raw.polygon ?? [];
    const polygon = rawVerts.map(v => ({ x: raw.x + v.x, y: raw.y + v.y }));
    const cx = polygon.length > 0 ? polygon.reduce((s, v) => s + v.x, 0) / polygon.length : raw.x;
    const cy = polygon.length > 0 ? polygon.reduce((s, v) => s + v.y, 0) / polygon.length : raw.y;

    // Handicap polygons use handicap_path; numbered spots use ps{N}_path.
    const pathKey = handicap ? 'handicap_path' : `${name}_path`;
    const pathPt  = pathPoints.get(pathKey);

    const isLeftColumn = cx < 416;
    const pathX = pathPt?.x ?? (isLeftColumn ? 360 : 465);
    const pathY = pathPt?.y ?? cy;

    return { id: raw.id ?? 0, name, x: cx, y: cy, handicap, polygon, pathX, pathY };
  });
}

// ── Constants ────────────────────────────────────────────────────────────────

// Arrival tolerance (must be >= car speed 7 px/frame).
const ARRIVE_TOL = 14;
// Frames of zero horizontal movement before declaring the car parked.
const STOPPED_FRAMES = 8;
// Frames without progress before triggering a jog in the orthogonal direction.
const STUCK_FRAMES = 60;   // ~1 s at 60 fps
// Frames to drive sideways per jog.
const JOG_FRAMES = 22;
// Jogs per phase before giving up and skipping / cancelling.
const MAX_JOGS = 10;
// Vertical offset: car boundary when facing left/right is asymmetric (top 16 px,
// bottom 48 px), so the visual centre sits 24 px below the pivot.
const SPOT_Y_OFFSET = -10;

type State = 'idle' | 'align-lane-x' | 'drive-to-path-y' | 'enter-spot' | 'parked';
const NONE: CharacterKeys = { up: false, down: false, left: false, right: false };

// ── CarAutoParkSystem ────────────────────────────────────────────────────────

export class CarAutoParkSystem {
  private readonly spots: ParkingSpot[];
  private state: State = 'idle';
  private targetSpot: ParkingSpot | null = null;
  private onParked: (() => void) | null = null;

  // Computed each startAtSpot call.
  private laneX       = 0;
  private targetPathY = 0;  // spot.pathY + SPOT_Y_OFFSET

  // Snap y signal consumed once by MainMap before car.update().
  private pendingSnapY: number | null = null;

  // Stuck / jog tracking (reset per phase).
  private lastCheckVal = NaN;
  private stuckFrames  = 0;
  private jogFrames    = 0;
  private jogKeys: CharacterKeys = NONE;
  private jogCount     = 0;

  // enter-spot phase.
  private lastCarX     = NaN;
  private stoppedFrames = 0;

  constructor(spots: ParkingSpot[]) {
    this.spots = spots;
  }

  get isActive(): boolean {
    return this.state !== 'idle' && this.state !== 'parked';
  }

  getTargetSpot(): ParkingSpot | null { return this.targetSpot; }
  getSpots(): ParkingSpot[] { return this.spots; }

  consumeSnapY(): number | null {
    const v = this.pendingSnapY;
    this.pendingSnapY = null;
    return v;
  }

  startAtSpot(spot: ParkingSpot, carX: number, carY: number, onParked?: () => void): void {
    this.targetSpot  = spot;
    this.onParked    = onParked ?? null;
    this.laneX       = spot.pathX;
    this.targetPathY = spot.pathY + SPOT_Y_OFFSET;
    this.pendingSnapY = null;
    this.resetPhaseTracking();
    this.lastCarX     = NaN;
    this.stoppedFrames = 0;
    this.state = 'align-lane-x';
    console.log(
      `[CarAutoPark] → "${spot.name}"  laneX=${spot.pathX.toFixed(0)}` +
      `  targetY=${this.targetPathY.toFixed(0)}  carPos=(${carX.toFixed(0)},${carY.toFixed(0)})`,
    );
  }

  cancel(): void {
    this.state = 'idle';
    this.targetSpot = null;
    this.onParked = null;
    this.pendingSnapY = null;
  }

  /**
   * Returns synthetic CharacterKeys this frame, or null for manual control.
   *
   * Phases:
   *  1. align-lane-x    — drive to spot.pathX (the column approach lane x).
   *                       Stuck → jog vertically toward targetPathY.
   *  2. drive-to-path-y — drive up/down the lane to targetPathY.
   *                       Stuck → jog horizontally back to laneX.
   *  3. enter-spot      — drive left or right until the boundary stops the car
   *                       (carX unchanged for STOPPED_FRAMES frames).
   */
  tick(carX: number, carY: number): CharacterKeys | null {
    if (this.state === 'idle' || this.state === 'parked') return null;

    // ── Jog in progress ──────────────────────────────────────────────────
    if (this.jogFrames > 0) {
      this.jogFrames--;
      if (this.jogFrames === 0) {
        this.stuckFrames = 0;
        this.lastCheckVal = NaN;
      }
      return this.jogKeys;
    }

    // ── align-lane-x ─────────────────────────────────────────────────────
    if (this.state === 'align-lane-x') {
      const dx = this.laneX - carX;
      if (Math.abs(dx) <= ARRIVE_TOL) {
        this.state = 'drive-to-path-y';
        this.resetPhaseTracking();
        return NONE;
      }

      if (this.detectStuck(carX)) {
        this.jogCount++;
        if (this.jogCount > MAX_JOGS) {
          console.log('[CarAutoPark] align-lane-x: max jogs, skipping to drive-to-path-y');
          this.state = 'drive-to-path-y';
          this.resetPhaseTracking();
          return NONE;
        }
        const dy = this.targetPathY - carY;
        this.jogKeys  = dy > 0 ? { ...NONE, down: true } : { ...NONE, up: true };
        this.jogFrames = JOG_FRAMES;
        console.log(`[CarAutoPark] align-lane-x stuck → jog ${dy > 0 ? '↓' : '↑'} (#${this.jogCount})`);
      }

      return dx > 0 ? { ...NONE, right: true } : { ...NONE, left: true };
    }

    // ── drive-to-path-y ───────────────────────────────────────────────────
    if (this.state === 'drive-to-path-y') {
      const dy = this.targetPathY - carY;
      if (Math.abs(dy) <= ARRIVE_TOL) {
        this.pendingSnapY = this.targetPathY;
        this.state = 'enter-spot';
        this.lastCarX = NaN;
        this.stoppedFrames = 0;
        return NONE;
      }

      if (this.detectStuck(carY)) {
        this.jogCount++;
        if (this.jogCount > MAX_JOGS) {
          console.log('[CarAutoPark] drive-to-path-y: max jogs, cancelling');
          this.cancel();
          return NONE;
        }
        const ddx = this.laneX - carX;
        this.jogKeys  = ddx > 0 ? { ...NONE, right: true } : { ...NONE, left: true };
        this.jogFrames = JOG_FRAMES;
        console.log(`[CarAutoPark] drive-to-path-y stuck → jog ${ddx > 0 ? '→' : '←'} (#${this.jogCount})`);
      }

      return dy > 0 ? { ...NONE, down: true } : { ...NONE, up: true };
    }

    // ── enter-spot ────────────────────────────────────────────────────────
    if (this.state === 'enter-spot') {
      const spot = this.targetSpot!;
      const goLeft = spot.x < this.laneX;
      const keys   = goLeft ? { ...NONE, left: true } : { ...NONE, right: true };

      if (!isNaN(this.lastCarX) && carX === this.lastCarX) {
        this.stoppedFrames++;
      } else {
        this.stoppedFrames = 0;
      }
      this.lastCarX = carX;

      if (this.stoppedFrames >= STOPPED_FRAMES) {
        this.state = 'parked';
        this.onParked?.();
        return NONE;
      }
      return keys;
    }

    return NONE;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private detectStuck(val: number): boolean {
    if (!isNaN(this.lastCheckVal) && val === this.lastCheckVal) {
      this.stuckFrames++;
    } else {
      this.stuckFrames = 0;
    }
    this.lastCheckVal = val;
    return this.stuckFrames >= STUCK_FRAMES;
  }

  private resetPhaseTracking(): void {
    this.lastCheckVal = NaN;
    this.stuckFrames  = 0;
    this.jogFrames    = 0;
    this.jogKeys      = NONE;
    this.jogCount     = 0;
  }
}
