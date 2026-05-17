// Run with: npx tsx src/scripts/generateDummyReplay.ts
// Outputs:  frontend/public/assets/simulation/replay.json
//
// Three-character sequential commute demo:
//   Dwight (ps1, car-3-1) → parks → walks in → sits → gets coffee
//   Jim    (ps3, car-4-2) → parks → walks in → sits
//   Michael(ps2, car-4-1) → parks → walks in → sits at office desk

import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { resolve, dirname }                        from 'path'
import { fileURLToPath }                           from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Timing ────────────────────────────────────────────────────────────────────

const MS_PER_STEP    = 80
const PLAYBACK_SPEED = 1.5
const CAR_SPEED      = 7
const CHAR_SPEED     = 3
const FPS            = 60

const CAR_PX_STEP  = Math.round(CAR_SPEED  * FPS * MS_PER_STEP / 1000)   // 34
const CHAR_PX_STEP = Math.round(CHAR_SPEED * FPS * MS_PER_STEP / 1000)   // 14
const PLAYBACK_MS  = Math.round(MS_PER_STEP / PLAYBACK_SPEED)             // 53

// ── CarAutoParkSystem constants ───────────────────────────────────────────────

const ARRIVE_TOL    = 14
const SPOT_Y_OFFSET = -10
const CAR_DOOR_EDGE = 88    // = halfShort (48) + gap (40)
const CAR_SW        = 32    // sprite width offset for left-facing door dismount

// ── Tilemap grid ──────────────────────────────────────────────────────────────

const TILE_SIZE = 32
const GRID_COLS = 90
const GRID_ROWS = 48

// ── Types ─────────────────────────────────────────────────────────────────────

type Facing   = 'front' | 'back' | 'left' | 'right'
type CarAnim  = 'drive' | 'idle'
type CharAnim = 'walk'  | 'idle' | 'sit'

interface CarState  { x: number; y: number; facing: Facing; anim: CarAnim;  visible: boolean }
interface CharState { x: number; y: number; facing: Facing; anim: CharAnim; visible: boolean; seated?: boolean }
interface SfxEvent  { key?: string; volume?: number; rate?: number; detune?: number; loop?: boolean; stopLoop?: string }

interface FullStep {
  step:        number
  cars:        Record<string, CarState>
  chars:       Record<string, CharState>
  follow:      string        // e.g. "dwight_car" | "dwight" | "jim_car" | "jim" | "michael_car"
  emoji:       string
  desc:        string
  transition?: 'enter_building'
  sfx?:        SfxEvent[]
}

interface ReplayMeta {
  ms_per_step:  number
  char_px_step: number
  characters:   string[]
  car_textures: Record<string, string>   // character key → texture key
}

// ── Tilemap helpers (Phaser-free port) ───────────────────────────────────────

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
function isInAny(px: number, py: number, polys: Polygon[]) { return polys.some(p => isPointInPolygon(px, py, p)) }
function findGroup(layers: TiledLayer[], name: string): TiledLayer | null {
  for (const l of layers) {
    if (l.type === 'objectgroup' && l.name === name) return l
    if (l.layers) { const f = findGroup(l.layers, name); if (f) return f }
  }
  return null
}
function parsePolygons(tiledJSON: TiledMapJson, layerName: string): Polygon[] {
  const g = findGroup(tiledJSON.layers, layerName)
  if (!g) { console.warn(`  ⚠ "${layerName}" not found`); return [] }
  return (g.objects ?? []).flatMap(obj =>
    obj.polygon ? [{ vertices: obj.polygon.map(v => ({ x: obj.x + v.x, y: obj.y + v.y })) }] : []
  )
}
function findPt(layers: TiledLayer[], name: string): { x: number; y: number } | null {
  for (const l of layers) {
    if (l.type === 'objectgroup') for (const obj of l.objects ?? []) if (obj.name === name) return { x: obj.x, y: obj.y }
    if (l.layers) { const f = findPt(l.layers, name); if (f) return f }
  }
  return null
}

