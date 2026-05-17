import { Router } from "express"
import type { WorldState } from "../simulation/WorldState.js"

// HTTP endpoints that Notion Workers call to query world state.
// Workers need a publicly accessible URL (use ngrok in dev):
//   ngrok http 3001  →  set GAME_SERVER_URL=https://xxx.ngrok.io in workers/.env

export function buildRoutes(world: WorldState): Router {
  const router = Router()

  // Full snapshot — workers call this for general context
  router.get("/world-state", (_req, res) => {
    res.json(world.getSnapshot())
  })

  // Single character state
  router.get("/world-state/:character", (req, res) => {
    try {
      const c = world.getCharacter(req.params.character)
      res.json(c)
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  // Nearby characters — primary worker tool
  router.get("/nearby/:character", (req, res) => {
    try {
      const radius = Number(req.query.radius ?? 5)
      const nearby = world.getNearby(req.params.character, radius)
      res.json(nearby)
    } catch {
      res.status(404).json({ error: "Character not found" })
    }
  })

  // Health check
  router.get("/health", (_req, res) => res.json({ ok: true, step: world.step }))

  return router
}
