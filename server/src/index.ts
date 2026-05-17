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
import initialNeedsJson from "./simulation/initial_needs.json" assert { type: "json" }
import { getParkedCarState } from "./simulation/CommuteSimulator.js"
import { getCharDeskPos, getCharDeskFacing } from "./simulation/WorldData.js"
import { SEC_PER_STEP, PERCEPTION_STAGGER } from "./simulation/config.js"

const INITIAL_NEEDS = initialNeedsJson as Record<string, Record<string, number>>

if (!process.env.NOTION_API_TOKEN) {
  console.error("NOTION_API_TOKEN not set")
  process.exit(1)
}

const client = new NotionAgentsClient({ auth: process.env.NOTION_API_TOKEN })

// ── World setup ───────────────────────────────────────────────────────────────

// Start at 10 AM — everyone already at their desk, cars parked, no arrival sequence.
const SIM_START = new Date("2023-02-13T10:00:00")

logDecayRates()
const world = new WorldState(SIM_START, SEC_PER_STEP)

const characterEntries = Object.entries(CHARACTER_NAMES)
const totalChars = characterEntries.length

// How far apart to space each character's fallback perception clock.
// Divides the fallback interval evenly across the cast so at most one or two
// characters hit the fallback threshold per step.
const PERCEPTION_FALLBACK_INTERVAL = 30  // must match RoundLoop.ts
const perceptionSpacing = PERCEPTION_STAGGER
  ? Math.floor(PERCEPTION_FALLBACK_INTERVAL / totalChars)
  : 0

for (const [charIndex, [key]] of characterEntries.entries()) {
  const dayPlan = CHARACTER_PLANS[key] ?? []
  const facing = getCharDeskFacing(key) as "front" | "back" | "left" | "right"
  const deskPos = getCharDeskPos(key) ?? [784, 720]

  // Negative offset pushes each character's internal clock back by a unique amount
  // so their fallback ticks fire at different steps (index 0 fires first, etc.).
  const perceptionOffset = charIndex * perceptionSpacing

  world.characters.set(key, {
    name: key,
    pos: deskPos,
    action: "sitting at desk",
    emoji: "💼",
    animationKey: `sit_${facing}`,
    facing,
    needs: { ...INITIAL_NEEDS[key] },
    pad: { pleasure: 0.0, arousal: 0.0, dominance: 0.0 },
    state: "active",

    // Planning
    dayPlan,
    planIndex: 0,
    planAdherence: PLAN_ADHERENCE[key] ?? 0.5,
    completedThisHour: [],

    // Memory
    dayLog: [],
    currently: INITIAL_CURRENTLY[key] ?? "Starting the day.",
    recentInteractions: {},

    path: [],
    needsPerception: true,   // perceive immediately on step 1
    lastPerceptionStep: -perceptionOffset,
    commuteStartStep: Number.MAX_SAFE_INTEGER,  // never triggers

    // Car already parked in designated spot
    carState: getParkedCarState(key) ?? undefined,
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
