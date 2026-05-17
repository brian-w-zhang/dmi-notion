import { Worker } from "@notionhq/workers"
import { j } from "@notionhq/workers/schema-builder"

const worker = new Worker()
const SERVER = process.env.GAME_SERVER_URL ?? "http://localhost:3001"

// ── Tool: getWorldState ───────────────────────────────────────────────────────
// Returns a character's current tile, action, needs, and nearby characters.
// Agents call this to understand their current situation before deciding.

worker.tool("getWorldState", {
  title: "Get World State",
  description: "Get the current game world state for a character — their position, what they're doing, their needs, and who is nearby. Call this before making any decision about what to do next.",
  schema: j.object({
    character: j.string().describe("Character key, e.g. 'dwight', 'jim', 'pam'"),
  }),
  execute: async ({ character }) => {
    const [stateRes, nearbyRes] = await Promise.all([
      fetch(`${SERVER}/world-state/${character}`),
      fetch(`${SERVER}/nearby/${character}?radius=5`),
    ])
    const state = await stateRes.json()
    const nearby = await nearbyRes.json()
    return { character, state, nearby }
  },
})

// ── Tool: getNearbyCharacters ─────────────────────────────────────────────────
// Narrower tool for when an agent only needs perception info.

worker.tool("getNearbyCharacters", {
  title: "Get Nearby Characters",
  description: "Get a list of characters currently within perception range. Use this to check who you can interact with before deciding to start a conversation.",
  schema: j.object({
    character: j.string().describe("Your character key"),
    radius: j.number().nullable().describe("Tile radius to check, default 5"),
  }),
  execute: async ({ character, radius }) => {
    const r = radius ?? 5
    const res = await fetch(`${SERVER}/nearby/${character}?radius=${r}`)
    return await res.json()
  },
})

// ── Tool: getNeeds ────────────────────────────────────────────────────────────
// Returns just the needs vector with a natural-language urgency summary.

worker.tool("getNeeds", {
  title: "Get Needs",
  description: "Get your current needs state. Values are 0–1, lower means more urgent. Use this to prioritize self-care actions (eating, resting, etc.) against social or work goals.",
  schema: j.object({
    character: j.string().describe("Your character key"),
  }),
  execute: async ({ character }) => {
    const res = await fetch(`${SERVER}/world-state/${character}`)
    const state = await res.json() as { needs?: Record<string, number> }
    const needs = state.needs ?? {}
    const urgent = Object.entries(needs).filter(([, v]) => v < 0.3).map(([k]) => k)
    return {
      needs,
      urgent,
      summary: urgent.length ? `Urgent: ${urgent.join(", ")}` : "All needs satisfied",
    }
  },
})

export default worker
