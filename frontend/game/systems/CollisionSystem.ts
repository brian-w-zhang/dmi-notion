export interface Polygon {
  vertices: { x: number; y: number }[];
}

export interface NamedPolygon {
  name: string;
  polygon: Polygon;
}

/**
 * Ray-casting point-in-polygon.
 * Returns true if (px, py) is strictly inside the polygon.
 */
export function isPointInPolygon(px: number, py: number, polygon: Polygon): boolean {
  const verts = polygon.vertices;
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export function isPointInAnyPolygon(px: number, py: number, polygons: Polygon[]): boolean {
  return polygons.some(p => isPointInPolygon(px, py, p));
}

// ── Raw Tiled JSON parsing ────────────────────────────────────────────────────
// Phaser's map.getObjectLayer() only searches layers that were lifted into
// map.objects, which doesn't include objectgroups nested inside group layers.
// We search the raw JSON recursively instead.

/** Subset of raw Tiled JSON used by object-layer parsers (Phaser cache data). */
export interface TiledLayer {
  type:    string;
  name:    string;
  layers?: TiledLayer[];
  objects?: {
    id?:    number;
    name?:  string;
    x:      number;
    y:      number;
    polygon?: { x: number; y: number }[];
  }[];
}

/** Root of a Tiled map JSON object (`cache.tilemap.get(key).data`). */
export type TiledMapJsonRoot = { layers: TiledLayer[] };

export function findObjectGroupInJSON(layers: TiledLayer[], name: string): TiledLayer | null {
  for (const layer of layers) {
    if (layer.type === 'objectgroup' && layer.name === name) return layer;
    if (layer.layers) {
      const found = findObjectGroupInJSON(layer.layers, name);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Parses all polygon objects from a named Tiled objectgroup (at any nesting
 * depth), converting per-object-relative vertices to world coordinates.
 * Pass the raw Tiled JSON (map.tilesets[0] won't work — use cache.tilemap.get).
 */
export function parseObjectLayerPolygons(
  tiledJSON: TiledMapJsonRoot,
  layerName: string
): Polygon[] {
  const group = findObjectGroupInJSON(tiledJSON.layers, layerName);
  if (!group) {
    console.warn(`[CollisionSystem] Object layer "${layerName}" not found in JSON`);
    return [];
  }

  const polygons: Polygon[] = [];
  for (const obj of group.objects ?? []) {
    if (!obj.polygon) continue;
    polygons.push({
      vertices: obj.polygon.map(v => ({
        x: obj.x + v.x,
        y: obj.y + v.y,
      })),
    });
  }
  return polygons;
}

/**
 * Parses all named polygon objects from a named Tiled objectgroup, returning
 * world-space polygons paired with each object's name.
 */
export function parseNamedObjectLayerPolygons(
  tiledJSON: TiledMapJsonRoot,
  layerName: string
): NamedPolygon[] {
  const group = findObjectGroupInJSON(tiledJSON.layers, layerName);
  if (!group) {
    console.warn(`[CollisionSystem] Object layer "${layerName}" not found in JSON`);
    return [];
  }

  const polygons: NamedPolygon[] = [];
  for (const obj of group.objects ?? []) {
    if (!obj.polygon || !obj.name) continue;
    polygons.push({
      name: obj.name,
      polygon: {
        vertices: obj.polygon.map((v) => ({
          x: obj.x + v.x,
          y: obj.y + v.y,
        })),
      },
    });
  }
  return polygons;
}

/**
 * Searches all objectgroups at any nesting depth for a point object with the
 * given name and returns its world position. Returns null if not found.
 */
export function parseNamedPoint(
  tiledJSON: TiledMapJsonRoot,
  name: string
): { x: number; y: number } | null {
  return searchNamedPoint(tiledJSON.layers, name);
}

function searchNamedPoint(layers: TiledLayer[], name: string): { x: number; y: number } | null {
  for (const layer of layers) {
    if (layer.type === 'objectgroup') {
      for (const obj of layer.objects ?? []) {
        if (obj.name === name) return { x: obj.x, y: obj.y };
      }
    }
    if (layer.layers) {
      const found = searchNamedPoint(layer.layers, name);
      if (found) return found;
    }
  }
  return null;
}

/** Average of all vertices — good enough for a spawn-point fallback. */
export function polygonCentroid(polygon: Polygon): { x: number; y: number } {
  const n = polygon.vertices.length;
  if (n === 0) return { x: 0, y: 0 };
  const sum = polygon.vertices.reduce(
    (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / n, y: sum.y / n };
}
