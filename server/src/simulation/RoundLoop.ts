import { NotionAgentsClient } from "@notionhq/agents-client"
import { WorldState } from "./WorldState.js"
import { StepWriter } from "./StepWriter.js"
import { runTickRound, applyDecisions } from "../agents/orchestrator.js"

interface RoundLoopOptions {
  totalRounds: number
  delayBetweenRoundsMs?: number  // breathing room between rounds
}

export async function runSimulation(
  world: WorldState,
  writer: StepWriter,
  client: NotionAgentsClient,
  opts: RoundLoopOptions
) {
  const { totalRounds, delayBetweenRoundsMs = 1000 } = opts

  console.log(`\n${"═".repeat(60)}`)
  console.log(`Starting simulation: ${totalRounds} rounds`)
  console.log(`Sim time start: ${world.simTime.toISOString()}`)
  console.log(`${"═".repeat(60)}\n`)

  for (let round = 0; round < totalRounds; round++) {
    const roundStart = Date.now()

    // 1. Snapshot → tick all active characters in parallel
    const decisions = await runTickRound(world, client)

    // 2. Apply decisions (spawns conversation flows async for talk actions)
    applyDecisions(decisions, world, client)

    // 3. Advance clock, flush completed conversations and events into step file
    const { completedConversations, events } = world.advanceStep()

    // 4. Write step file — Phaser reads this for replay
    const stepFile = world.toStepFile(completedConversations, events)
    writer.write(stepFile)
    console.log(`  [Step ${stepFile.step}] written — sim time: ${stepFile.simTime}`)

    // 5. Breathing room
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
