import "dotenv/config"
import express from "express"
import { NotionAgentsClient } from "@notionhq/agents-client"
import { WorldState } from "./simulation/WorldState.js"
import { StepWriter } from "./simulation/StepWriter.js"
import { runSimulation } from "./simulation/RoundLoop.js"
import { buildRoutes } from "./api/routes.js"
import { CHARACTER_NAMES } from "./agents/characters.js"
import { CHARACTER_PLANS, PLAN_ADHERENCE, INITIAL_CURRENTLY, ARRIVAL_TIMES } from "./simulation/character_plans.js"
import { logDecayRates } from "./simulation/needsDecay.js"
import initialNeedsJson from "./simulation/initial_needs.json" assert { type: "json" }
import { COMMUTE_STEPS } from "./simulation/CommuteSimulator.js"
import { SEC_PER_STEP } from "./simulation/config.js"

const INITIAL_NEEDS = initialNeedsJson as Record<string, Record<string, number>>

if (!process.env.NOTION_API_TOKEN) {
  console.error("NOTION_API_TOKEN not set")
  process.exit(1)
}

const client = new NotionAgentsClient({ auth: process.env.NOTION_API_TOKEN })

// ── World setup ───────────────────────────────────────────────────────────────

const SIM_START = new Date("2023-02-13T08:00:00")  // 8 AM — 31 min before first arrival (Dwight 8:31)
const SIM_START_MINUTES = SIM_START.getHours() * 60 + SIM_START.getMinutes()  // 480

logDecayRates()
const world = new WorldState(SIM_START, SEC_PER_STEP)

for (const [key] of Object.entries(CHARACTER_NAMES)) {
  const dayPlan = CHARACTER_PLANS[key] ?? []

  world.characters.set(key, {
    name: key,
    tile: [0, 0],            // off-screen until arrival; tickArrivals() places at parking spot
    action: "commuting",
    emoji: "🚗",
    animationKey: "idle_front",
    facing: "front",
    needs: { ...INITIAL_NEEDS[key] },
    pad: { pleasure: 0.0, arousal: 0.0, dominance: 0.0 },
    state: "pre_arrival",    // excluded from ticking until first plan block's startMin

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
    needsPerception: false,
    lastPerceptionStep: 0,

    // Commute starts COMMUTE_STEPS steps before the character's designated arrival time.
    // arrivalMin is minutes-since-midnight; subtract SIM_START_MINUTES to get sim-relative minutes,
    // then convert to steps.  Clamped to 0 so early arrivals start commuting from step 0.
    commuteStartStep: (() => {
      const arrivalMin = ARRIVAL_TIMES[key] ?? dayPlan[0]?.startMin ?? SIM_START_MINUTES
      const stepsToArrival = Math.round((arrivalMin - SIM_START_MINUTES) * 60 / SEC_PER_STEP)
      return Math.max(0, stepsToArrival - COMMUTE_STEPS)
    })(),
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
  const totalRounds = Number(req.body?.totalRounds ?? 3600)
  const delayBetweenRoundsMs = Number(req.body?.delayBetweenRoundsMs ?? 0)
  res.json({ ok: true, totalRounds, delayBetweenRoundsMs, message: "Simulation started" })

  simulationRunning = true
  const simCode = `run-${Date.now()}`
  const seed = Math.floor(Math.random() * 2 ** 32)
  const writer = new StepWriter({
    simCode,
    startSimTime: SIM_START.toISOString(),
    secPerStep: SEC_PER_STEP,
    characters: Object.keys(CHARACTER_NAMES),
    seed,
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
