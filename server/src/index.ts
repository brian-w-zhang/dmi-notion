import "dotenv/config"
import express from "express"
import { NotionAgentsClient } from "@notionhq/agents-client"
import { WorldState } from "./simulation/WorldState.js"
import { StepWriter } from "./simulation/StepWriter.js"
import { runSimulation } from "./simulation/RoundLoop.js"
import { buildRoutes } from "./api/routes.js"
import { CHARACTER_NAMES } from "./agents/characters.js"
import { CHARACTER_PLANS, PLAN_ADHERENCE, INITIAL_CURRENTLY } from "./simulation/character_plans.js"
import { logDecayRates } from "./simulation/needsDecay.js"

if (!process.env.NOTION_API_TOKEN) {
  console.error("NOTION_API_TOKEN not set")
  process.exit(1)
}

const client = new NotionAgentsClient({ auth: process.env.NOTION_API_TOKEN })

// ── World setup ───────────────────────────────────────────────────────────────

const SIM_START = new Date("2023-02-13T07:00:00")  // 7 AM — covers Dwight's early arrival
const SEC_PER_STEP = 300  // 5 sim minutes per round

logDecayRates()
const world = new WorldState(SIM_START, SEC_PER_STEP)

for (const [key] of Object.entries(CHARACTER_NAMES)) {
  const dayPlan = CHARACTER_PLANS[key] ?? []

  world.characters.set(key, {
    name: key,
    tile: [40, 20],          // placeholder — replace with actual desk/spawn positions
    action: "arriving at work",
    emoji: "🚶",
    animationKey: "walk_front",
    facing: "front",
    needs: {
      hunger:  0.80,
      thirst:  0.70,
      energy:  0.90,
      social:  0.50,
      bladder: 0.90,
      stress:  0.20,
    },
    state: "idle",            // starts idle; becomes active when plan begins

    // Planning
    dayPlan,
    planIndex: 0,
    planAdherence: PLAN_ADHERENCE[key] ?? 0.5,
    completedThisHour: [],

    // Memory
    dayLog: [],
    currently: INITIAL_CURRENTLY[key] ?? "Starting the day.",
    recentInteractions: {},

    plannedPath: [],
  })
}

// ── Express server ────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())
app.use("/", buildRoutes(world, client))

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`[Server] API on http://localhost:${PORT}`)
  console.log(`[Server] Expose with: ngrok http ${PORT}`)
})

// ── Step writer ───────────────────────────────────────────────────────────────

const writer = new StepWriter({
  simCode: `run-${Date.now()}`,
  startSimTime: SIM_START.toISOString(),
  secPerStep: SEC_PER_STEP,
  characters: Object.keys(CHARACTER_NAMES),
})

// ── Run simulation ────────────────────────────────────────────────────────────
// 50 rounds × 5 min/step = ~4 sim hours (7 AM → 11 AM)
// Increase totalRounds to cover more of the day.

await runSimulation(world, writer, client, {
  totalRounds: 50,
  delayBetweenRoundsMs: 0,
})

process.exit(0)
