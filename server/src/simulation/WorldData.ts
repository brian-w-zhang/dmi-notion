import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.resolve(__dirname, "../../../frontend/public/assets/world")

// ── Types ─────────────────────────────────────────────────────────────────────

// Simulation step duration — must match index.ts SEC_PER_STEP.
export const SEC_PER_STEP = 10   // 10 sim-seconds per step

export interface ApplianceAction {
  id: string
  name: string
  emoji: string
  durationMs: number       // real-time animation duration for sandbox progress bar
  durationSteps: number    // how many sim steps (× SEC_PER_STEP game-sec) this action occupies
  needDeltas: Record<string, number>  // positive = satisfying, negative = worsening
  actionPointId?: number
  loadingPhrases?: string[]
}

export interface ActionPoint {
  id: number
  name: string
  position: { x: number; y: number }
  facing: string
}

export interface Appliance {
  objectId: number
  objectName: string
  zone: string
  center: { x: number; y: number }
  actions: ApplianceAction[]
  actionPoints: ActionPoint[]
}

export interface AdvertisedAction {
  appliance: string
  action: string
  emoji: string
  durationMs: number
  durationSteps: number
  needDeltas: Record<string, number>
  actionPointPos: [number, number]  // pixel coords of the action point
}

// ── Load data ─────────────────────────────────────────────────────────────────

const officeObjectsRaw = JSON.parse(
  fs.readFileSync(path.join(ASSETS, "office-objects.json"), "utf-8")
)

// Duration overrides. At SEC_PER_STEP=10 and MS_PER_STEP=185 in the replay:
//   1 real second ≈ 5.4 steps  |  11 steps ≈ 2s  |  16 steps ≈ 3s  |  22 steps ≈ 4s  |  27 steps ≈ 5s
// Rule: minimum 11 steps (2 s on-screen) so any action is visible; work actions 22–27 steps (4–5 s).
const DURATION_OVERRIDES: Record<string, Record<string, number>> = {
  // ── Deep work (4–5 s on screen, 4–5 sim-minutes) ─────────────────────────
  "dwight_phone":            { "sales_call":         24 },   // 4.4 s
  "dwight_pc":               { "client_research":    22 },   // 4.1 s
  "conf_tv":                 { "present to group":   27, "watch screen": 16 },
  "conf_easel":              { "present idea":       22, "brainstorm":   27 },
  "water_cooler":            { "chat":               22, "get water":    11 },

  // ── Medium utility (3–4 s, 3–4 sim-minutes) ──────────────────────────────
  "kitchen_fridge":          { "get snack":          16 },   // 3.0 s
  "coffee_machine":          { "get coffee":         16 },   // 3.0 s
  "toaster":                 { "make toast":         18 },   // 3.3 s
  "kitchen_microwave":       { "heat food":          22 },   // 4.1 s
  "break_room_microwave":    { "heat food":          22 },   // 4.1 s
  "accounting_printer":      { "print document": 16, "scan document": 18 },
  "sales_printer":           { "print document": 16, "scan document": 18 },
  "accounting_fire_hydrant": { "inspect hydrant": 16, "use hydrant": 22 },
  "sales_fire_hydrant":      { "inspect hydrant": 16, "use hydrant": 22 },
  "kitchen_fire_hydrant":    { "inspect hydrant": 16, "use hydrant": 22 },

  // ── Quick utility (2–3 s, 2–3 sim-minutes) ───────────────────────────────
  "vending_machines":        { "buy snack": 11, "buy drink": 11 },
  "kitchen_sink":            { "wash hands":  11 },
  "mens_sink1":              { "wash hands":  11 }, "mens_sink2":  { "wash hands": 11 },
  "womens_sink1":            { "wash hands":  11 }, "womens_sink2": { "wash hands": 11 },
  "urinal1":                 { "use restroom": 16 }, "urinal2": { "use restroom": 16 },
  "mens_toilet":             { "use restroom": 18 },
  "womens_toilet1":          { "use restroom": 18 },
  "womens_toilet2":          { "use restroom": 18 },
  "womens_toilet3":          { "use restroom": 18 },
}

