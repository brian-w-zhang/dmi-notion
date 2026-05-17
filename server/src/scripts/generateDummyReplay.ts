// Run with: npx tsx src/scripts/generateDummyReplay.ts
// Outputs: frontend/public/assets/simulation/replay.json
//
// Mirrors sandbox mode (mainMapActionQueue.ts) exactly:
//   1. PathfindSystem A* (combined exterior+office, same as MainMap) to groundEntranceStart
//   2. walkTo groundEntranceEnd  (direct straight-line walk, hidden under occluding tiles)
//   3. teleportTo elevatorStart  (instant position jump, one frame)
//   4. walkTo elevatorEnd        (direct straight-line walk, elevator)
//   5. PathfindSystem A* to dwight_chair
// Car parking replicates CarAutoParkSystem state machine phases.

import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Timing ────────────────────────────────────────────────────────────────────

const MS_PER_STEP    = 80    // path sampling rate (affects step count + smoothness)
const PLAYBACK_SPEED = 1.5   // replay speed multiplier (1.0 = real-time)
const CAR_SPEED      = 7     // px / frame
const CHAR_SPEED     = 3     // px / frame
const FPS            = 60

const CAR_PX_STEP  = Math.round(CAR_SPEED  * FPS * MS_PER_STEP / 1000)  // 34
const CHAR_PX_STEP = Math.round(CHAR_SPEED * FPS * MS_PER_STEP / 1000)  // 14

// Playback ms — smaller = faster. Independent of path sampling so step density is unchanged.
const PLAYBACK_MS = Math.round(MS_PER_STEP / PLAYBACK_SPEED)  // 53 at 1.5×

// ── CarAutoParkSystem constants ───────────────────────────────────────────────

const ARRIVE_TOL    = 14
const SPOT_Y_OFFSET = -10

// Car geometry (Car.ts defaults: halfShort=48, gap=40)
const CAR_DOOR_EDGE = 48 + 40   // = 88  (perpendicular distance from pivot to door)
const CAR_SW        = 32        // sprite width offset for left-facing door

// ── Tilemap / grid constants ──────────────────────────────────────────────────

const TILE_SIZE = 32
const GRID_COLS = 90
const GRID_ROWS = 48

// ── Types ─────────────────────────────────────────────────────────────────────

type Facing   = 'front' | 'back' | 'left' | 'right'
type CarAnim  = 'drive' | 'idle'
type CharAnim = 'walk' | 'idle' | 'sit'

interface CharState {
  id:      string
  x:       number; y: number
  facing:  Facing; anim: CharAnim
  visible: boolean
  seated?: boolean
}

interface SfxEvent {
  key?:      string    // sound key to play (omit when only stopping a loop)
  volume?:   number
  rate?:     number
  detune?:   number
  loop?:     boolean   // start a managed loop tracked by key
  stopLoop?: string    // key of a managed loop to stop
}

interface FullStep {
  step:        number
  car_x:       number; car_y: number; car_facing: Facing; car_anim: CarAnim
  chars:       CharState[]
  follow:      'car' | string   // 'car' or a char id
  emoji:       string; desc: string
  transition?: 'enter_building'
  sfx?:        SfxEvent[]
}

interface ReplayFile {
  meta: { ms_per_step: number; car_px_step: number; char_px_step: number; sprite_key: string; car_texture: string }
  steps: FullStep[]
}

// ── Tiled JSON types (subset) ─────────────────────────────────────────────────

interface TiledObj {
  id?:       number
  name?:     string; x: number; y: number
  polygon?:  { x: number; y: number }[]
  properties?: { name: string; value: unknown }[]
}

interface TiledLayer {
  type: string; name: string
  layers?: TiledLayer[]
  objects?: TiledObj[]
}

interface TiledMapJson { layers: TiledLayer[] }

// ── CollisionSystem (ported, Phaser-free) ─────────────────────────────────────

interface Polygon { vertices: { x: number; y: number }[] }

