/**
 * buildReplay.ts
 *
 * Converts a simulation run folder into replay.json for the Phaser frontend.
 *
 * Usage:
 *   npx tsx src/scripts/buildReplay.ts <stepsDir>
 *   npx tsx src/scripts/buildReplay.ts ../frontend/public/assets/simulation/steps/run-1234567890
 *
 * Output: frontend/public/assets/simulation/replay.json
 *
 * replay.json schema (multi-character, no car):
 * {
 *   meta: {
 *     ms_per_step: number        // playback speed in ms per step
 *     sec_per_step: number       // sim seconds per step (e.g. 300 = 5 min)
 *     sim_code: string
 *     start_sim_time: string     // ISO timestamp
 *     characters: string[]       // character keys in this run
 *   }
 *   steps: SimReplayStep[]
 * }
 *
 * SimReplayStep:
 * {
 *   step: number
 *   sim_time: string             // human-readable e.g. "09:00 AM"
 *   chars: Record<string, CharReplayState>
 *   conversations: ConversationRecord[]
 *   announcements: { from: string; message: string }[]
 *   events: WorldEvent[]
 * }
 *
 * CharReplayState:
 * {
 *   x: number                   // pixel x (feet position)
 *   y: number                   // pixel y (feet position)
 *   facing: 'front' | 'back' | 'left' | 'right'
 *   anim: 'walk' | 'idle' | 'sit'
 *   visible: boolean
 *   action: string
 *   emoji: string
 *   currently: string
 *   state: string
 *   needs: Record<string, number>
 *   pad: { pleasure: number; arousal: number; dominance: number }
 *   thinking?: string
 * }
 */

import fs from "fs"
import path from "path"

const TILE_SIZE = 32
const OUTPUT_PATH = path.resolve("../frontend/public/assets/simulation/replay.json")
const MS_PER_STEP = 5000   // 5 seconds per step → ~10 min for a full workday (120 steps)

// --------------------------------------------------------------------------

function tileToPixel(tile: [number, number]): { x: number; y: number } {
  return {
    x: tile[0] * TILE_SIZE + TILE_SIZE / 2,   // center of tile column
    y: (tile[1] + 1) * TILE_SIZE,              // bottom of tile row (sprite origin = feet)
  }
}

function animBase(animationKey: string): "walk" | "idle" | "sit" {
  if (animationKey.startsWith("walk")) return "walk"
  if (animationKey.startsWith("sit"))  return "sit"
  return "idle"
}

// --------------------------------------------------------------------------

const stepsDir = process.argv[2]
if (!stepsDir) {
  console.error("Usage: npx tsx src/scripts/buildReplay.ts <stepsDir>")
  process.exit(1)
}

const absStepsDir = path.resolve(stepsDir)
if (!fs.existsSync(absStepsDir)) {
  console.error(`Steps dir not found: ${absStepsDir}`)
  process.exit(1)
}

const metaPath = path.join(absStepsDir, "meta.json")
if (!fs.existsSync(metaPath)) {
  console.error(`meta.json not found in ${absStepsDir}`)
  process.exit(1)
}

const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
console.log(`[buildReplay] simCode=${meta.simCode}  steps=${meta.totalSteps}  chars=${meta.characters?.length ?? "?"}`)

// Read and sort step files
const stepFiles = fs
  .readdirSync(absStepsDir)
  .filter(f => /^\d{6}\.json$/.test(f))
  .sort()

if (stepFiles.length === 0) {
  console.error("No step files found.")
  process.exit(1)
}

console.log(`[buildReplay] Found ${stepFiles.length} step file(s)`)

const replaySteps = stepFiles.map(filename => {
  const raw = JSON.parse(fs.readFileSync(path.join(absStepsDir, filename), "utf-8"))

  const simTimeISO: string = raw.simTime ?? ""
  const simTime = simTimeISO
    ? new Date(simTimeISO).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "??"

  const chars: Record<string, object> = {}
  for (const [key, c] of Object.entries(raw.characters as Record<string, any>)) {
    const { x, y } = tileToPixel(c.tile as [number, number])
    chars[key] = {
      x,
      y,
      facing:    c.facing    ?? "front",
      anim:      animBase(c.animationKey ?? "idle_front"),
      visible:   c.state !== "blocked",
      action:    c.action    ?? "",
      emoji:     c.emoji     ?? "",
      currently: c.currently ?? "",
      state:     c.state     ?? "active",
      needs:     c.needs     ?? {},
      pad:       c.pad       ?? { pleasure: 0, arousal: 0, dominance: 0 },
      thinking:  c.thinking  ?? undefined,
    }
  }

  return {
    step:          raw.step,
    sim_time:      simTime,
    chars,
    conversations:  raw.conversations  ?? [],
    announcements:  raw.announcements  ?? [],
    events:         raw.events         ?? [],
  }
})

const replay = {
  meta: {
    ms_per_step:     MS_PER_STEP,
    sec_per_step:    meta.secPerStep,
    sim_code:        meta.simCode,
    start_sim_time:  meta.startSimTime,
    characters:      meta.characters ?? [],
  },
  steps: replaySteps,
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(replay, null, 2))
console.log(`[buildReplay] Written to ${OUTPUT_PATH}`)
console.log(`[buildReplay] ${replaySteps.length} steps, ${Object.keys(replaySteps[0]?.chars ?? {}).length} characters`)
