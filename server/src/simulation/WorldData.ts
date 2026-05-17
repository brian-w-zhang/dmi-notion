import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.resolve(__dirname, "../../../frontend/public/assets/world")

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApplianceAction {
  id: string
  name: string
  emoji: string
  durationMs: number
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
  needDeltas: Record<string, number>
  actionPointTile: [number, number]  // tile coords of the action point
}

// ── Load data ─────────────────────────────────────────────────────────────────

const officeObjectsRaw = JSON.parse(
  fs.readFileSync(path.join(ASSETS, "office-objects.json"), "utf-8")
)

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
      needDeltas: act.needDeltas ?? act.need_deltas ?? act.needs ?? {},
      actionPointId: act.actionPointId,
      loadingPhrases: act.loadingPhrases ?? [],
    })),
  }))

// ── Pixel → tile coordinate ───────────────────────────────────────────────────

const TILE_SIZE = 32

export function pixelToTile(px: number, py: number): [number, number] {
  return [Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE)]
}

// ── Zone lookup ───────────────────────────────────────────────────────────────

// Returns advertised actions available in a given zone.
// Zone name matching is case-insensitive and trims trailing spaces.
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
        needDeltas: action.needDeltas,
        actionPointTile: pixelToTile(pos.x, pos.y),
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

// ── Zone tile position ────────────────────────────────────────────────────────

// Returns the approximate center tile of a zone.
// Priority: first action point in zone → first entity center → undefined.
export function getZoneCenterTile(zoneName: string): [number, number] | undefined {
  const normalized = zoneName.toLowerCase().trim()

  // Try appliances first (they have precise action points)
  for (const appliance of APPLIANCES) {
    if (appliance.zone.toLowerCase().trim() !== normalized) continue
    if (appliance.actionPoints.length > 0) {
      const p = appliance.actionPoints[0].position
      return pixelToTile(p.x, p.y)
    }
    return pixelToTile(appliance.center.x, appliance.center.y)
  }

  // Fall back to office-objects.json zones
  const zones = officeObjectsRaw.zones as Record<string, { entities: any[] }>
  const zoneEntry = Object.entries(zones).find(
    ([k]) => k.toLowerCase().trim() === normalized
  )
  if (!zoneEntry) return undefined

  const entities = zoneEntry[1].entities ?? []
  for (const entity of entities) {
    if (entity.center) return pixelToTile(entity.center.x, entity.center.y)
    if (entity.sitPoints?.[0]?.position)
      return pixelToTile(entity.sitPoints[0].position.x, entity.sitPoints[0].position.y)
  }

  return undefined
}

// ── Character desk positions ──────────────────────────────────────────────────
// Derived from office-objects.json owner fields. Used for plan locationId resolution.

const CHAR_DESK_TILES: Record<string, [number, number]> = {}

;(() => {
  const zones = officeObjectsRaw.zones as Record<string, { entities: any[] }>
  for (const zone of Object.values(zones)) {
    for (const entity of zone.entities ?? []) {
      if (!entity.owner) continue
      const pos =
        entity.sitPoints?.[0]?.position ??
        entity.actionPoints?.[0]?.position ??
        entity.center
      if (pos) {
        CHAR_DESK_TILES[entity.owner] = pixelToTile(pos.x, pos.y)
      }
    }
  }
})()