function isPointInPolygon(px: number, py: number, poly: Polygon): boolean {
  const v = poly.vertices
  let inside = false
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const xi = v[i].x, yi = v[i].y, xj = v[j].x, yj = v[j].y
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function isPointInAnyPolygon(px: number, py: number, polys: Polygon[]): boolean {
  return polys.some(p => isPointInPolygon(px, py, p))
}

function findObjectGroup(layers: TiledLayer[], name: string): TiledLayer | null {
  for (const layer of layers) {
    if (layer.type === 'objectgroup' && layer.name === name) return layer
    if (layer.layers) {
      const found = findObjectGroup(layer.layers, name)
      if (found) return found
    }
  }
  return null
}

function parsePolygons(tiledJSON: TiledMapJson, layerName: string): Polygon[] {
  const group = findObjectGroup(tiledJSON.layers, layerName)
  if (!group) { console.warn(`  ⚠ Layer "${layerName}" not found`); return [] }
  const polys: Polygon[] = []
  for (const obj of group.objects ?? []) {
    if (!obj.polygon) continue
    polys.push({ vertices: obj.polygon.map(v => ({ x: obj.x + v.x, y: obj.y + v.y })) })
  }
  return polys
}

function findNamedPoint(layers: TiledLayer[], name: string): { x: number; y: number } | null {
  for (const layer of layers) {
    if (layer.type === 'objectgroup') {
      for (const obj of layer.objects ?? []) {
        if (obj.name === name) return { x: obj.x, y: obj.y }
      }
    }
    if (layer.layers) {
      const found = findNamedPoint(layer.layers, name)
      if (found) return found
    }
  }
  return null
}

// ── PathfindingSystem (ported, Phaser-free) ───────────────────────────────────

class PathfindingSystem {
  private readonly grid: Uint8Array

  constructor(walkableZones: Polygon[], colliders: Polygon[]) {
    this.grid = new Uint8Array(GRID_COLS * GRID_ROWS)
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const px = col * TILE_SIZE + TILE_SIZE / 2
        const py = row * TILE_SIZE + TILE_SIZE / 2
        if (!isPointInAnyPolygon(px, py, walkableZones) || isPointInAnyPolygon(px, py, colliders)) {
          this.grid[row * GRID_COLS + col] = 1
        }
      }
    }
  }

  isWalkable(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return false
    return this.grid[row * GRID_COLS + col] === 0
  }

  pixelToTile(px: number, py: number) {
    return {
      col: Math.max(0, Math.min(GRID_COLS - 1, Math.floor(px / TILE_SIZE))),
      row: Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(py / TILE_SIZE))),
    }
  }

  tileCenter(col: number, row: number) {
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 }
  }

  findPath(startPx: { x: number; y: number }, goalPx: { x: number; y: number }): { x: number; y: number }[] {
    const start = this.pixelToTile(startPx.x, startPx.y)
    const goal  = this.pixelToTile(goalPx.x, goalPx.y)
    if (start.col === goal.col && start.row === goal.row) return []
    const resolvedGoal = this.isWalkable(goal.col, goal.row)
      ? goal
      : (this._nearestWalkable(goal) ?? start)
    return this._astar(start, resolvedGoal)
  }

  private _astar(
    start: { col: number; row: number },
    goal:  { col: number; row: number }
  ): { x: number; y: number }[] {
    const SIZE = GRID_COLS * GRID_ROWS
    const gScore   = new Float32Array(SIZE).fill(Infinity)
    const fScore   = new Float32Array(SIZE).fill(Infinity)
    const cameFrom = new Int32Array(SIZE).fill(-1)
    const closed   = new Uint8Array(SIZE)

    const startKey = start.row * GRID_COLS + start.col
    const goalKey  = goal.row  * GRID_COLS + goal.col

    gScore[startKey] = 0
    fScore[startKey] = Math.abs(start.col - goal.col) + Math.abs(start.row - goal.row)
    const open: number[] = [startKey]

    while (open.length > 0) {
      const current = heapPop(open, fScore)
      if (current === goalKey) {
        const path: { x: number; y: number }[] = []
        let node = current
        while (node !== startKey) {
          const r = Math.floor(node / GRID_COLS), c = node % GRID_COLS
          path.push(this.tileCenter(c, r))
          node = cameFrom[node]
        }
        return path.reverse()
      }
      if (closed[current]) continue
      closed[current] = 1
      const curRow = Math.floor(current / GRID_COLS), curCol = current % GRID_COLS
      for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nc = curCol + dc, nr = curRow + dr
        if (!this.isWalkable(nc, nr)) continue
        const nKey = nr * GRID_COLS + nc
        if (closed[nKey]) continue
        const tentative = gScore[current] + 1
        if (tentative < gScore[nKey]) {
          cameFrom[nKey] = current
          gScore[nKey]   = tentative
          fScore[nKey]   = tentative + Math.abs(nc - goal.col) + Math.abs(nr - goal.row)
          heapPush(open, nKey, fScore)
        }
      }
    }
    return []
  }

  private _nearestWalkable(blocked: { col: number; row: number }): { col: number; row: number } | null {
    const visited = new Uint8Array(GRID_COLS * GRID_ROWS)
    const queue = [blocked]
    visited[blocked.row * GRID_COLS + blocked.col] = 1
    while (queue.length > 0) {
      const { col, row } = queue.shift()!
      for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nc = col + dc, nr = row + dr
        if (nc < 0 || nr < 0 || nc >= GRID_COLS || nr >= GRID_ROWS) continue
        const k = nr * GRID_COLS + nc
        if (visited[k]) continue
        visited[k] = 1
        if (this.isWalkable(nc, nr)) return { col: nc, row: nr }
        queue.push({ col: nc, row: nr })
      }
    }
    return null
  }
}

