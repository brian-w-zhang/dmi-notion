import { Router } from "express"
import type { WorldState } from "../simulation/WorldState.js"

// HTTP endpoints — Notion Workers call these to query world state.
// In dev: expose with ngrok http 3001, set GAME_SERVER_URL in workers/.env

export function buildRoutes(world: WorldState): Router {
  const router = Router()

  // ── Health ──────────────────────────────────────────────────────────────────

  router.get("/health", (_req, res) => {
    res.json({ ok: true, step: world.step, simTime: world.simTimeString() })
  })

  // ── World state ─────────────────────────────────────────────────────────────

  // Full snapshot of all characters
  router.get("/world-state", (_req, res) => {
    res.json(world.getSnapshot())
  })

  // Single character live state
  router.get("/world-state/:character", (req, res) => {
    try {
      const c = world.getCharacter(req.params.character)
      res.json(c)
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  // Nearby characters — primary worker perception tool
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

  // Full day plan + current block for a character
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

  // Full day log for a character (for dashboard + talking head context)
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

  // Recent log only (last N entries) — lighter call for workers
  router.get("/day-log/:character/recent", (req, res) => {
    try {
      const count = Number(req.query.count ?? 5)
      res.json(world.getRecentLog(req.params.character, count))
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  // ── Phaser action callbacks ─────────────────────────────────────────────────
  // Phaser POSTs here when a character finishes an action animation.
  // Server can use this to advance state or trigger next tick early.

  router.post("/action-complete", (req, res) => {
    const { character, action } = req.body as { character: string; action: string }
    try {
      const c = world.getCharacter(character)
      world.addEvent({ type: "action_complete", character, detail: action })
      console.log(`[Action complete] ${character}: ${action}`)
      res.json({ ok: true, nextAction: c.action })
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  // Phaser POSTs here to update a character's tile position
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
