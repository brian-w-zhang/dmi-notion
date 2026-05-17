import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TILEMAP_PATH = path.resolve(__dirname, "../../../frontend/public/assets/tilemap/dunder-mifflin-tilemap.json")
const OFFICE_OBJECTS_PATH = path.resolve(__dirname, "../../../frontend/public/assets/world/office-objects.json")

const TILE_SIZE = 32
const GRID_COLS = 90
const GRID_ROWS = 48

// ── Polygon types and helpers ─────────────────────────────────────────────────

interface Polygon { vertices: { x: number; y: number }[] }
interface TiledObj { id?: number; name?: string; x: number; y: number; polygon?: { x: number; y: number }[]; properties?: { name: string; value: unknown }[] }
interface TiledLayer { type: string; name: string; layers?: TiledLayer[]; objects?: TiledObj[] }
interface TiledMapJson { layers: TiledLayer[] }

function isPointInPolygon(px: number, py: number, poly: Polygon): boolean {
  const v = poly.vertices
  let inside = false
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const xi = v[i].x, yi = v[i].y, xj = v[j].x, yj = v[j].y
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function isInAny(px: number, py: number, polys: Polygon[]): boolean {
  return polys.some(p => isPointInPolygon(px, py, p))
}

function findGroup(layers: TiledLayer[], name: string): TiledLayer | null {
  for (const l of layers) {
    if (l.type === "objectgroup" && l.name === name) return l
    if (l.layers) { const f = findGroup(l.layers, name); if (f) return f }
  }
  return null
}

function parsePolygons(tiledJSON: TiledMapJson, layerName: string): Polygon[] {
  const g = findGroup(tiledJSON.layers, layerName)
  if (!g) { console.warn(`[ServerPathfinder] layer "${layerName}" not found`); return [] }
  return (g.objects ?? []).flatMap(obj =>
    obj.polygon ? [{ vertices: obj.polygon.map(v => ({ x: obj.x + v.x, y: obj.y + v.y })) }] : []
  )
}

// ── A* pathfinding grid ───────────────────────────────────────────────────────

class PathfindingGrid {
  private readonly grid: Uint8Array

  constructor(walkableZones: Polygon[], colliders: Polygon[]) {
    this.grid = new Uint8Array(GRID_COLS * GRID_ROWS)
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const px = col * TILE_SIZE + TILE_SIZE / 2
        const py = row * TILE_SIZE + TILE_SIZE / 2
        if (!isInAny(px, py, walkableZones) || isInAny(px, py, colliders)) {
          this.grid[row * GRID_COLS + col] = 1
        }
      }
    }
  }

  isWalkable(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return false
    return this.grid[row * GRID_COLS + col] === 0
  }

  // A* from tile (fromCol,fromRow) to tile (toCol,toRow).
  // Returns intermediate + destination tiles (excludes start tile).
  findTilePath(from: [number, number], to: [number, number]): [number, number][] {
    const [fc, fr] = from
    const [tc, tr] = to
    if (fc === tc && fr === tr) return []

    // Resolve blocked goal to nearest walkable neighbor
    let gc = tc, gr = tr
    if (!this.isWalkable(gc, gr)) {
      const nearest = this._nearest(tc, tr)
      if (!nearest) return []
      ;[gc, gr] = nearest
    }

    return this._astar(fc, fr, gc, gr)
  }

  private _astar(sc: number, sr: number, gc: number, gr: number): [number, number][] {
    const SZ = GRID_COLS * GRID_ROWS
    const gs = new Float32Array(SZ).fill(Infinity)
    const fs = new Float32Array(SZ).fill(Infinity)
    const cf = new Int32Array(SZ).fill(-1)
    const cl = new Uint8Array(SZ)

    const sk = sr * GRID_COLS + sc
    const gk = gr * GRID_COLS + gc
    gs[sk] = 0
    fs[sk] = Math.abs(sc - gc) + Math.abs(sr - gr)
    const open = [sk]

    while (open.length > 0) {
      const cur = hPop(open, fs)
      if (cur === gk) {
        const path: [number, number][] = []
        let n = cur
        while (n !== sk) {
          path.push([n % GRID_COLS, Math.floor(n / GRID_COLS)])
          n = cf[n]
        }
        return path.reverse()
      }
      if (cl[cur]) continue
      cl[cur] = 1
      const cr = Math.floor(cur / GRID_COLS), cc = cur % GRID_COLS
      for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nc = cc + dc, nr = cr + dr
        if (!this.isWalkable(nc, nr)) continue
        const nk = nr * GRID_COLS + nc
        if (cl[nk]) continue
        const t = gs[cur] + 1
        if (t < gs[nk]) {
          cf[nk] = cur; gs[nk] = t
          fs[nk] = t + Math.abs(nc - gc) + Math.abs(nr - gr)
          hPush(open, nk, fs)
        }
      }
    }

    return []
  }

  private _nearest(col: number, row: number): [number, number] | null {
    const vis = new Uint8Array(GRID_COLS * GRID_ROWS)
    const q: [number, number][] = [[col, row]]
    vis[row * GRID_COLS + col] = 1
    while (q.length > 0) {
      const [c, r] = q.shift()!
      for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nc = c + dc, nr = r + dr
        if (nc < 0 || nr < 0 || nc >= GRID_COLS || nr >= GRID_ROWS) continue
        const k = nr * GRID_COLS + nc
        if (vis[k]) continue
        vis[k] = 1
        if (this.isWalkable(nc, nr)) return [nc, nr]
        q.push([nc, nr])
      }
    }
    return null
  }
}