function heapPush(heap: number[], val: number, score: Float32Array): void {
  heap.push(val)
  let i = heap.length - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (score[heap[parent]] <= score[heap[i]]) break
    ;[heap[i], heap[parent]] = [heap[parent], heap[i]]
    i = parent
  }
}

function heapPop(heap: number[], score: Float32Array): number {
  const top = heap[0]
  const last = heap.pop()!
  if (heap.length > 0) {
    heap[0] = last
    let i = 0
    while (true) {
      const l = 2 * i + 1, r = 2 * i + 2
      let s = i
      if (l < heap.length && score[heap[l]] < score[heap[s]]) s = l
      if (r < heap.length && score[heap[r]] < score[heap[s]]) s = r
      if (s === i) break
      ;[heap[i], heap[s]] = [heap[s], heap[i]]
      i = s
    }
  }
  return top
}

// ── Parking spot parser ───────────────────────────────────────────────────────

interface ParkingSpot { name: string; x: number; y: number; pathX: number; pathY: number }

function parseParkingSpots(tiledJSON: TiledMapJson): ParkingSpot[] {
  const pathPts = new Map<string, { x: number; y: number }>()
  const apGroup = findObjectGroup(tiledJSON.layers, 'Action Points')
  if (apGroup) {
    for (const obj of apGroup.objects ?? []) {
      const name = obj.name ?? ''
      if (name.endsWith('_path') && !pathPts.has(name)) pathPts.set(name, { x: obj.x, y: obj.y })
    }
  }

  const group = findObjectGroup(tiledJSON.layers, 'Parking Spots')
  if (!group) return []

  return (group.objects ?? []).map(obj => {
    const name = obj.name ?? ''
    const handicap = (obj.properties ?? []).some(p => p.name === 'handicap' && p.value === true)
    const verts = (obj.polygon ?? []).map(v => ({ x: obj.x + v.x, y: obj.y + v.y }))
    const cx = verts.length > 0 ? verts.reduce((s, v) => s + v.x, 0) / verts.length : obj.x
    const cy = verts.length > 0 ? verts.reduce((s, v) => s + v.y, 0) / verts.length : obj.y
    const pathKey = handicap ? 'handicap_path' : `${name}_path`
    const pathPt  = pathPts.get(pathKey)
    return { name, x: cx, y: cy, pathX: pathPt?.x ?? 360, pathY: pathPt?.y ?? cy }
  })
}

