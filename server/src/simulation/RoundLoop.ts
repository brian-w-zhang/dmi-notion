import { NotionAgentsClient } from "@notionhq/agents-client"
import { WorldState } from "./WorldState.js"
import { StepWriter } from "./StepWriter.js"
import { runTickRound, applyDecisions, runReflectionRound } from "../agents/orchestrator.js"

// Fallback: even if no event fires, perceive at least every N steps.
// Prevents characters from going completely dark during long uninterrupted activity.
const PERCEPTION_FALLBACK_INTERVAL = 30    // ~5 sim minutes at sec_per_step=10

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
  console.log(`Perception: event-driven + fallback every ${PERCEPTION_FALLBACK_INTERVAL} steps`)
  console.log(`Sim time start: ${world.simTime.toISOString()}`)
  console.log(`${"═".repeat(60)}\n`)

  // Initialize to current hour so reflection fires at end of hour, not immediately.
  let lastReflectionHour = Math.floor(world.simMinutes / 60)

  for (let round = 0; round < totalRounds; round++) {
    const roundStart = Date.now()

    // ── 1. Physics (every tick) ───────────────────────────────────────────────
    world.advancePhysics()

    // ── 2. Arrivals + appliance expiry (sets needsPerception flags) ───────────
    // (handled inside advanceStep → tickArrivals + tickApplianceLocks)

    // ── 3. Event-driven cognition ─────────────────────────────────────────────
    // Collect characters that need perception this step (event-triggered or fallback).
    // Skip fallback tick for locked appliance users — they can't take new actions;
    // needsPerception will fire when the lock expires naturally.
    const toTick = world.getActiveCharacters().filter((c) => {
      if (c.needsPerception) return true
      if (c.state === "using_appliance") return false   // skip fallback; lock handles it
      if (c.path.length > 0) return false        // skip fallback while walking; arrival fires needsPerception
      if (world.step - c.lastPerceptionStep >= PERCEPTION_FALLBACK_INTERVAL) return true
      return false
    })

    if (toTick.length > 0) {
      const keys = toTick.map(c => c.name)
      console.log(`\n[Step ${world.step}] Perception for: ${keys.join(", ")}`)
      const decisions = await runTickRound(world, client, keys)
      applyDecisions(decisions, world, client)

      // Clear flags and record perception step
      for (const c of toTick) {
        c.needsPerception = false
        c.lastPerceptionStep = world.step
      }
    }

    // ── 4. Advance clock + flush ──────────────────────────────────────────────
    const { completedConversations, completedGroupConversations, announcements, events } = world.advanceStep()

    // ── 5. End-of-hour reflections (fire-and-forget) ─────────────────────────
    const currentHour = Math.floor(world.simMinutes / 60)
    if (currentHour !== lastReflectionHour) {
      lastReflectionHour = currentHour
      runReflectionRound(world, client, "end_of_hour").catch((err) =>
        console.error("[RoundLoop] reflection round failed:", err)
      )
    }

    // ── 6. Write step file ────────────────────────────────────────────────────
    const stepFile = world.toStepFile(completedConversations, completedGroupConversations, announcements, events)
    writer.write(stepFile)

    const tag = toTick.length > 0 ? ` [perception: ${toTick.map(c => c.name).join(",")}]` : ""
    console.log(`  [Step ${stepFile.step}] sim=${world.simTimeString()}${tag}`)

    // ── 7. Breathing room ─────────────────────────────────────────────────────
    const elapsed = Date.now() - roundStart
    const wait = Math.max(0, delayBetweenRoundsMs - elapsed)
    if (wait > 0) await sleep(wait)
  }

  console.log(`\n${"═".repeat(60)}`)
  console.log(`Simulation complete. ${totalRounds} steps written.`)
  console.log(`Run dir: ${writer.dir}`)
  console.log(`Rebuild replay:  npx tsx src/scripts/buildReplay.ts ${writer.dir}`)
  console.log(`${"═".repeat(60)}\n`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