// ── PathfindingSystem ─────────────────────────────────────────────────────────

class PathfindingSystem {
  private readonly grid: Uint8Array
  constructor(walkableZones: Polygon[], colliders: Polygon[]) {
    this.grid = new Uint8Array(GRID_COLS * GRID_ROWS)
    for (let row = 0; row < GRID_ROWS; row++)
      for (let col = 0; col < GRID_COLS; col++) {
        const px = col * TILE_SIZE + TILE_SIZE / 2, py = row * TILE_SIZE + TILE_SIZE / 2
        if (!isInAny(px, py, walkableZones) || isInAny(px, py, colliders)) this.grid[row * GRID_COLS + col] = 1
      }
  }
  isWalkable(col: number, row: number) {
    if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return false
    return this.grid[row * GRID_COLS + col] === 0
  }
  px2t(px: number, py: number) {
    return { col: Math.max(0, Math.min(GRID_COLS - 1, Math.floor(px / TILE_SIZE))), row: Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(py / TILE_SIZE))) }
  }
  tc(col: number, row: number) { return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 } }
  findPath(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number }[] {
    const s = this.px2t(a.x, a.y), g = this.px2t(b.x, b.y)
    if (s.col === g.col && s.row === g.row) return []
    const goal = this.isWalkable(g.col, g.row) ? g : (this._nearest(g) ?? s)
    return this._astar(s, goal)
  }
  private _astar(s: { col: number; row: number }, g: { col: number; row: number }): { x: number; y: number }[] {
    const SZ = GRID_COLS * GRID_ROWS
    const gs = new Float32Array(SZ).fill(Infinity), fs = new Float32Array(SZ).fill(Infinity)
    const cf = new Int32Array(SZ).fill(-1), cl = new Uint8Array(SZ)
    const sk = s.row * GRID_COLS + s.col, gk = g.row * GRID_COLS + g.col
    gs[sk] = 0; fs[sk] = Math.abs(s.col - g.col) + Math.abs(s.row - g.row)
    const open = [sk]
    while (open.length) {
      const cur = hPop(open, fs)
      if (cur === gk) {
        const path: { x: number; y: number }[] = []
        let n = cur
        while (n !== sk) { const r = Math.floor(n / GRID_COLS), c = n % GRID_COLS; path.push(this.tc(c, r)); n = cf[n] }
        return path.reverse()
      }
      if (cl[cur]) continue; cl[cur] = 1
      const cr = Math.floor(cur / GRID_COLS), cc = cur % GRID_COLS
      for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nc = cc + dc, nr = cr + dr
        if (!this.isWalkable(nc, nr)) continue
        const nk = nr * GRID_COLS + nc
        if (cl[nk]) continue
        const t = gs[cur] + 1
        if (t < gs[nk]) { cf[nk] = cur; gs[nk] = t; fs[nk] = t + Math.abs(nc - g.col) + Math.abs(nr - g.row); hPush(open, nk, fs) }
      }
    }
    return []
  }
  private _nearest(b: { col: number; row: number }): { col: number; row: number } | null {
    const vis = new Uint8Array(GRID_COLS * GRID_ROWS), q = [b]
    vis[b.row * GRID_COLS + b.col] = 1
    while (q.length) {
      const { col, row } = q.shift()!
      for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nc = col + dc, nr = row + dr
        if (nc < 0 || nr < 0 || nc >= GRID_COLS || nr >= GRID_ROWS) continue
        const k = nr * GRID_COLS + nc; if (vis[k]) continue; vis[k] = 1
        if (this.isWalkable(nc, nr)) return { col: nc, row: nr }
        q.push({ col: nc, row: nr })
      }
    }
    return null
  }
}
function hPush(h: number[], v: number, s: Float32Array) {
  h.push(v); let i = h.length - 1
  while (i > 0) { const p = (i - 1) >> 1; if (s[h[p]] <= s[h[i]]) break; [h[i], h[p]] = [h[p], h[i]]; i = p }
}
function hPop(h: number[], s: Float32Array) {
  const top = h[0], last = h.pop()!
  if (h.length) { h[0] = last; let i = 0; while (true) { const l = 2*i+1, r = 2*i+2; let m = i; if (l < h.length && s[h[l]] < s[h[m]]) m = l; if (r < h.length && s[h[r]] < s[h[m]]) m = r; if (m === i) break; [h[i], h[m]] = [h[m], h[i]]; i = m } }
  return top
}

