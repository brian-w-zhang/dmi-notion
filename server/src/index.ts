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

let simulationRunning = false

const router = buildRoutes(world, client)

// POST /simulation/start — trigger the simulation manually
router.post("/simulation/start", async (req, res) => {
  if (simulationRunning) {
    res.status(409).json({ error: "Simulation already running" })
    return
  }
  const totalRounds = Number(req.body?.totalRounds ?? 50)
  const delayBetweenRoundsMs = Number(req.body?.delayBetweenRoundsMs ?? 0)
  res.json({ ok: true, totalRounds, delayBetweenRoundsMs, message: "Simulation started" })

  simulationRunning = true
  const writer = new StepWriter({
    simCode: `run-${Date.now()}`,
    startSimTime: SIM_START.toISOString(),
    secPerStep: SEC_PER_STEP,
    characters: Object.keys(CHARACTER_NAMES),
  })
  try {
    await runSimulation(world, writer, client, { totalRounds, delayBetweenRoundsMs })
  } finally {
    simulationRunning = false
  }
})

// GET /simulation/status
router.get("/simulation/status", (_req, res) => {
  res.json({
    running: simulationRunning,
    step: world.step,
    simTime: world.simTimeString(),
  })
})

app.use("/", router)

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`[Server] API on http://localhost:${PORT}`)
  console.log(`[Server] Expose with: ngrok http ${PORT}`)
  console.log(`[Server] POST /simulation/start to begin`)
})