// ── CarAutoParkSystem simulation ──────────────────────────────────────────────

interface CarFrame { x: number; y: number; facing: Facing; anim: CarAnim; desc: string }

// Car dimensions matching Car_3 (6x6 sheet layout, defaultHalfSizesForLayout).
// Car.canMoveX uses halfLong when moving toward the front (facing left, dx < 0),
// which is the case for enter-spot. halfShort is only used for lateral movement.
// Car.canMoveX uses halfLong when moving toward the front (facing left, dx < 0),
// which is the case for enter-spot.
const CAR_HALF_LONG  = 96  // Car_3 (6x6): front edge offset when facing/moving left

function simulateParking(
  spawn: { x: number; y: number },
  spot: ParkingSpot,
  _colliders: Polygon[],
  walkableZones: Polygon[],
): CarFrame[] {
  const frames: CarFrame[] = []
  let x = spawn.x, y = spawn.y
  const laneX   = spot.pathX
  const targetY = Math.round(spot.pathY + SPOT_Y_OFFSET)

  // Phase 1: align-lane-x — drive left to laneX
  while (Math.abs(x - laneX) > ARRIVE_TOL) {
    const dx = laneX - x
    x = Math.round(x + Math.sign(dx) * Math.min(CAR_PX_STEP, Math.abs(dx)))
    frames.push({ x, y: Math.round(y), facing: dx < 0 ? 'left' : 'right', anim: 'drive', desc: 'Driving to work' })
  }

  // Phase 2: drive-to-path-y — drive north/south to targetY
  while (Math.abs(y - targetY) > ARRIVE_TOL) {
    const dy = targetY - y
    y = Math.round(y + Math.sign(dy) * Math.min(CAR_PX_STEP, Math.abs(dy)))
    frames.push({ x: Math.round(x), y, facing: dy < 0 ? 'back' : 'front', anim: 'drive', desc: 'Turning into parking lane' })
  }
  y = targetY

  // Phase 3: enter-spot — mirror Car.canMoveX exactly: move 7 px/frame (the real car
  // speed) and stop when the leading edge leaves the walkable zone. Using the full
  // CAR_PX_STEP (34 px) here would skip the narrow curb gap and overshoot.
  const goLeft = spot.x < laneX
  const PHASE3_STEP = 7
  let lastX = x
  let stoppedCount = 0
  for (let guard = 0; guard < 1000; guard++) {
    const nx = x + (goLeft ? -PHASE3_STEP : PHASE3_STEP)
    // Use halfLong: Car.canMoveX checks halfLong when moving toward front (facing left, dx<0)
    const edgeX = nx + (goLeft ? -CAR_HALF_LONG : CAR_HALF_LONG)
    if (!isPointInAnyPolygon(edgeX, y, walkableZones)) break
    x = Math.round(nx)
    if (x === lastX) { if (++stoppedCount >= 3) break } else { stoppedCount = 0 }
    lastX = x
    frames.push({ x, y, facing: goLeft ? 'left' : 'right', anim: 'drive', desc: 'Pulling into spot' })
  }

  frames.push({ x, y, facing: 'left', anim: 'idle', desc: 'Parked' })
  return frames
}

// ── Path walk helpers ─────────────────────────────────────────────────────────

function facingFromDelta(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'front' : 'back'
}

// ── State tracking ────────────────────────────────────────────────────────────

const steps: FullStep[] = []
let stepNum = 0

let car_x = 0, car_y = 0
let car_facing: Facing  = 'left'
let car_anim:   CarAnim  = 'drive'
let char_x = 0, char_y = 0
let char_facing: Facing  = 'front'
let char_anim:   CharAnim = 'idle'
let char_visible = false
let char_seated  = false
let follow: 'car' | string = 'car'

const DWIGHT_ID = 'dwight-schrute'

