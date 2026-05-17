import type { Facing } from "./types.js"

// ── Car commute constants ─────────────────────────────────────────────────────

const CAR_SPAWN   = { x: 2714, y: 1442 }   // off-screen right
const LANE_X      = 360                      // x where cars enter the parking lane
const CAR_PX_STEP = 34                       // px per step driving horizontally/vertically
const PULL_STEP   = 7                        // px per step pulling into spot
const ARRIVE_TOL  = 14
const SPOT_Y_OFF  = -10
const TILE_SIZE   = 32

// How many steps before the first plan block the commute starts.
// At sec_per_step=10 and ~100 commute frames: 100 × 10s = ~17 sim min commute.
export const COMMUTE_STEPS = 100

// ── Parking spot definitions (pixel coords) ───────────────────────────────────
// x/y = parked car center. pathX/pathY = lane entry point.
// Spots extend downward at 80px intervals.

const SPOTS: Record<string, { x: number; y: number; pathX: number; pathY: number }> = {
  ps1:  { x: 246, y: 1200, pathX: LANE_X, pathY: 1196 },
  ps2:  { x: 246, y: 1280, pathX: LANE_X, pathY: 1276 },
  ps3:  { x: 246, y: 1360, pathX: LANE_X, pathY: 1356 },
  ps4:  { x: 246, y: 1440, pathX: LANE_X, pathY: 1436 },
  ps5:  { x: 246, y: 1520, pathX: LANE_X, pathY: 1516 },
  ps6:  { x: 246, y: 1600, pathX: LANE_X, pathY: 1596 },
  ps7:  { x: 246, y: 1680, pathX: LANE_X, pathY: 1676 },
  ps8:  { x: 246, y: 1760, pathX: LANE_X, pathY: 1756 },
  ps9:  { x: 246, y: 1840, pathX: LANE_X, pathY: 1836 },
  ps10: { x: 246, y: 1920, pathX: LANE_X, pathY: 1916 },
  ps11: { x: 246, y: 2000, pathX: LANE_X, pathY: 1996 },
  ps12: { x: 246, y: 2080, pathX: LANE_X, pathY: 2076 },
  ps13: { x: 246, y: 2160, pathX: LANE_X, pathY: 2156 },
  ps14: { x: 246, y: 2240, pathX: LANE_X, pathY: 2236 },
}

// Per-character commute config — spot and half-length of the car sprite
const COMMUTE_CFG: Record<string, { spotKey: string; halfLong: number }> = {
  dwight:   { spotKey: "ps1",  halfLong: 96 },
  michael:  { spotKey: "ps2",  halfLong: 80 },
  jim:      { spotKey: "ps3",  halfLong: 80 },
  pam:      { spotKey: "ps4",  halfLong: 80 },
  ryan:     { spotKey: "ps5",  halfLong: 80 },
  kelly:    { spotKey: "ps6",  halfLong: 80 },
  oscar:    { spotKey: "ps7",  halfLong: 80 },
  angela:   { spotKey: "ps8",  halfLong: 80 },
  kevin:    { spotKey: "ps9",  halfLong: 80 },
  stanley:  { spotKey: "ps10", halfLong: 96 },
  phyllis:  { spotKey: "ps11", halfLong: 80 },
  meredith: { spotKey: "ps12", halfLong: 80 },
  creed:    { spotKey: "ps13", halfLong: 80 },
  toby:     { spotKey: "ps14", halfLong: 80 },
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CarFrame {
  x: number
  y: number
  facing: Facing
  anim: "drive" | "idle"
  visible: boolean
}

export interface CommuteSequence {
  frames: CarFrame[]
  walkOutPos: [number, number]  // pixel coords where character spawns after parking
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildCommuteFrames(characterKey: string): CommuteSequence | null {
  const cfg = COMMUTE_CFG[characterKey]
  if (!cfg) return null
  const spot = SPOTS[cfg.spotKey]
  if (!spot) return null

  const frames: CarFrame[] = []
  let x = CAR_SPAWN.x
  let y = CAR_SPAWN.y
  const laneX  = spot.pathX
  const targetY = Math.round(spot.pathY + SPOT_Y_OFF)

  // Phase 1 — drive left to lane entry x (off-screen; car hidden until it reaches the lane)
  const VISIBLE_THRESHOLD = laneX + 200  // car becomes visible ~6 tiles before entering lane
  while (Math.abs(x - laneX) > ARRIVE_TOL) {
    const dx = laneX - x
    x = Math.round(x + Math.sign(dx) * Math.min(CAR_PX_STEP, Math.abs(dx)))
    frames.push({ x, y: Math.round(y), facing: "left", anim: "drive", visible: x <= VISIBLE_THRESHOLD })
  }

  // Phase 2 — adjust y to the parking row
  while (Math.abs(y - targetY) > ARRIVE_TOL) {
    const dy = targetY - y
    y = Math.round(y + Math.sign(dy) * Math.min(CAR_PX_STEP, Math.abs(dy)))
    frames.push({ x: Math.round(x), y, facing: dy < 0 ? "back" : "front", anim: "drive", visible: true })
  }
  y = targetY

  // Phase 3 — pull into spot (drive left)
  for (let i = 0; i < 80 && x > spot.x + ARRIVE_TOL; i++) {
    x = Math.round(x - PULL_STEP)
    frames.push({ x, y, facing: "left", anim: "drive", visible: true })
  }

  // Parked
  frames.push({ x: spot.x, y: spot.y, facing: "left", anim: "idle", visible: true })

  // Character walks out to the right of the parking spot
  const walkOutPos: [number, number] = [spot.x + cfg.halfLong + TILE_SIZE, spot.y]

  return { frames, walkOutPos }
}

export function getCarTextureKey(characterKey: string): string | undefined {
  return CHAR_CAR_TEXTURES[characterKey]
}

// Returns the static parked car state for a character (car already in spot, not animating).
export function getParkedCarState(characterKey: string): CarFrame | null {
  const cfg = COMMUTE_CFG[characterKey]
  if (!cfg) return null
  const spot = SPOTS[cfg.spotKey]
  if (!spot) return null
  return { x: spot.x, y: spot.y, facing: "left", anim: "idle", visible: true }
}

// Inline texture map (mirrors public/data/character_cars.json)
const CHAR_CAR_TEXTURES: Record<string, string> = {
  dwight:   "car-3-1",
  michael:  "car-4-1",
  jim:      "car-4-2",
  pam:      "car-3-3",
  ryan:     "car-5-1",
  kelly:    "car-5-2",
  oscar:    "car-4-3",
  angela:   "car-3-2",
  kevin:    "car-4-4",
  stanley:  "car-3-4",
  phyllis:  "car-3-5",
  meredith: "car-4-5",
  creed:    "car-5-3",
  toby:     "car-3-6",
}
