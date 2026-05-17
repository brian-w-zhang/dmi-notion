import fs from "fs"
import path from "path"
import type { StepFile, SimulationMeta } from "./types.js"

// Writes step files to frontend/public/assets/simulation/steps/
// Phaser reads them as static assets for replay.
const SIM_DIR = path.resolve("../frontend/public/assets/simulation")
const STEPS_DIR = path.join(SIM_DIR, "steps")
const META_PATH = path.join(SIM_DIR, "meta.json")

export class StepWriter {
  private meta: SimulationMeta

  constructor(meta: Omit<SimulationMeta, "totalSteps">) {
    this.meta = { ...meta, totalSteps: 0 }
    fs.mkdirSync(STEPS_DIR, { recursive: true })
    this.writeMeta()
    console.log(`[StepWriter] Writing to ${SIM_DIR}`)
  }

  write(step: StepFile) {
    const filename = String(step.step).padStart(6, "0") + ".json"
    fs.writeFileSync(path.join(STEPS_DIR, filename), JSON.stringify(step, null, 2))
    this.meta.totalSteps = step.step + 1
    this.writeMeta()
  }

  private writeMeta() {
    fs.writeFileSync(META_PATH, JSON.stringify(this.meta, null, 2))
  }
}
