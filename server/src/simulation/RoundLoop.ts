import { NotionAgentsClient } from "@notionhq/agents-client"
import { WorldState } from "./WorldState.js"
import { StepWriter } from "./StepWriter.js"
import { runTickRound, applyDecisions } from "../agents/orchestrator.js"

// Agents are called every PERCEPTION_INTERVAL ticks.
// Between calls, characters follow their last decision (path + action).
const PERCEPTION_INTERVAL = 5

interface RoundLoopOptions {
  totalRounds: number
  delayBetweenRoundsMs?: number
}

export async function runSimulation(
  world: WorldState,
  writer: StepWriter,
  client: NotionAgentsClient,
  opts: RoundLoopOptions
) {
  const { totalRounds, delayBetweenRoundsMs = 500 } = opts

  console.log(`\n${"═".repeat(60)}`)
  console.log(`Starting simulation: ${totalRounds} rounds`)
  console.log(`Perception interval: every ${PERCEPTION_INTERVAL} ticks`)
  console.log(`Sim time start: ${world.simTime.toISOString()}`)
  console.log(`${"═".repeat(60)}\n`)

  for (let round = 0; round < totalRounds; round++) {
    const roundStart = Date.now()

    // ── 1. Physics (every tick) ───────────────────────────────────────────────
    world.advancePhysics()

    // ── 2. Cognition (every N ticks) ──────────────────────────────────────────
    if (round % PERCEPTION_INTERVAL === 0) {
      console.log(`\n[Perception round ${round}/${totalRounds}] Calling agents...`)
      const decisions = await runTickRound(world, client)
      applyDecisions(decisions, world, client)
    }

    // ── 3. Advance clock + flush ──────────────────────────────────────────────
    const { completedConversations, events } = world.advanceStep()

    // ── 4. Write step file ────────────────────────────────────────────────────
    const stepFile = world.toStepFile(completedConversations, events)
    writer.write(stepFile)

    const tag = round % PERCEPTION_INTERVAL === 0 ? " [perception]" : ""
    console.log(`  [Step ${stepFile.step}] sim=${world.simTimeString()}${tag}`)

    // ── 5. Breathing room ─────────────────────────────────────────────────────
    const elapsed = Date.now() - roundStart
    const wait = Math.max(0, delayBetweenRoundsMs - elapsed)
    if (wait > 0) await sleep(wait)
  }

  console.log(`\n${"═".repeat(60)}`)
  console.log(`Simulation complete. ${totalRounds} steps written.`)
  console.log(`${"═".repeat(60)}\n`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