// ── Parking spot parser ───────────────────────────────────────────────────────

interface ParkingSpot { name: string; x: number; y: number; pathX: number; pathY: number }

function parseParkingSpots(tiledJSON: TiledMapJson): ParkingSpot[] {
  const pathPts = new Map<string, { x: number; y: number }>()
  const apGroup = findGroup(tiledJSON.layers, 'Action Points')
  for (const obj of apGroup?.objects ?? []) {
    const n = obj.name ?? ''
    if (n.endsWith('_path') && !pathPts.has(n)) pathPts.set(n, { x: obj.x, y: obj.y })
  }
  const group = findGroup(tiledJSON.layers, 'Parking Spots')
  if (!group) return []
  return (group.objects ?? []).map(obj => {
    const name = obj.name ?? ''
    const handicap = (obj.properties ?? []).some(p => p.name === 'handicap' && p.value === true)
    const verts = (obj.polygon ?? []).map(v => ({ x: obj.x + v.x, y: obj.y + v.y }))
    const cx = verts.length ? verts.reduce((s, v) => s + v.x, 0) / verts.length : obj.x
    const cy = verts.length ? verts.reduce((s, v) => s + v.y, 0) / verts.length : obj.y
    const pathKey = handicap ? 'handicap_path' : `${name}_path`
    const pp = pathPts.get(pathKey)
    return { name, x: cx, y: cy, pathX: pp?.x ?? 360, pathY: pp?.y ?? cy }
  })
}

// ── Car parking simulation ────────────────────────────────────────────────────

interface CarFrame { x: number; y: number; facing: Facing; anim: CarAnim; desc: string }

function simulateParking(
  spawn: { x: number; y: number },
  spot: ParkingSpot,
  walkableZones: Polygon[],
  halfLong: number,
): CarFrame[] {
  const frames: CarFrame[] = []
  let x = spawn.x, y = spawn.y
  const laneX = spot.pathX, targetY = Math.round(spot.pathY + SPOT_Y_OFFSET)

  while (Math.abs(x - laneX) > ARRIVE_TOL) {
    const dx = laneX - x; x = Math.round(x + Math.sign(dx) * Math.min(CAR_PX_STEP, Math.abs(dx)))
    frames.push({ x, y: Math.round(y), facing: dx < 0 ? 'left' : 'right', anim: 'drive', desc: 'Driving to work' })
  }
  while (Math.abs(y - targetY) > ARRIVE_TOL) {
    const dy = targetY - y; y = Math.round(y + Math.sign(dy) * Math.min(CAR_PX_STEP, Math.abs(dy)))
    frames.push({ x: Math.round(x), y, facing: dy < 0 ? 'back' : 'front', anim: 'drive', desc: 'Turning into lane' })
  }
  y = targetY

  const goLeft = spot.x < laneX
  let lastX = x, stopped = 0
  for (let g = 0; g < 1000; g++) {
    const nx = x + (goLeft ? -7 : 7)
    const edgeX = nx + (goLeft ? -halfLong : halfLong)
    if (!isInAny(edgeX, y, walkableZones)) break
    x = Math.round(nx)
    if (x === lastX) { if (++stopped >= 3) break } else stopped = 0
    lastX = x
    frames.push({ x, y, facing: goLeft ? 'left' : 'right', anim: 'drive', desc: 'Pulling into spot' })
  }
  frames.push({ x, y, facing: 'left', anim: 'idle', desc: 'Parked' })
  return frames
}

// ── Path walk helpers ─────────────────────────────────────────────────────────