function hPush(h: number[], v: number, s: Float32Array): void {
  h.push(v); let i = h.length - 1
  while (i > 0) { const p = (i - 1) >> 1; if (s[h[p]] <= s[h[i]]) break; [h[i], h[p]] = [h[p], h[i]]; i = p }
}

function hPop(h: number[], s: Float32Array): number {
  const top = h[0], last = h.pop()!
  if (h.length > 0) {
    h[0] = last; let i = 0
    while (true) {
      const l = 2 * i + 1, r = 2 * i + 2; let m = i
      if (l < h.length && s[h[l]] < s[h[m]]) m = l
      if (r < h.length && s[h[r]] < s[h[m]]) m = r
      if (m === i) break
      ;[h[i], h[m]] = [h[m], h[i]]; i = m
    }
  }
  return top
}

// ── Singleton initialization ──────────────────────────────────────────────────

let _grid: PathfindingGrid | null = null

function getGrid(): PathfindingGrid {
  if (_grid) return _grid

  const tiledJSON: TiledMapJson = JSON.parse(fs.readFileSync(TILEMAP_PATH, "utf-8"))
  const officeObjectsJSON = JSON.parse(fs.readFileSync(OFFICE_OBJECTS_PATH, "utf-8"))

  const officeWalkable   = parsePolygons(tiledJSON, "Office Walkable Area")
  const exteriorWalkable = parsePolygons(tiledJSON, "Exterior Walkable Area")
  const colliders        = parsePolygons(tiledJSON, "Colliders")

  // Add owned chair polygons as colliders (mirrors mainMapSetup.ts)
  const ownedChairIds = new Set<number>()
  for (const zone of Object.values(officeObjectsJSON.zones as Record<string, { entities: any[] }>)) {
    for (const e of zone.entities ?? []) {
      if (e.entityType === "chair" && e.owner) ownedChairIds.add(e.id)
    }
  }
  const chairGroup = findGroup(tiledJSON.layers, "Chairs")
  for (const obj of chairGroup?.objects ?? []) {
    if (obj.id !== undefined && obj.polygon && ownedChairIds.has(obj.id)) {
      colliders.push({ vertices: obj.polygon.map(v => ({ x: obj.x + v.x, y: obj.y + v.y })) })
    }
  }

  console.log(`[ServerPathfinder] building grid — office:${officeWalkable.length} exterior:${exteriorWalkable.length} colliders:${colliders.length}`)
  _grid = new PathfindingGrid([...officeWalkable, ...exteriorWalkable], colliders)
  console.log("[ServerPathfinder] grid ready")
  return _grid
}

// ── Public API ────────────────────────────────────────────────────────────────

export function findTilePath(from: [number, number], to: [number, number]): [number, number][] {
  return getGrid().findTilePath(from, to)
}