function snapshot(emoji: string, desc: string, opts: { transition?: 'enter_building' } = {}): void {
  const charEntry: CharState = {
    id: DWIGHT_ID, x: char_x, y: char_y,
    facing: char_facing, anim: char_anim, visible: char_visible,
  }
  if (char_seated) charEntry.seated = true
  steps.push({
    step: stepNum++,
    car_x, car_y, car_facing, car_anim,
    chars: [charEntry],
    follow, emoji, desc,
    ...(opts.transition ? { transition: opts.transition } : {}),
  })
}

function idle(n: number, emoji: string, desc: string): void {
  for (let i = 0; i < n; i++) snapshot(emoji, desc)
}

/**
 * Walk Dwight along A* tile-center waypoints at CHAR_PX_STEP per step.
 * Each segment between consecutive waypoints is interpolated independently
 * (A* uses 4-directional movement so every segment is axis-aligned).
 */
function walkWaypoints(waypoints: { x: number; y: number }[], emoji: string, desc: string): void {
  let curX = char_x, curY = char_y
  for (const wp of waypoints) {
    const dx = wp.x - curX, dy = wp.y - curY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 0.5) { curX = wp.x; curY = wp.y; continue }
    const nSteps = Math.max(1, Math.ceil(dist / CHAR_PX_STEP))
    const facing  = facingFromDelta(dx, dy)
    for (let i = 1; i <= nSteps; i++) {
      const t = i / nSteps
      char_x      = Math.round(curX + dx * t)
      char_y      = Math.round(curY + dy * t)
      char_facing = facing
      char_anim   = 'walk'
      snapshot(emoji, desc)
    }
    curX = wp.x; curY = wp.y
  }
}

/**
 * Walk Dwight in a straight line from current position to (toX, toY).
 * Used for the entrance sequences (under occluding tiles — no pathfinding needed).
 */
function walkDirect(toX: number, toY: number, emoji: string, desc: string): void {
  const fromX = char_x, fromY = char_y
  const dx = toX - fromX, dy = toY - fromY
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 0.5) return
  const nSteps = Math.max(1, Math.ceil(dist / CHAR_PX_STEP))
  const facing  = facingFromDelta(dx, dy)
  for (let i = 1; i <= nSteps; i++) {
    const t = i / nSteps
    char_x      = Math.round(fromX + dx * t)
    char_y      = Math.round(fromY + dy * t)
    char_facing = facing
    char_anim   = 'walk'
    snapshot(emoji, desc)
  }
}

// ── Load tilemap ──────────────────────────────────────────────────────────────

const tilemapPath = resolve(__dirname, '../../../frontend/public/assets/tilemap/dunder-mifflin-tilemap.json')
const tiledJSON: TiledMapJson = JSON.parse(readFileSync(tilemapPath, 'utf-8'))

const exteriorWalkable = parsePolygons(tiledJSON, 'Exterior Walkable Area')
const officeWalkable   = parsePolygons(tiledJSON, 'Office Walkable Area')
const colliders        = parsePolygons(tiledJSON, 'Colliders')
console.log(`Zones — exterior: ${exteriorWalkable.length}, office: ${officeWalkable.length}, colliders: ${colliders.length}`)

// Owned chair colliders — mirrors mainMapSetup.ts exactly so A* avoids the same chairs
const officeObjectsPath = resolve(__dirname, '../../../frontend/public/assets/world/office-objects.json')
const officeObjectsJson = JSON.parse(readFileSync(officeObjectsPath, 'utf-8'))
const ownedChairIds = new Set<number>()
for (const zone of Object.values(officeObjectsJson.zones) as { entities: { id: number; entityType: string; owner: string | null }[] }[]) {
  for (const entity of zone.entities) {
    if (entity.entityType === 'chair' && entity.owner) ownedChairIds.add(entity.id)
  }
}
const chairGroup = findObjectGroup(tiledJSON.layers, 'Chairs')
let ownedChairColliderCount = 0
for (const obj of chairGroup?.objects ?? []) {
  if (obj.id === undefined || !obj.polygon || !ownedChairIds.has(obj.id)) continue
  colliders.push({ vertices: obj.polygon.map(v => ({ x: obj.x + v.x, y: obj.y + v.y })) })
  ownedChairColliderCount++
}
console.log(`Owned chair colliders: ${ownedChairColliderCount}`)

