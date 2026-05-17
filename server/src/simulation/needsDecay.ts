import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { TICKS_PER_DAY } from "./config.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, "../../../frontend/public/data")

// ── Load source data ──────────────────────────────────────────────────────────

interface Personality { o: number; c: number; e: number; a: number; n: number }
type NeedOverrides = Record<string, Record<string, { decay?: { kMultiplier: number } }>>

const PERSONALITIES: Record<string, Personality> = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "personalities.json"), "utf-8")
)
const OVERRIDES: NeedOverrides = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "character_need_overrides.json"), "utf-8")
)

// ── Time unit ─────────────────────────────────────────────────────────────────
// Sim day = 9 hours. Each tick = 5 sim minutes → 108 ticks per day.
// All base rates below are "units drained per full day at decay_rate 1.0".
// Per-tick rate = base / TICKS_PER_DAY × kMultiplier.


// ── Base decay rates ──────────────────────────────────────────────────────────

// Biological — fixed, independent of personality.
// Number = fraction of need drained over one full sim day at kMultiplier 1.0.
const BIOLOGICAL_BASE: Record<string, number> = {
  hunger:  0.80,   // empty after ~6.75 hours without eating
  thirst:  1.20,   // empty after ~4.5 hours without drinking
  bladder: 0.90,   // urgent after ~6 hours (starting full)
  energy:  0.40,   // gradually tires over the day
}

// Social/psychological — base rate before OCEAN scaling.
// Used for needs without a direct OCEAN formula; kMultipliers carry the differentiation.
const PSYCH_BASE: Record<string, number> = {
  belonging:   0.50,
  esteem:      0.40,
  fulfillment: 0.30,
}

// ── OCEAN formulas (from planning/personality-ideas.MD) ───────────────────────

function oceanDecayRate(need: string, p: Personality): number | null {
  switch (need) {
    // Social scaled up ~3× so urgency builds within 30–50 sim minutes at the office.
    // At SEC_PER_STEP=10, TICKS_PER_DAY=3240; old range 0.3–2.0, new range 1.2–5.5.
    // Dwight (e≈0.7): 1.2+1.75=2.95 → drops 0.3 units in ~305 steps ≈ 50 sim min.
    // Kelly (e≈0.9): 1.2+2.25=3.45 → drops 0.3 units in ~260 steps ≈ 43 sim min.
    case "social":       return 1.2 + p.e * 2.5
    case "productivity": return 0.1 + p.c * 1.5   // conscientiousness → productivity urgency
    case "stimulation":  return 0.3 + p.o * 1.2   // openness → boredom rate
    default:             return null
  }
}

// ── Global multiplier — scale all decay rates uniformly ──────────────────────
const GLOBAL_DECAY_MULTIPLIER = 2.0

// ── Pre-compute per-character, per-need decay rates ───────────────────────────
// Computed once at startup. Shape: characterKey → needKey → decayPerTick.

export const CHARACTER_DECAY_RATES: Record<string, Record<string, number>> = {}

for (const [charKey, p] of Object.entries(PERSONALITIES)) {
  const rates: Record<string, number> = {}
  const overrides = OVERRIDES[charKey] ?? {}

  // Biological needs
  for (const [need, base] of Object.entries(BIOLOGICAL_BASE)) {
    const km = overrides[need]?.decay?.kMultiplier ?? 1.0
    rates[need] = (base / TICKS_PER_DAY) * km * GLOBAL_DECAY_MULTIPLIER
  }

  // OCEAN-derived psychological needs
  for (const need of ["social", "productivity", "stimulation"]) {
    const base = oceanDecayRate(need, p)!
    const km = overrides[need]?.decay?.kMultiplier ?? 1.0
    rates[need] = (base / TICKS_PER_DAY) * km * GLOBAL_DECAY_MULTIPLIER
  }

  // Fixed-base psychological needs (kMultiplier provides differentiation)
  for (const [need, base] of Object.entries(PSYCH_BASE)) {
    const km = overrides[need]?.decay?.kMultiplier ?? 1.0
    rates[need] = (base / TICKS_PER_DAY) * km * GLOBAL_DECAY_MULTIPLIER
  }

  // Event-driven — no time decay (per needs-model.md)
  rates["stress"] = 0
  rates["health"] = 0

  CHARACTER_DECAY_RATES[charKey] = rates
}

// ── Decay function ────────────────────────────────────────────────────────────
// Call once per physics tick. Mutates the needs object in place.
// Only decays needs that actually exist on the character (WorldState initialisation
// controls which needs are tracked — not all characters track all needs).

export function decayNeeds(characterKey: string, needs: Record<string, number>): void {
  const rates = CHARACTER_DECAY_RATES[characterKey]
  if (!rates) return  // character has no personality data (e.g. darryl) — skip

  for (const [need, rate] of Object.entries(rates)) {
    if (Object.prototype.hasOwnProperty.call(needs, need) && rate > 0) {
      needs[need] = Math.max(0, needs[need] - rate)
    }
  }
}

// ── Debug helper ──────────────────────────────────────────────────────────────
// Log computed rates — useful when tuning. Call once at startup if needed.

export function logDecayRates(): void {
  console.log("\n[NeedsDecay] Per-tick decay rates (×1000 for readability):")
  for (const [char, rates] of Object.entries(CHARACTER_DECAY_RATES)) {
    const summary = Object.entries(rates)
      .filter(([, r]) => r > 0)
      .map(([n, r]) => `${n}:${(r * 1000).toFixed(2)}`)
      .join("  ")
    console.log(`  ${char.padEnd(10)} ${summary}`)
  }
  console.log()
}