function facing(dx: number, dy: number): Facing {
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'front' : 'back')
}

// ── Scene builder ─────────────────────────────────────────────────────────────

const CAR_SPAWN = { x: 2714, y: 1442 }   // off-screen right, same Y as parking lane

const steps: FullStep[] = []
let stepNum = 0

// Mutable per-character car & char states — mutated by sequence functions
const cars: Record<string, CarState>  = {}
const chars: Record<string, CharState> = {}

let currentFollow = 'dwight_car'

function snapshot(emoji: string, desc: string, opts: { transition?: 'enter_building' } = {}): void {
  steps.push({
    step: stepNum++,
    cars:  Object.fromEntries(Object.entries(cars).map(([k, v]) => [k, { ...v }])),
    chars: Object.fromEntries(Object.entries(chars).map(([k, v]) => [k, { ...v }])),
    follow: currentFollow,
    emoji, desc,
    ...opts,
  })
}

function idle(n: number, key: string, emoji: string, desc: string): void {
  for (let i = 0; i < n; i++) {
    if (key in cars) cars[key].anim = 'idle'
    snapshot(emoji, desc)
  }
}

function driveCar(key: string, frames: CarFrame[]): void {
  for (const f of frames) {
    cars[key] = { x: f.x, y: f.y, facing: f.facing, anim: f.anim, visible: true }
    snapshot(f.anim === 'idle' ? '🅿️' : '🚗', f.desc)
  }
}

function walkChar(key: string, toX: number, toY: number, emoji: string, desc: string, pathfinder?: PathfindingSystem): void {
  const c = chars[key]!
  const waypoints = pathfinder ? pathfinder.findPath({ x: c.x, y: c.y }, { x: toX, y: toY }) : [{ x: toX, y: toY }]
  let curX = c.x, curY = c.y
  for (const wp of waypoints) {
    const dx = wp.x - curX, dy = wp.y - curY
    const dist = Math.sqrt(dx*dx + dy*dy)
    if (dist < 0.5) { curX = wp.x; curY = wp.y; continue }
    const n = Math.max(1, Math.ceil(dist / CHAR_PX_STEP))
    const f = facing(dx, dy)
    for (let i = 1; i <= n; i++) {
      chars[key] = { ...chars[key], x: Math.round(curX + dx * i/n), y: Math.round(curY + dy * i/n), facing: f, anim: 'walk' }
      snapshot(emoji, desc)
    }
    curX = wp.x; curY = wp.y
  }
}

// ── Load assets ───────────────────────────────────────────────────────────────

const tilemapPath = resolve(__dirname, '../../../frontend/public/assets/tilemap/dunder-mifflin-tilemap.json')
const tiledJSON: TiledMapJson = JSON.parse(readFileSync(tilemapPath, 'utf-8'))

const exteriorWalkable = parsePolygons(tiledJSON, 'Exterior Walkable Area')
const officeWalkable   = parsePolygons(tiledJSON, 'Office Walkable Area')
const colliders        = parsePolygons(tiledJSON, 'Colliders')
console.log(`Zones — ext: ${exteriorWalkable.length}, office: ${officeWalkable.length}, colliders: ${colliders.length}`)

// Add owned-chair colliders (mirrors mainMapSetup.ts)
const officeObjectsPath = resolve(__dirname, '../../../frontend/public/assets/world/office-objects.json')
const officeObjectsJson = JSON.parse(readFileSync(officeObjectsPath, 'utf-8'))
const ownedChairIds = new Set<number>()
for (const zone of Object.values(officeObjectsJson.zones) as { entities: { id: number; entityType: string; owner: string | null }[] }[])
  for (const e of zone.entities) if (e.entityType === 'chair' && e.owner) ownedChairIds.add(e.id)
const chairGroup = findGroup(tiledJSON.layers, 'Chairs')
for (const obj of chairGroup?.objects ?? [])
  if (obj.id !== undefined && obj.polygon && ownedChairIds.has(obj.id))
    colliders.push({ vertices: obj.polygon.map(v => ({ x: obj.x + v.x, y: obj.y + v.y })) })