// One combined grid (same as MainMap: [...office, ...exterior])
const pf = new PathfindingSystem([...officeWalkable, ...exteriorWalkable], colliders)

// ── Resolve world coordinates ─────────────────────────────────────────────────

const pt = (name: string, fallback: { x: number; y: number }) => {
  const p = findNamedPoint(tiledJSON.layers, name)
  if (!p) console.warn(`  ⚠ "${name}" not found — using fallback`)
  return p ? { x: Math.round(p.x), y: Math.round(p.y) } : fallback
}

const CAR_SPAWN           = { x: 1069, y: 1442 }   // DEFAULT_CAR_SPAWN (hardcoded in mainMap.constants.ts)
const GROUND_ENTRANCE_IN  = pt('ground_entrance_start',   { x: 818, y: 1327 })
const GROUND_ENTRANCE_OUT = pt('ground_entrance_end',     { x: 819, y: 1205 })
const ELEVATOR_START      = pt('elevator_entrance_start', { x: 608, y: 447  })
const ELEVATOR_END        = pt('elevator_entrance_end',   { x: 608, y: 328  })
const DWIGHT_CHAIR        = pt('dwight_chair_seat',       { x: 1230, y: 749 })

const spots   = parseParkingSpots(tiledJSON)
const ps1     = spots.find(s => s.name === 'ps1') ?? { name: 'ps1', x: 246, y: 1200, pathX: 360, pathY: 1196 }
console.log(`ps1  — centroid (${ps1.x.toFixed(0)}, ${ps1.y.toFixed(0)})  pathX=${ps1.pathX.toFixed(0)}  pathY=${ps1.pathY.toFixed(0)}`)

// Parked position: pivot snaps to (centroid.x, pathY + SPOT_Y_OFFSET)
const PARKED_X   = Math.round(ps1.x)
const PARKED_Y   = Math.round(ps1.pathY + SPOT_Y_OFFSET)
// Driver door for facing='left': x = pivotX - SW, y = pivotY + edge
const DISMOUNT_X = PARKED_X - CAR_SW
const DISMOUNT_Y = PARKED_Y + CAR_DOOR_EDGE
console.log(`Parked (${PARKED_X}, ${PARKED_Y})  Dismount (${DISMOUNT_X}, ${DISMOUNT_Y})`)

// ── Generate replay ───────────────────────────────────────────────────────────

// Step 0: initial snapshot
car_x = CAR_SPAWN.x; car_y = CAR_SPAWN.y; car_facing = 'left'; car_anim = 'drive'
char_x = DISMOUNT_X; char_y = DISMOUNT_Y; char_facing = 'front'; char_anim = 'idle'
char_visible = false; follow = 'car'
snapshot('🚗', 'Driving to work')

// ── Car parking (CarAutoParkSystem state machine) ─────────────────────────────

const parkFrames = simulateParking(CAR_SPAWN, ps1, colliders, exteriorWalkable)
console.log(`Parking frames: ${parkFrames.length}`)
for (const f of parkFrames) {
  car_x = f.x; car_y = f.y; car_facing = f.facing; car_anim = f.anim
  snapshot(f.anim === 'idle' ? '🅿️' : '🚗', f.desc)
}
car_anim = 'idle'
idle(2, '🅿️', 'Parked')

// ── Dismount ──────────────────────────────────────────────────────────────────

char_x = DISMOUNT_X; char_y = DISMOUNT_Y
char_facing = 'front'; char_anim = 'idle'
char_visible = true; follow = DWIGHT_ID
idle(2, '😤', 'Getting out of car')

// ── Outdoor walk: pathfind to groundEntranceStart ────────────────────────────

