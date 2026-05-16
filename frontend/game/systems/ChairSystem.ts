import { findObjectGroupInJSON, type TiledMapJsonRoot } from './CollisionSystem';

export type FacingDir = 'right' | 'left' | 'front' | 'back';

export interface SitPoint {
  id:       number;
  name:     string;
  position: { x: number; y: number };
  facing:   FacingDir;
}

export interface Chair {
  id:        number;
  name:      string;
  zone:      string;
  owner:     string | null;
  occupiedBy: string | null;
  center:    { x: number; y: number };
  sitPoints: SitPoint[];
  /** World-space polygon outline, sourced from the Tiled Chairs objectgroup. Null if not found. */
  polygon:   { x: number; y: number }[] | null;
}

// Shape of the raw office-objects.json
interface RawEntity {
  id:         number;
  name:       string;
  entityType: string;
  owner?:     string | null;
  center:     { x: number; y: number };
  sitPoints?: { id: number; name: string; position: { x: number; y: number }; facing: string }[];
}
interface RawZone   { entities: RawEntity[] }
interface RawJSON   { zones: Record<string, RawZone> }

/**
 * Builds a map from chair object id → world-space polygon vertices,
 * sourced from the "Chairs" objectgroup in the raw Tiled JSON.
 */
export function parseChairPolygons(
  tiledJSON: TiledMapJsonRoot
): Map<number, { x: number; y: number }[]> {
  const result = new Map<number, { x: number; y: number }[]>();
  const group = findObjectGroupInJSON(tiledJSON.layers, 'Chairs');
  if (!group?.objects) return result;
  for (const obj of group.objects) {
    if (!obj.polygon || obj.id === undefined) continue;
    result.set(obj.id, obj.polygon.map(v => ({ x: obj.x + v.x, y: obj.y + v.y })));
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Extracts all chair entities that have at least one sit point. */
export function parseChairs(json: RawJSON): Chair[] {
  const chairs: Chair[] = [];
  for (const [zoneName, zone] of Object.entries(json.zones)) {
    for (const entity of zone.entities) {
      if (entity.entityType !== 'chair') continue;
      if (!entity.sitPoints || entity.sitPoints.length === 0) continue;
      chairs.push({
        id:      entity.id,
        name:    entity.name,
        zone:    zoneName,
        owner:   entity.owner ?? null,
        occupiedBy: null,
        center:  entity.center,
        polygon: null, // merged in MainMap after parseChairPolygons()
        sitPoints: entity.sitPoints.map(sp => ({
          id:       sp.id,
          name:     sp.name,
          position: sp.position,
          facing:   sp.facing as FacingDir,
        })),
      });
    }
  }
  return chairs;
}

export function findOwnedChair(
  chairs: Chair[],
  owner: string,
  chairName: string
): Chair | null {
  return chairs.find((chair) => chair.name === chairName && chair.owner === owner) ?? null;
}

/** Returns the closest chair whose center is within `radius` pixels, or null. */
export function nearestChairInRange(
  chairs: Chair[],
  px: number,
  py: number,
  radius: number,
  includeOccupied = true
): Chair | null {
  let best: Chair | null = null;
  let bestDist = radius * radius; // compare squared distances — avoids sqrt
  for (const chair of chairs) {
    if (!includeOccupied && chair.occupiedBy) continue;
    const dx = chair.center.x - px;
    const dy = chair.center.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      best     = chair;
    }
  }
  return best;
}

export function setChairOccupancy(
  chairs: Chair[],
  chairId: number,
  occupiedBy: string | null
): void {
  const chair = chairs.find((candidate) => candidate.id === chairId);
  if (!chair) return;
  chair.occupiedBy = occupiedBy;
}

/** Returns the sit point from a chair that is closest to (px, py). */
export function nearestSitPoint(chair: Chair, px: number, py: number): SitPoint {
  let best = chair.sitPoints[0];
  let bestD2 = Infinity;
  for (const sp of chair.sitPoints) {
    const dx = sp.position.x - px;
    const dy = sp.position.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = sp; }
  }
  return best;
}