const pf = new PathfindingSystem([...officeWalkable, ...exteriorWalkable], colliders)

const pt = (name: string, fb: { x: number; y: number }) => {
  const p = findPt(tiledJSON.layers, name)
  if (!p) console.warn(`  ⚠ "${name}" not found — using fallback`)
  return p ? { x: Math.round(p.x), y: Math.round(p.y) } : fb
}

// Parse a Sit Point, reading the 'facing' property from the tilemap object
interface SitPoint { x: number; y: number; facing: Facing }
const sitPt = (name: string, fb: SitPoint): SitPoint => {
  const layer = findGroup(tiledJSON.layers, 'Sit Points')
  const obj   = layer?.objects?.find(o => o.name === name)
  if (!obj) { console.warn(`  ⚠ sit point "${name}" not found — using fallback`); return fb }
  const facing = ((obj.properties ?? []).find(p => p.name === 'facing')?.value as Facing) ?? fb.facing
  return { x: Math.round(obj.x), y: Math.round(obj.y), facing }
}

const GROUND_IN  = pt('ground_entrance_start',   { x: 818,  y: 1327 })
const GROUND_OUT = pt('ground_entrance_end',     { x: 819,  y: 1205 })
const ELEV_START = pt('elevator_entrance_start', { x: 608,  y: 447  })
const ELEV_END   = pt('elevator_entrance_end',   { x: 608,  y: 328  })

const DWIGHT_CHAIR  = sitPt('dwight_chair_seat',  { x: 1230, y: 749, facing: 'left'  })
const JIM_CHAIR     = sitPt('jim_chair_seat',     { x: 1136, y: 594, facing: 'front' })
const MICHAEL_CHAIR = sitPt('michael_chair_seat', { x: 1040, y: 212, facing: 'front' })
const KITCHEN_COFFEE = pt('kitchen_coffee_spot',  { x: 1936, y: 585  })

const spots    = parseParkingSpots(tiledJSON)
const getSpot  = (name: string, fb: ParkingSpot) => spots.find(s => s.name === name) ?? fb

const ps1 = getSpot('ps1', { name: 'ps1', x: 246,  y: 1200, pathX: 360, pathY: 1196 })
const ps2 = getSpot('ps2', { name: 'ps2', x: 246,  y: 1280, pathX: 360, pathY: 1276 })
const ps3 = getSpot('ps3', { name: 'ps3', x: 246,  y: 1360, pathX: 360, pathY: 1356 })

console.log(`ps1  (${ps1.x.toFixed(0)}, ${ps1.y.toFixed(0)})  ps2 (${ps2.x.toFixed(0)}, ${ps2.y.toFixed(0)})  ps3 (${ps3.x.toFixed(0)}, ${ps3.y.toFixed(0)})`)

// ── Per-character config ──────────────────────────────────────────────────────

interface CharConfig {
  key: string
  spriteKey: string
  carTexture: string
  carHalfLong: number
  spot: ParkingSpot
  chair: SitPoint
}

const CAST: CharConfig[] = [
  { key: 'dwight',  spriteKey: 'dwight-schrute',  carTexture: 'car-3-1', carHalfLong: 96, spot: ps1, chair: DWIGHT_CHAIR  },
  { key: 'jim',     spriteKey: 'jim-halpert',     carTexture: 'car-4-2', carHalfLong: 80, spot: ps3, chair: JIM_CHAIR     },
  { key: 'michael', spriteKey: 'michael-scott',   carTexture: 'car-4-1', carHalfLong: 80, spot: ps2, chair: MICHAEL_CHAIR },
]

// ── Initialize all states as invisible ───────────────────────────────────────

for (const c of CAST) {
  cars[c.key]  = { x: CAR_SPAWN.x, y: CAR_SPAWN.y, facing: 'left', anim: 'drive', visible: false }
  chars[c.key] = { x: CAR_SPAWN.x - CAR_SW, y: CAR_SPAWN.y + CAR_DOOR_EDGE, facing: 'front', anim: 'idle', visible: false }
}