const outdoorPath = pf.findPath({ x: DISMOUNT_X, y: DISMOUNT_Y }, GROUND_ENTRANCE_IN)
console.log(`Outdoor A* path: ${outdoorPath.length} waypoints`)
walkWaypoints(outdoorPath, '🚶', 'Walking to building')

// ── Entrance: walkTo groundEntranceEnd (direct, under occluding tiles) ────────
// Mirrors: dwight.walkTo(groundEntranceEnd.x, groundEntranceEnd.y, ...)

walkDirect(GROUND_ENTRANCE_OUT.x, GROUND_ENTRANCE_OUT.y, '🏢', 'Entering building')

// ── Teleport to elevatorStart (hidden by black overlay transition) ────────────
// Mirrors: dwight.teleportTo(elevatorStart.x, elevatorStart.y)
// The 787px jump across the map is hidden inside the fade.

char_x = ELEVATOR_START.x; char_y = ELEVATOR_START.y
char_facing = 'back'; char_anim = 'idle'
snapshot('🛗', 'Taking elevator', { transition: 'enter_building' })

// ── Elevator: walkTo elevatorEnd (direct, elevator ride) ─────────────────────
// Mirrors: dwight.walkTo(elevatorEnd.x, elevatorEnd.y, execute)

walkDirect(ELEVATOR_END.x, ELEVATOR_END.y, '🛗', 'Riding elevator')

// ── Indoor walk: pathfind from elevatorEnd to desk ────────────────────────────

const deskPath = pf.findPath(ELEVATOR_END, DWIGHT_CHAIR)
console.log(`Elevator→desk A* path: ${deskPath.length} waypoints`)
walkWaypoints(deskPath, '🚶', 'Walking to desk')

// ── Sit at desk ───────────────────────────────────────────────────────────────

char_x = DWIGHT_CHAIR.x; char_y = DWIGHT_CHAIR.y
char_facing = 'left'; char_anim = 'sit'; char_seated = true
idle(3, '💻', 'At desk — Assistant to the Regional Manager')

// ── Bake sound events into steps ─────────────────────────────────────────────
// Pre-roll all randomness so the JSON is deterministic on every replay.
// All volumes are pre-scaled by REPLAY_VOLUME_SCALE so the sim is quieter than sandbox.

const REPLAY_VOLUME_SCALE = 0.3
const vol = (v: number) => parseFloat((v * REPLAY_VOLUME_SCALE).toFixed(3))

const FOOTSTEP_KEYS  = ['Cloth_dig1.ogg', 'Cloth_dig2.ogg', 'Cloth_dig3.ogg', 'Cloth_dig4.ogg']
const FOOTSTEP_EVERY = Math.round(400 / PLAYBACK_MS)  // ~7 steps ≈ 400 ms between footsteps

const entrOutX = Math.round(GROUND_ENTRANCE_OUT.x)
const entrOutY = Math.round(GROUND_ENTRANCE_OUT.y)

let footCounter    = 0
let carLoopStarted = false

for (let i = 0; i < steps.length; i++) {
  const s    = steps[i]
  const prev = i > 0 ? steps[i - 1] : null
  const sfx: SfxEvent[] = []

  const dw     = s.chars.find(c => c.id === DWIGHT_ID)
  const prevDw = prev?.chars.find(c => c.id === DWIGHT_ID)

  // Car driving loop — start on first moving step, stop at dismount
  if (!carLoopStarted && s.car_anim === 'drive') {
    sfx.push({ key: 'car_driving', loop: true, volume: vol(3) })
    carLoopStarted = true
  }

  // Dismount — char becomes visible for the first time
  if (dw?.visible && !prevDw?.visible) {
    sfx.push({ stopLoop: 'car_driving' })
    sfx.push({ key: 'open_car_door', volume: vol(1) })
  }

  // Footsteps — every FOOTSTEP_EVERY walking steps, pre-rolled random values
  if (dw?.visible && dw.anim === 'walk') {
    footCounter++
    if (footCounter % FOOTSTEP_EVERY === 1) {  // offset by 1 so first step gets sound
      sfx.push({
        key:    FOOTSTEP_KEYS[Math.floor(Math.random() * FOOTSTEP_KEYS.length)],
        volume: vol(0.2 + Math.random() * 0.2),
        rate:   parseFloat((0.85 + Math.random() * 0.3).toFixed(3)),
        detune: Math.round(Math.random() * 400 - 200),
      })
    }
  } else {
    footCounter = 0
  }

  // Building entrance door — exact arrival at ground_entrance_out (check y, not x — path shares x)
  if (dw?.x === entrOutX && dw?.y === entrOutY && prevDw?.y !== entrOutY) {
    sfx.push({ key: 'entrance_door', volume: vol(0.4) })
  }

  // Sit down — char enters seated state
  if (dw?.seated && !prevDw?.seated) {
    sfx.push({
      key:    'Cloth_dig1.ogg',
      volume: vol(0.35),
      detune: Math.round(Math.random() * 200 - 100),
    })
  }

  if (sfx.length > 0) s.sfx = sfx
}

