import fs from "fs"
import path from "path"
import type { StepFile, SimulationMeta } from "./types.js"

// Each simulation run writes step files to its own subfolder:
//   frontend/public/assets/simulation/steps/{simCode}/000001.json
//   frontend/public/assets/simulation/steps/{simCode}/meta.json
//
// Run buildReplay.ts after a simulation to convert a simCode folder into replay.json.

const SIM_DIR = path.resolve("../frontend/public/assets/simulation")
const STEPS_ROOT = path.join(SIM_DIR, "steps")

export class StepWriter {
  private readonly runDir: string
  private meta: SimulationMeta

  constructor(meta: Omit<SimulationMeta, "totalSteps">) {
    this.meta = { ...meta, totalSteps: 0 }
    this.runDir = path.join(STEPS_ROOT, meta.simCode)
    fs.mkdirSync(this.runDir, { recursive: true })
    this.writeMeta()
    console.log(`[StepWriter] Run dir: ${this.runDir}`)
  }

  write(step: StepFile) {
    const filename = String(step.step).padStart(6, "0") + ".json"
    fs.writeFileSync(path.join(this.runDir, filename), JSON.stringify(step))
    this.meta.totalSteps = step.step + 1
    this.writeMeta()
  }

  /** Absolute path to this run's directory — printed at startup so you can pass it to buildReplay. */
  get dir(): string { return this.runDir }

  private writeMeta() {
    fs.writeFileSync(path.join(this.runDir, "meta.json"), JSON.stringify(this.meta, null, 2))
  }
}