// ── Commute sequence per character ────────────────────────────────────────────

function runCommute(cfg: CharConfig): void {
  const { key, spot, chair, carHalfLong } = cfg
  const parkedX = Math.round(spot.x)
  const parkedY = Math.round(spot.pathY + SPOT_Y_OFFSET)
  const dismountX = parkedX - CAR_SW
  const dismountY = parkedY + CAR_DOOR_EDGE

  // Make car visible, start driving in
  currentFollow = `${key}_car`
  cars[key].visible = true

  const parkFrames = simulateParking(CAR_SPAWN, spot, exteriorWalkable, carHalfLong)
  console.log(`  ${key}: ${parkFrames.length} parking frames`)
  driveCar(key, parkFrames)
  idle(2, key, '🅿️', 'Parked')

  // Dismount
  chars[key] = { x: dismountX, y: dismountY, facing: 'front', anim: 'idle', visible: true }
  currentFollow = key
  idle(3, key, '😤', 'Getting out of car')

  // Walk to building entrance
  const outdoorPath = pf.findPath({ x: dismountX, y: dismountY }, GROUND_IN)
  console.log(`  ${key}: outdoor path ${outdoorPath.length} waypoints`)
  walkChar(key, GROUND_IN.x, GROUND_IN.y, '🚶', 'Walking to building', pf)

  // Walk through ground entrance (direct, under occluding tiles)
  walkChar(key, GROUND_OUT.x, GROUND_OUT.y, '🏢', 'Entering building')

  // Teleport to elevator (hidden transition)
  chars[key] = { ...chars[key], x: ELEV_START.x, y: ELEV_START.y, facing: 'back', anim: 'idle' }
  snapshot('🛗', 'Taking elevator', { transition: 'enter_building' })

  // Ride elevator up
  walkChar(key, ELEV_END.x, ELEV_END.y, '🛗', 'Riding elevator')

  // Walk from elevator to desk
  const deskPath = pf.findPath(ELEV_END, chair)
  console.log(`  ${key}: desk path ${deskPath.length} waypoints`)
  walkChar(key, chair.x, chair.y, '🚶', 'Walking to desk', pf)

  // Snap to exact sit point and use tilemap-defined facing
  chars[key] = { ...chars[key], x: chair.x, y: chair.y, facing: chair.facing, anim: 'sit', seated: true }
  idle(4, key, '💻', 'Settling in at desk')
}

// ── Run all three commutes sequentially ───────────────────────────────────────

console.log('\n── Dwight commute ──────────────────────────────────────────────')
runCommute(CAST[0])

// Dwight extra action: walk to kitchen for coffee, then return
console.log('\n── Dwight → kitchen ────────────────────────────────────────────')
chars['dwight'] = { ...chars['dwight'], anim: 'idle', seated: false }
currentFollow = 'dwight'
walkChar('dwight', KITCHEN_COFFEE.x, KITCHEN_COFFEE.y, '☕', 'Getting coffee', pf)
chars['dwight'] = { ...chars['dwight'], facing: 'front', anim: 'idle' }
idle(5, 'dwight', '☕', 'Making coffee')
walkChar('dwight', DWIGHT_CHAIR.x, DWIGHT_CHAIR.y, '🚶', 'Back to desk', pf)
chars['dwight'] = { ...chars['dwight'], x: DWIGHT_CHAIR.x, y: DWIGHT_CHAIR.y, facing: DWIGHT_CHAIR.facing, anim: 'sit', seated: true }
idle(3, 'dwight', '💻', 'Back at desk')

console.log('\n── Jim commute ─────────────────────────────────────────────────')
runCommute(CAST[1])

console.log('\n── Michael commute ─────────────────────────────────────────────')
runCommute(CAST[2])
chars['michael'] = { ...chars['michael'], anim: 'idle', seated: false }
idle(3, 'michael', '🧑‍💼', 'World\'s Best Boss moment')