export const APPLIANCES: Appliance[] = Object.values(
  officeObjectsRaw.entitiesById as Record<string, any>
)
  .filter((e) => e.entityType === "appliance")
  .map((e) => ({
    objectId: e.id,
    objectName: e.name,
    zone: e.zone ?? "",
    center: e.center,
    actionPoints: e.actionPoints ?? [],
    actions: (e.actions ?? []).map((act: any) => ({
      id: act.id,
      name: act.name,
      emoji: act.emoji ?? "⚙️",
      durationMs: act.durationMs ?? 2000,
      durationSteps: act.durationSteps ?? Math.max(1, Math.round((act.durationMs ?? 2000) / 1000 / SEC_PER_STEP)),
      needDeltas: act.needDeltas ?? act.need_deltas ?? act.needs ?? {},
      actionPointId: act.actionPointId,
      loadingPhrases: act.loadingPhrases ?? [],
    })),
  }))

// Apply duration overrides post-load
for (const appliance of APPLIANCES) {
  const overrides = DURATION_OVERRIDES[appliance.objectName]
  if (!overrides) continue
  for (const action of appliance.actions) {
    if (action.name in overrides) {
      action.durationSteps = overrides[action.name]
    }
  }
}

// ── Coordinate helpers (internal only) ───────────────────────────────────────

const TILE_SIZE = 32

function pixelToTile(px: number, py: number): [number, number] {
  return [Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE)]
}

function pixelDist(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
}

// ── Zone lookup ───────────────────────────────────────────────────────────────

// Returns advertised actions available in a given zone (pixel action point positions).
export function getAdvertisedActions(zoneName: string): AdvertisedAction[] {
  const normalized = zoneName.toLowerCase().trim()
  const results: AdvertisedAction[] = []

  for (const appliance of APPLIANCES) {
    if (appliance.zone.toLowerCase().trim() !== normalized) continue
    for (const action of appliance.actions) {
      const point = appliance.actionPoints.find((p) => p.id === action.actionPointId)
      const pos = point?.position ?? appliance.center
      results.push({
        appliance: appliance.objectName,
        action: action.name,
        emoji: action.emoji,
        durationMs: action.durationMs,
        durationSteps: action.durationSteps,
        needDeltas: action.needDeltas,
        actionPointPos: [Math.round(pos.x), Math.round(pos.y)],
      })
    }
  }

  return results
}

// Returns all zones that have advertised actions.
export function getAllZonesWithActions(): string[] {
  return [...new Set(APPLIANCES.filter((a) => a.actions.length > 0).map((a) => a.zone.trim()))]
}

// Returns a specific appliance's actions by name.
export function getApplianceByName(objectName: string): Appliance | undefined {
  return APPLIANCES.find((a) => a.objectName === objectName)
}

// Returns the need deltas for a specific appliance action.
export function getActionNeedDeltas(
  applianceName: string,
  actionName: string
): Record<string, number> | undefined {
  const appliance = getApplianceByName(applianceName)
  if (!appliance) return undefined
  const action = appliance.actions.find((a) => a.name === actionName)
  return action?.needDeltas
}

// ── Zone pixel position ───────────────────────────────────────────────────────

// Returns the pixel position of a zone's primary action point or entity center.
export function getZoneCenterPos(zoneName: string): [number, number] | undefined {
  const normalized = zoneName.toLowerCase().trim()

  for (const appliance of APPLIANCES) {
    if (appliance.zone.toLowerCase().trim() !== normalized) continue
    if (appliance.actionPoints.length > 0) {
      const p = appliance.actionPoints[0].position
      return [Math.round(p.x), Math.round(p.y)]
    }
    return [Math.round(appliance.center.x), Math.round(appliance.center.y)]
  }

  const zones = officeObjectsRaw.zones as Record<string, { entities: any[] }>
  const zoneEntry = Object.entries(zones).find(([k]) => k.toLowerCase().trim() === normalized)
  if (!zoneEntry) return undefined

  for (const entity of zoneEntry[1].entities ?? []) {
    if (entity.center) return [Math.round(entity.center.x), Math.round(entity.center.y)]
    if (entity.sitPoints?.[0]?.position) {
      const p = entity.sitPoints[0].position
      return [Math.round(p.x), Math.round(p.y)]
    }
  }

  return undefined
}

// ── Character desk positions (pixel coords from sit points) ──────────────────

const CHAR_DESK_POS:    Record<string, [number, number]> = {}
const CHAR_DESK_FACING: Record<string, string> = {}

;(() => {
  const zones = officeObjectsRaw.zones as Record<string, { entities: any[] }>
  for (const zone of Object.values(zones)) {
    for (const entity of zone.entities ?? []) {
      if (!entity.owner) continue
      const sp = entity.sitPoints?.[0]
      const pos = sp?.position ?? entity.actionPoints?.[0]?.position ?? entity.center
      if (pos) {
        // Use exact pixel from sit point — no tile rounding
        CHAR_DESK_POS[entity.owner] = [Math.round(pos.x), Math.round(pos.y)]
        if (sp?.facing) CHAR_DESK_FACING[entity.owner] = sp.facing
      }
    }
  }
})()

