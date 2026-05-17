import { Router } from "express"
import type { NotionAgentsClient } from "@notionhq/agents-client"
import type { WorldState } from "../simulation/WorldState.js"
import {
  getAdvertisedActions, getAllZonesWithActions, getActionNeedDeltas,
  getEntitiesNearby, getZoneAwareness, inferZoneFromTile, findActionsForNeeds,
} from "../simulation/WorldData.js"
import { CHARACTER_NAMES } from "../agents/characters.js"
import { applyDecisions } from "../agents/orchestrator.js"

function tileDist(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
}

export function buildRoutes(world: WorldState, client: NotionAgentsClient): Router {
  const router = Router()

  // ── Health ──────────────────────────────────────────────────────────────────

  router.get("/health", (_req, res) => {
    res.json({ ok: true, step: world.step, simTime: world.simTimeString() })
  })

  // ── World state ─────────────────────────────────────────────────────────────

  router.get("/world-state", (_req, res) => {
    res.json(world.getSnapshot())
  })

  router.get("/world-state/:character", (req, res) => {
    try {
      const c = world.getCharacter(req.params.character)
      res.json(c)
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  router.get("/nearby/:character", (req, res) => {
    try {
      const radius = Number(req.query.radius ?? 5)
      const nearby = world.getNearby(req.params.character, radius)
      res.json(nearby)
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  // ── Planning ────────────────────────────────────────────────────────────────

  router.get("/plan/:character", (req, res) => {
    try {
      const c = world.getCharacter(req.params.character)
      res.json({
        dayPlan: c.dayPlan,
        planIndex: c.planIndex,
        planAdherence: c.planAdherence,
        currentBlock: world.getCurrentPlanBlock(req.params.character) ?? null,
        nextBlock: world.getNextPlanBlock(req.params.character) ?? null,
      })
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  // ── Day log ─────────────────────────────────────────────────────────────────

  router.get("/day-log/:character", (req, res) => {
    try {
      const c = world.getCharacter(req.params.character)
      res.json({
        character: req.params.character,
        simTime: world.simTimeString(),
        currently: c.currently,
        log: c.dayLog,
        completedThisHour: c.completedThisHour,
      })
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  router.get("/day-log/:character/recent", (req, res) => {
    try {
      const count = Number(req.query.count ?? 5)
      res.json(world.getRecentLog(req.params.character, count))
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  // ── Perception ──────────────────────────────────────────────────────────────
  // Single call for a character's full spatial awareness:
  //   - nearby characters (with their current action + needs summary)
  //   - nearby objects (appliances, chairs, desks) with available actions + occupied state
  // This is what agents should call at the start of every decision cycle.

  router.get("/perception/:character", (req, res) => {
    try {
      const charKey = req.params.character
      // Radius for vision layer — full detail on nearby objects. Default 10 tiles.
      const radius = Number(req.query.radius ?? 10)
      const c = world.getCharacter(charKey)

      // Build occupied-tile map from all character positions (used by both layers)
      const occupiedTiles = new Map<string, string>()
      for (const [key, other] of world.characters) {
        if (key === charKey) continue
        occupiedTiles.set(`${other.tile[0]},${other.tile[1]}`, key)
      }

      // Infer current zone from tile position
      const currentZone = inferZoneFromTile(c.tile)

      // ── Layer 1: Zone awareness (coarse) ────────────────────────────────────
      // Everything in your zone + connected zones — name, status, action names only.
      const zoneAwareness = getZoneAwareness(currentZone, occupiedTiles)

      // Characters in visible zones (zone-level awareness, not just nearby)
      const zoneCharacters = [...world.characters.values()]
        .filter((other) => {
          if (other.name === charKey) return false
          const otherZone = inferZoneFromTile(other.tile)
          return zoneAwareness.visibleZones
            .map((z) => z.toLowerCase().trim())
            .includes(otherZone.toLowerCase().trim())
        })
        .map((other) => ({
          key: other.name,
          name: CHARACTER_NAMES[other.name] ?? other.name,
          zone: inferZoneFromTile(other.tile),
          tile: other.tile,
          action: other.action,
          emoji: other.emoji,
          state: other.state,
          currently: other.currently,
          on_cooldown: world.isOnCooldown(charKey, other.name),
          in_conversation: other.state === "in_conversation",
        }))

      // ── Layer 2: Radius vision (full detail) ────────────────────────────────
      // Objects within N tiles — complete action list, need effects, exact tile.
      const visionObjects = getEntitiesNearby(c.tile, radius, occupiedTiles)

      // Characters within vision radius get additional detail (urgent needs)
      const visionCharacters = world.getNearby(charKey, radius).map((n) => ({
        key: n.name,
        name: CHARACTER_NAMES[n.name] ?? n.name,
        tile: n.tile,
        distance_tiles: Math.round(tileDist(c.tile, n.tile) * 10) / 10,
        urgent_needs: Object.entries(n.needs).filter(([, v]) => v < 0.3).map(([k]) => k),
      }))

      res.json({
        character: charKey,
        tile: c.tile,
        current_zone: currentZone,
        sim_time: world.simTimeString(),
        step: world.step,

        // Zone awareness — what you know about your surroundings at a high level
        zone_awareness: {
          visible_zones: zoneAwareness.visibleZones,
          characters: zoneCharacters,
          entities: zoneAwareness.entities,
          free_appliances: zoneAwareness.entities
            .filter((e) => e.entityType === "appliance" && e.status === "available" && e.actionNames.length > 0)
            .map((e) => ({ name: e.name, zone: e.zone, actions: e.actionNames })),
        },

        // Vision radius — full detail on what's immediately around you
        vision: {
          radius_tiles: radius,
          objects: visionObjects,
          characters: visionCharacters,
        },

        // Quick summary for decision-making
        summary: {
          current_zone: currentZone,
          can_approach: zoneCharacters
            .filter((n) => !n.on_cooldown && !n.in_conversation)
            .map((n) => n.key),
          free_appliances_in_zone: zoneAwareness.entities
            .filter((e) => e.entityType === "appliance" && e.status === "available" && e.actionNames.length > 0)
            .map((e) => e.name),
          detailed_objects_in_vision: visionObjects
            .filter((e) => e.availableActions.length > 0)
            .map((e) => e.name),
        },
      })
    } catch (err: any) {
      res.status(404).json({ error: err.message ?? "Character not found" })
    }
  })

  // ── Advertised actions ──────────────────────────────────────────────────────
  // Workers call this to know what actions are available in a zone.

  router.get("/advertised-actions", (_req, res) => {
    res.json({ zones: getAllZonesWithActions() })
  })

  router.get("/advertised-actions/:zone", (req, res) => {
    const zone = decodeURIComponent(req.params.zone)
    const actions = getAdvertisedActions(zone)
    if (actions.length === 0) {
      return res.json({ zone, actions: [], note: "No actions defined for this zone" })
    }
    res.json({ zone, actions })
  })

  // ── Needs-based action lookup ───────────────────────────────────────────────
  // Returns the K most relevant appliance actions for a set of urgent needs.
  // Agents call this when need urgency should drive navigation, not the plan.
  // ?needs=hunger,thirst&k=5&character=jim (character optional, used for proximity)

  router.get("/actions-for-needs", (req, res) => {
    const needsParam = String(req.query.needs ?? "")
    const urgentNeeds = needsParam.split(",").map((s) => s.trim()).filter(Boolean)
    const k = Number(req.query.k ?? 5)
    const charKey = req.query.character as string | undefined

    if (urgentNeeds.length === 0) {
      return res.status(400).json({ error: "Provide at least one need via ?needs=hunger,thirst" })
    }

    let originTile: [number, number] | null = null
    if (charKey) {
      try {
        originTile = world.getCharacter(charKey).tile
      } catch { /* ignore unknown character */ }
    }

    const results = findActionsForNeeds(urgentNeeds, originTile, k)
    res.json({ urgent_needs: urgentNeeds, results })
  })

  // ── Action submission ───────────────────────────────────────────────────────
  // Primary write endpoint. Workers call this to submit a character's decision.
  //
  // Supported action types:
  //   continue          — keep doing current action, no state change
  //   idle              — character is idle
  //   move_to           — move toward a zone or locationId (target required)
  //   use_appliance     — interact with an appliance, apply need deltas
  //                       (target = appliance name, appliance_action = action name)
  //   initiate_conversation — start a conversation with another character
  //                           (want_to_talk = { character_key, opening_topic })

  router.post("/action", (req, res) => {
    const {
      character,
      action,
      target,
      description,
      emoji,
      follow_plan,
      deviation_reason,
      update_currently,
      want_to_talk,
      appliance_action,
    } = req.body as {
      character: string
      action: "continue" | "move_to" | "use_appliance" | "initiate_conversation" | "idle"
      target?: string
      description: string
      emoji: string
      follow_plan: boolean
      deviation_reason?: string
      update_currently?: string
      want_to_talk?: { character_key: string; opening_topic: string }
      appliance_action?: string  // action name within the appliance (e.g. "buy snack")
    }

    try {
      const c = world.getCharacter(character)

      // Update living status if notable
      if (update_currently) {
        world.updateCurrently(character, update_currently)
      }

      // Log deviation as world event
      if (!follow_plan && deviation_reason) {
        world.addEvent({ type: "deviation", character, detail: deviation_reason })
      }

      // ── Handle each action type ──────────────────────────────────────────

      if (action === "move_to" && target) {
        const ok = world.setDestination(character, target)
        if (!ok) {
          console.warn(`  [${character}] move_to: unknown locationId "${target}"`)
        } else {
          console.log(`  → ${character} moving to ${target} (${c.plannedPath.length} tiles)`)
        }
      }

      else if (action === "use_appliance" && target) {
        const actionName = appliance_action ?? description
        const deltas = getActionNeedDeltas(target, actionName)
        if (deltas) {
          world.applyNeedDeltas(character, deltas)
          console.log(`  → ${character} used ${target}:${actionName} — deltas applied`)
        } else {
          console.warn(`  [${character}] use_appliance: no need deltas found for ${target}:${actionName}`)
        }
      }

      else if (action === "initiate_conversation" && want_to_talk) {
        const targetKey = want_to_talk.character_key
        const targetChar = world.characters.get(targetKey)

        if (!targetChar) {
          console.warn(`  [${character}] tried to talk to unknown character: ${targetKey}`)
        } else if (targetChar.state !== "active" && targetChar.state !== "idle") {
          console.log(`  [${character}] wanted to talk to ${targetKey} but they're ${targetChar.state}`)
        } else if (world.isOnCooldown(character, targetKey)) {
          console.log(`  [${character}] on cooldown with ${targetKey}`)
        } else {
          // Delegate to applyDecisions via a synthetic single-entry map
          const decision = {
            follow_plan,
            action: "initiate_conversation" as const,
            target,
            description,
            emoji,
            reasoning: deviation_reason ?? "worker-initiated",
            deviation_reason,
            update_currently,
            want_to_talk,
          }
          applyDecisions(new Map([[character, decision]]), world, client)
          res.json({ ok: true, conversation_started: true, simTime: world.simTimeString() })
          return
        }
      }

      // Apply action label + emoji to character state
      c.action = description
      c.emoji = emoji

      // Log the action entry
      world.pushLogEntry(character, {
        type: "action",
        action,
        description,
        locationId: target ?? c.tile.join(","),
        startMin: world.simMinutes,
        endMin: world.simMinutes + world.secPerStep / 60,
        followedPlan: follow_plan,
        deviationReason: deviation_reason,
      })

      res.json({
        ok: true,
        simTime: world.simTimeString(),
        currentPlanBlock: world.getCurrentPlanBlock(character) ?? null,
        needs: c.needs,
      })
    } catch (err: any) {
      res.status(404).json({ error: err.message ?? "Character not found" })
    }
  })

  // ── Phaser callbacks ────────────────────────────────────────────────────────

  router.post("/action-complete", (req, res) => {
    const { character, action } = req.body as { character: string; action: string }
    try {
      const c = world.getCharacter(character)
      world.addEvent({ type: "action_complete", character, detail: action })
      res.json({ ok: true, nextAction: c.action })
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  router.post("/position", (req, res) => {
    const { character, tile } = req.body as { character: string; tile: [number, number] }
    try {
      const c = world.getCharacter(character)
      c.tile = tile
      res.json({ ok: true })
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  return router
}