// ── Bake SFX ──────────────────────────────────────────────────────────────────

const FOOTSTEP_KEYS  = ['Cloth_dig1.ogg', 'Cloth_dig2.ogg', 'Cloth_dig3.ogg', 'Cloth_dig4.ogg']
const FOOTSTEP_EVERY = Math.round(400 / PLAYBACK_MS)
const VOL = (v: number) => parseFloat((v * 0.3).toFixed(3))

const carLoopActive = new Set<string>()
const footCounters: Record<string, number> = {}

for (let i = 0; i < steps.length; i++) {
  const s    = steps[i]
  const prev = i > 0 ? steps[i - 1] : null
  const sfx: SfxEvent[] = []

  // SFX only for Dwight — one car engine loop, one footstep track, no SFX chaos
  {
    const key     = 'dwight'
    const car     = s.cars[key]
    const ch      = s.chars[key], prevChar = prev?.chars[key]

    // Start car driving loop
    if (!carLoopActive.has(key) && car?.anim === 'drive' && car.visible) {
      sfx.push({ key: 'car_driving', loop: true, volume: VOL(3) })
      carLoopActive.add(key)
    }
    // Stop car driving loop on dismount
    if (ch?.visible && !prevChar?.visible) {
      sfx.push({ stopLoop: 'car_driving' })
      sfx.push({ key: 'open_car_door', volume: VOL(1) })
      carLoopActive.delete(key)
    }
    // Footsteps
    if (ch?.visible && ch.anim === 'walk') {
      footCounters[key] = (footCounters[key] ?? 0) + 1
      if (footCounters[key] % FOOTSTEP_EVERY === 1) {
        sfx.push({
          key:    FOOTSTEP_KEYS[Math.floor(Math.random() * FOOTSTEP_KEYS.length)],
          volume: VOL(0.2 + Math.random() * 0.2),
          rate:   parseFloat((0.85 + Math.random() * 0.3).toFixed(3)),
          detune: Math.round(Math.random() * 400 - 200),
        })
      }
    } else {
      footCounters[key] = 0
    }
    // Door sound
    if (ch?.x === GROUND_OUT.x && ch?.y === GROUND_OUT.y && prevChar?.y !== GROUND_OUT.y) {
      sfx.push({ key: 'entrance_door', volume: VOL(0.4) })
    }
    // Sit sound
    if (ch?.seated && !prevChar?.seated) {
      sfx.push({ key: 'Cloth_dig1.ogg', volume: VOL(0.35), detune: Math.round(Math.random() * 200 - 100) })
    }
  }

  if (sfx.length) s.sfx = sfx
}

// ── Write output ──────────────────────────────────────────────────────────────

const meta: ReplayMeta = {
  ms_per_step:  PLAYBACK_MS,
  char_px_step: CHAR_PX_STEP,
  characters:   CAST.map(c => c.key),
  car_textures: Object.fromEntries(CAST.map(c => [c.key, c.carTexture])),
}

const replay = { meta, steps }

function serialize(r: { meta: ReplayMeta; steps: FullStep[] }): string {
  const metaLine  = `"meta":${JSON.stringify(r.meta)}`
  const stepLines = r.steps.map((s, i) => JSON.stringify(s) + (i < r.steps.length - 1 ? ',' : ''))
  return `{\n${metaLine},\n"steps":[\n${stepLines.join('\n')}\n]\n}`
}

const outDir  = resolve(__dirname, '../../../frontend/public/assets/simulation')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'replay.json')
const output  = serialize(replay)
writeFileSync(outPath, output)

console.log(`\n✓  replay.json → ${outPath}`)
console.log(`   Characters : ${CAST.map(c => c.key).join(', ')}`)
console.log(`   Steps      : ${steps.length}`)
console.log(`   Duration   : ~${(steps.length * PLAYBACK_MS / 1000).toFixed(1)}s at ${PLAYBACK_SPEED}×`)
console.log(`   File size  : ${(output.length / 1024).toFixed(1)} KB`)