export function getCharDeskPos(characterKey: string): [number, number] | undefined {
  return CHAR_DESK_POS[characterKey]
}

export function getCharDeskFacing(characterKey: string): string {
  return CHAR_DESK_FACING[characterKey] ?? "front"
}

// ── locationId → pixel position ───────────────────────────────────────────────
// Resolves desk names ("jim_desk"), zone names ("break_room", "conference_room"),
// and appliance names to a pixel coordinate for pathfinding.

export function resolveLocationPos(locationId: string): [number, number] | undefined {
  // "<key>_desk" → exact sit point pixel
  const deskMatch = locationId.match(/^(\w+)_desk$/)
  if (deskMatch) {
    const owner = deskMatch[1]
    if (CHAR_DESK_POS[owner]) return CHAR_DESK_POS[owner]
  }

  // Zone name (with or without underscores)
  const asZoneName = locationId.replace(/_/g, " ")
  return getZoneCenterPos(locationId) ?? getZoneCenterPos(asZoneName)
}

// ── Zone connection map ───────────────────────────────────────────────────────
// Defines which zones a character can perceive when standing in a given zone.
// Zone awareness = coarse state (occupied/available) for all connected zones.
// Radius perception = full detail (actions, need effects) for objects nearby.

const ZONE_CONNECTIONS: Record<string, string[]> = {
  // Open-plan cluster — all three see each other
  "sales":            ["sales", "reception", "accounting"],
  "reception":        ["reception", "sales", "accounting", "entrance hallway", "lobby"],
  "accounting":       ["accounting", "sales", "reception"],

  // Lobby + hallway chain
  "lobby":            ["lobby", "reception", "entrance hallway"],
  "entrance hallway": ["entrance hallway", "lobby", "reception"],

  // Isolated rooms — see only themselves
  "michael's office": ["michael's office"],
  "conference_room":  ["conference_room"],
  "annex":            ["annex"],
  "kitchen":          ["kitchen"],
  "break room":       ["break room"],
  "men's bathroom":   ["men's bathroom"],
  "women's bathroom": ["women's bathroom"],
  "closet":           ["closet"],
  "far lobby":        ["far lobby"],
  "parking lot":      ["parking lot"],
  "parking lot ":     ["parking lot ", "parking lot"],  // trailing-space variant in JSON
  "ground entrance":  ["ground entrance"],
  "stairs":           ["stairs"],
  "elevator":         ["elevator"],
}

export function getVisibleZones(currentZone: string): string[] {
  const normalized = currentZone.toLowerCase().trim()
  const key = Object.keys(ZONE_CONNECTIONS).find(
    (k) => k.toLowerCase().trim() === normalized
  )
  return key ? ZONE_CONNECTIONS[key] : [currentZone]
}

// ── Entity index (all positions in pixels) ────────────────────────────────────

interface EntityRecord {
  id: number
  name: string
  entityType: string
  zone: string
  pos: [number, number]              // primary pixel position (first action point or center)
  actionPointPositions: [number, number][]
  actions: ApplianceAction[]
}

const ALL_ENTITIES: EntityRecord[] = Object.values(
  officeObjectsRaw.entitiesById as Record<string, any>
).map((e: any) => {
  const centerPos: [number, number] = [Math.round(e.center?.x ?? 0), Math.round(e.center?.y ?? 0)]
  const actionPointPositions: [number, number][] = (e.actionPoints ?? []).map(
    (ap: any) => [Math.round(ap.position.x), Math.round(ap.position.y)] as [number, number]
  )
  return {
    id: e.id,
    name: e.name,
    entityType: e.entityType ?? "object",
    zone: e.zone ?? "",
    pos: actionPointPositions[0] ?? centerPos,
    actionPointPositions,
    actions: (e.actions ?? []).map((act: any) => ({
      id: act.id,
      name: act.name,
      emoji: act.emoji ?? "⚙️",
      durationMs: act.durationMs ?? 2000,
      durationSteps: act.durationSteps ?? Math.max(1, Math.round((act.durationMs ?? 2000) / 1000 / SEC_PER_STEP)),
      needDeltas: act.needDeltas ?? act.need_deltas ?? act.needs ?? {},
      actionPointId: act.actionPointId,
      loadingPhrases: act.loadingPhrases ?? [],
    })),
  }
})

