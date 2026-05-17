import "dotenv/config"
import express from "express"
import { NotionAgentsClient } from "@notionhq/agents-client"
import { WorldState } from "./simulation/WorldState.js"
import { StepWriter } from "./simulation/StepWriter.js"
import { runSimulation } from "./simulation/RoundLoop.js"
import { buildRoutes } from "./api/routes.js"
import { CHARACTER_NAMES } from "./agents/characters.js"

if (!process.env.NOTION_API_TOKEN) {
  console.error("NOTION_API_TOKEN not set")
  process.exit(1)
}

const client = new NotionAgentsClient({ auth: process.env.NOTION_API_TOKEN })

// ── World setup ───────────────────────────────────────────────────────────────
// TODO: load initial positions from office-objects.json / character_seeds.json
// For now: seed characters at placeholder tiles

const SIM_START = new Date("2023-02-13T09:00:00")
const SEC_PER_STEP = 300  // 5 sim minutes per round

const world = new WorldState(SIM_START, SEC_PER_STEP)

for (const [key, displayName] of Object.entries(CHARACTER_NAMES)) {
  world.characters.set(key, {
    name: key,
    tile: [40, 20],       // placeholder — replace with actual desk positions
    action: "arriving at work",
    emoji: "🚶",
    animationKey: "walk_front",
    facing: "front",
    needs: {
      hunger: 0.8, thirst: 0.7, energy: 0.9,
      social: 0.5, bladder: 0.9, stress: 0.3,
    },
    state: "active",
    plannedPath: [],
    currentPlanBlock: "morning routine",
  })
}

// ── Express server (for worker callbacks) ─────────────────────────────────────

const app = express()
app.use(express.json())
app.use("/", buildRoutes(world))

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`[Server] Worker API listening on http://localhost:${PORT}`)
  console.log(`[Server] For workers: expose with ngrok http ${PORT}`)
})

// ── Writer ────────────────────────────────────────────────────────────────────

const writer = new StepWriter({
  simCode: `run-${Date.now()}`,
  startSimTime: SIM_START.toISOString(),
  secPerStep: SEC_PER_STEP,
  characters: Object.keys(CHARACTER_NAMES),
})

// ── Run simulation ────────────────────────────────────────────────────────────

await runSimulation(world, writer, client, {
  totalRounds: 50,          // ~4 sim hours at 5 min/step
  delayBetweenRoundsMs: 0,  // go as fast as possible
})

process.exit(0)