// ── Write output ──────────────────────────────────────────────────────────────

const replay: ReplayFile = {
  meta: {
    ms_per_step:  PLAYBACK_MS,
    car_px_step:  CAR_PX_STEP,
    char_px_step: CHAR_PX_STEP,
    sprite_key:   'dwight-schrute',
    car_texture:  'car-3-1',
  },
  steps,
}

// One step per line — readable in an editor, parseable by JSON.parse()
function serializeReplay(r: ReplayFile): string {
  const metaLine  = `"meta":${JSON.stringify(r.meta)}`
  const stepLines = r.steps.map((s, i) =>
    JSON.stringify(s) + (i < r.steps.length - 1 ? ',' : '')
  )
  return `{\n${metaLine},\n"steps":[\n${stepLines.join('\n')}\n]\n}`
}

const outDir  = resolve(__dirname, '../../../frontend/public/assets/simulation')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'replay.json')
const output  = serializeReplay(replay)
writeFileSync(outPath, output)

console.log(`\n✓  replay.json → ${outPath}`)
console.log(`   Steps    : ${steps.length}`)
console.log(`   Duration : ~${(steps.length * PLAYBACK_MS / 1000).toFixed(1)}s at ${PLAYBACK_SPEED}× speed`)
console.log(`   File     : ${(output.length / 1024).toFixed(1)} KB`)

const dwight     = (s: FullStep) => s.chars.find(c => c.id === DWIGHT_ID)
const dismountStep = steps.find(s => dwight(s)?.visible && !dwight(steps[Math.max(0, s.step - 1)])?.visible)
const sitStep      = steps.find(s => dwight(s)?.seated)
console.log('')
if (dismountStep) {
  const d = dwight(dismountStep)!
  console.log(`   Dismount   step #${dismountStep.step}: char(${d.x},${d.y})`)
}
const entranceIdx = steps.findIndex(s => { const d = dwight(s); return d?.x === GROUND_ENTRANCE_OUT.x && d?.y === GROUND_ENTRANCE_OUT.y })
const teleportIdx = steps.findIndex(s => { const d = dwight(s); return d?.x === ELEVATOR_START.x && d?.y === ELEVATOR_START.y })
const elevEndIdx  = steps.findIndex(s => { const d = dwight(s); return d?.x === ELEVATOR_END.x && d?.y === ELEVATOR_END.y })
console.log(`   Entrance   step #${entranceIdx}: char→(${GROUND_ENTRANCE_OUT.x},${GROUND_ENTRANCE_OUT.y})`)
console.log(`   Teleport   step #${teleportIdx}: char→(${ELEVATOR_START.x},${ELEVATOR_START.y})`)
console.log(`   ElevEnd    step #${elevEndIdx}: char→(${ELEVATOR_END.x},${ELEVATOR_END.y})`)
if (sitStep) {
  const d = dwight(sitStep)!
  console.log(`   Sit        step #${sitStep.step}: char(${d.x},${d.y})`)
}