// Infer which zone a pixel position belongs to by proximity to known entities.
export function inferZoneFromPos(pos: [number, number]): string {
  let best = ""
  let bestDist = Infinity
  for (const e of ALL_ENTITIES) {
    if (!e.zone) continue
    const d = pixelDist(pos, e.pos)
    if (d < bestDist) { bestDist = d; best = e.zone }
  }
  return best
}

// ── Zone awareness — coarse state ─────────────────────────────────────────────
// occupiedAppliances: applianceName → characterKey (who is using it right now)

export interface ZoneAwarenessEntity {
  name: string
  entityType: string
  zone: string
  status: "available" | "occupied"
  occupiedBy: string | null
  actionNames: string[]
}

export function getZoneAwareness(
  currentZone: string,
  occupiedAppliances: Map<string, string>   // applianceName → characterKey
): { visibleZones: string[]; entities: ZoneAwarenessEntity[] } {
  const visibleZones = getVisibleZones(currentZone)
  const normalizedVisible = new Set(visibleZones.map((z) => z.toLowerCase().trim()))

  const entities: ZoneAwarenessEntity[] = []
  for (const entity of ALL_ENTITIES) {
    if (!normalizedVisible.has(entity.zone.toLowerCase().trim())) continue
    const occupiedBy = occupiedAppliances.get(entity.name) ?? null
    entities.push({
      name: entity.name,
      entityType: entity.entityType,
      zone: entity.zone,
      status: occupiedBy ? "occupied" : "available",
      occupiedBy,
      actionNames: entity.actions.map((a) => a.name),
    })
  }

  return { visibleZones, entities }
}

// ── Needs-based action scoring ────────────────────────────────────────────────
// Utility score per action:
//   score = Σ( needDelta × urgency × importanceWeight )
// where urgency = 1 - currentNeedValue  (need at 0.1 → urgency 0.9, strong pull)
// and importanceWeight reflects biological priority over social/productivity needs.
//
// If currentNeeds is not provided, urgency defaults to 1.0 for all needs
// (treats every listed need as fully deprived — useful for testing).

const NEED_IMPORTANCE: Record<string, number> = {
  bladder:      3.0,   // biological — can't ignore
  hunger:       2.5,
  thirst:       2.0,
  energy:       1.8,
  stress:       1.5,
  health:       1.5,
  social:       1.0,
  belonging:    0.9,
  esteem:       0.8,
  stimulation:  0.7,
  productivity: 0.5,
}

export interface ActionForNeed {
  appliance: string
  action: string
  emoji: string
  zone: string
  durationSteps: number
  needEffects: Record<string, number>
  utilityScore: number
  actionPointPos: [number, number]   // pixel coords
  distance: number | null            // pixels from origin, or null if unknown
}

export function findActionsForNeeds(
  urgentNeeds: string[],
  originPos: [number, number] | null,   // pixel coords
  k = 5,
  currentNeeds: Record<string, number> = {}
): ActionForNeed[] {
  if (urgentNeeds.length === 0) return []

  const candidates: ActionForNeed[] = []

  for (const entity of ALL_ENTITIES) {
    if (entity.entityType !== "appliance") continue

    for (const action of entity.actions) {
      let score = 0
      const relevantEffects: Record<string, number> = {}

      for (const need of urgentNeeds) {
        const delta = action.needDeltas[need] ?? 0
        if (delta <= 0) continue
        const urgency = 1 - (currentNeeds[need] ?? 0)
        const weight = NEED_IMPORTANCE[need] ?? 1.0
        score += delta * urgency * weight
        relevantEffects[need] = Math.round(delta)
      }

      if (score === 0) continue

      const ap = entity.actionPointPositions[0] ?? entity.pos
      const dist = originPos ? pixelDist(originPos, ap) : null

      // Proximity tiebreaker: up to 15% boost within 6400px (~200 tiles)
      const proximityBonus = dist !== null ? Math.max(0, 1 - dist / 6400) * 0.15 : 0
      const finalScore = score * (1 + proximityBonus)

      candidates.push({
        appliance: entity.name,
        action: action.name,
        emoji: action.emoji,
        zone: entity.zone,
        durationSteps: action.durationSteps,
        needEffects: relevantEffects,
        utilityScore: Math.round(finalScore * 10) / 10,
        actionPointPos: ap,
        distance: dist !== null ? Math.round(dist) : null,
      })
    }
  }

  return candidates
    .sort((a, b) => b.utilityScore - a.utilityScore)
    .slice(0, k)
}