// locationId → tile: handles "jim_desk", "break_room", "conference_room", etc.
export function resolveLocationTile(locationId: string): [number, number] | undefined {
  // Check character desk pattern: "<key>_desk"
  const deskMatch = locationId.match(/^(\w+)_desk$/)
  if (deskMatch) {
    const owner = deskMatch[1]
    if (CHAR_DESK_TILES[owner]) return CHAR_DESK_TILES[owner]
  }

  // Direct zone name (replace underscores with spaces for zone lookup)
  const asZoneName = locationId.replace(/_/g, " ")
  return getZoneCenterTile(locationId) ?? getZoneCenterTile(asZoneName)
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

// ── Entity index ──────────────────────────────────────────────────────────────

interface EntityRecord {
  id: number
  name: string
  entityType: string
  zone: string
  tile: [number, number]       // primary proximity tile (first action point or center)
  actionPointTiles: [number, number][]
  actions: ApplianceAction[]
}

const ALL_ENTITIES: EntityRecord[] = Object.values(
  officeObjectsRaw.entitiesById as Record<string, any>
).map((e: any) => {
  const centerTile = pixelToTile(e.center?.x ?? 0, e.center?.y ?? 0)
  const actionPointTiles: [number, number][] = (e.actionPoints ?? []).map((ap: any) =>
    pixelToTile(ap.position.x, ap.position.y)
  )
  return {
    id: e.id,
    name: e.name,
    entityType: e.entityType ?? "object",
    zone: e.zone ?? "",
    tile: actionPointTiles[0] ?? centerTile,
    actionPointTiles,
    actions: (e.actions ?? []).map((act: any) => ({
      id: act.id,
      name: act.name,
      emoji: act.emoji ?? "⚙️",
      durationMs: act.durationMs ?? 2000,
      needDeltas: act.needDeltas ?? act.need_deltas ?? act.needs ?? {},
      actionPointId: act.actionPointId,
      loadingPhrases: act.loadingPhrases ?? [],
    })),
  }
})

// Infer which zone a tile belongs to by finding the closest entity.
export function inferZoneFromTile(tile: [number, number]): string {
  let best = ""
  let bestDist = Infinity
  for (const e of ALL_ENTITIES) {
    if (!e.zone) continue
    const d = tileDist(tile, e.tile)
    if (d < bestDist) { bestDist = d; best = e.zone }
  }
  return best
}

function tileDist(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
}

// ── Radius perception — full detail ──────────────────────────────────────────
// Everything within N tiles: complete action list, need effects, occupation.
// This is "vision" — close objects get rich descriptions.

export interface NearbyEntity {
  name: string
  entityType: string
  zone: string
  tile: [number, number]
  distanceTiles: number
  occupiedBy: string | null
  availableActions: {
    name: string
    emoji: string
    durationSec: number
    needEffects: Record<string, number>
    actionPointTile: [number, number]
  }[]
}

export function getEntitiesNearby(
  originTile: [number, number],
  radiusTiles: number,
  occupiedTiles: Map<string, string>  // "x,y" → characterKey
): NearbyEntity[] {
  const results: NearbyEntity[] = []
  for (const entity of ALL_ENTITIES) {
    const dist = tileDist(originTile, entity.tile)
    if (dist > radiusTiles) continue

    let occupiedBy: string | null = null
    for (const apt of entity.actionPointTiles) {
      const who = occupiedTiles.get(`${apt[0]},${apt[1]}`)
      if (who) { occupiedBy = who; break }
    }

    results.push({
      name: entity.name,
      entityType: entity.entityType,
      zone: entity.zone,
      tile: entity.tile,
      distanceTiles: Math.round(dist * 10) / 10,
      occupiedBy,
      availableActions: entity.actions.map((a) => ({
        name: a.name,
        emoji: a.emoji,
        durationSec: Math.round(a.durationMs / 1000),
        needEffects: a.needDeltas,
        actionPointTile: entity.actionPointTiles[0] ?? entity.tile,
      })),
    })
  }
  return results.sort((a, b) => a.distanceTiles - b.distanceTiles)
}

// ── Zone awareness — coarse state ─────────────────────────────────────────────
// Everything in your zone + connected zones: name, status, action names only.
// No need effects — you know the coffee machine is free but not exactly how it works
// unless you walk up to it (radius layer).

export interface ZoneAwarenessEntity {
  name: string
  entityType: string
  zone: string
  tile: [number, number]
  status: "available" | "occupied"
  occupiedBy: string | null
  actionNames: string[]   // action names only — no need deltas at this distance
}

export function getZoneAwareness(
  currentZone: string,
  occupiedTiles: Map<string, string>
): { visibleZones: string[]; entities: ZoneAwarenessEntity[] } {
  const visibleZones = getVisibleZones(currentZone)
  const normalizedVisible = new Set(visibleZones.map((z) => z.toLowerCase().trim()))

  const entities: ZoneAwarenessEntity[] = []
  for (const entity of ALL_ENTITIES) {
    if (!normalizedVisible.has(entity.zone.toLowerCase().trim())) continue

    let occupiedBy: string | null = null
    for (const apt of entity.actionPointTiles) {
      const who = occupiedTiles.get(`${apt[0]},${apt[1]}`)
      if (who) { occupiedBy = who; break }
    }

    entities.push({
      name: entity.name,
      entityType: entity.entityType,
      zone: entity.zone,
      tile: entity.tile,
      status: occupiedBy ? "occupied" : "available",
      occupiedBy,
      actionNames: entity.actions.map((a) => a.name),
    })
  }

  return { visibleZones, entities }
}

// ── Summary for agent context ─────────────────────────────────────────────────

export function summarizeAdvertisedActions(zoneName: string): object[] {
  return getAdvertisedActions(zoneName).map((a) => ({
    appliance: a.appliance,
    action: a.action,
    emoji: a.emoji,
    duration_sec: Math.round(a.durationMs / 1000),
    need_effects: a.needDeltas,
  }))
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
  durationSec: number
  needEffects: Record<string, number>   // delta × urgency contribution per need
  utilityScore: number                   // final ranked score
  actionPointTile: [number, number]
  distanceTiles: number | null
}

export function findActionsForNeeds(
  urgentNeeds: string[],
  originTile: [number, number] | null,
  k = 5,
  currentNeeds: Record<string, number> = {}  // 0–1 values from WorldState
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

        // urgency: how deprived is this need right now?
        const currentVal = currentNeeds[need] ?? 0  // default 0 = fully deprived
        const urgency = 1 - currentVal

        const weight = NEED_IMPORTANCE[need] ?? 1.0
        const contribution = delta * urgency * weight
        score += contribution
        relevantEffects[need] = Math.round(delta)
      }

      if (score === 0) continue

      const ap = entity.actionPointTiles[0] ?? entity.tile
      const dist = originTile ? tileDist(originTile, ap) : null

      // Proximity tiebreaker: up to 15% boost for objects within 30 tiles
      const proximityBonus = dist !== null ? Math.max(0, 1 - dist / 200) * 0.15 : 0
      const finalScore = score * (1 + proximityBonus)

      candidates.push({
        appliance: entity.name,
        action: action.name,
        emoji: action.emoji,
        zone: entity.zone,
        durationSec: Math.round(action.durationMs / 1000),
        needEffects: relevantEffects,
        utilityScore: Math.round(finalScore * 10) / 10,
        actionPointTile: ap,
        distanceTiles: dist !== null ? Math.round(dist * 10) / 10 : null,
      })
    }
  }

  return candidates
    .sort((a, b) => b.utilityScore - a.utilityScore)
    .slice(0, k)
}
