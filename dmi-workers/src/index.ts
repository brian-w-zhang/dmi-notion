import { Worker } from "@notionhq/workers"
import { j } from "@notionhq/workers/schema-builder"

const worker = new Worker()
const SERVER = process.env.GAME_SERVER_URL ?? "http://localhost:3001"

// ── Perception tools (read-only) ──────────────────────────────────────────────

worker.tool("getWorldState", {
  title: "Get World State",
  description:
    "Get your current game state — position, what you're doing, your needs, and who is nearby. Call this at the start of every decision cycle before choosing an action.",
  schema: j.object({
    character: j.string().describe("Your character key, e.g. 'dwight', 'jim', 'pam'"),
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

worker.tool("getNearbyCharacters", {
  title: "Get Nearby Characters",
  description:
    "Get characters currently within perception range. Use this to check who you can interact with before deciding to start a conversation.",
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

worker.tool("getNeeds", {
  title: "Get Needs",
  description:
    "Get your current needs. Values are 0–1; lower means more urgent. Use this to decide if a self-care action (eating, resting, bathroom) should override your plan.",
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

worker.tool("getPlan", {
  title: "Get Day Plan",
  description:
    "Get your scheduled plan for today — current block, next block, and your plan adherence score. Use this to decide whether to follow the plan or deviate based on your needs.",
  schema: j.object({
    character: j.string().describe("Your character key"),
  }),
  execute: async ({ character }) => {
    const res = await fetch(`${SERVER}/plan/${character}`)
    return await res.json()
  },
})

worker.tool("getDayLog", {
  title: "Get Recent Activity Log",
  description:
    "Get the last few things you've done today — actions taken, conversations had, and their emotional outcomes. Use this to avoid repeating yourself and to maintain continuity.",
  schema: j.object({
    character: j.string().describe("Your character key"),
    count: j.number().nullable().describe("Number of recent entries to return, default 5"),
  }),
  execute: async ({ character, count }) => {
    const n = count ?? 5
    const res = await fetch(`${SERVER}/day-log/${character}/recent?count=${n}`)
    return await res.json()
  },
})

worker.tool("perceiveRadius", {
  title: "Perceive Your Surroundings",
  description: `Get a two-layer view of your surroundings. Always call this before deciding what to do.

Layer 1 — Zone awareness (coarse): Everything in your current zone and all connected zones. You know which appliances are free or occupied, and which characters are present — but without the full action detail. Use this to decide where to go and who to approach.

Layer 2 — Vision radius (full detail): Everything within ~10 tiles of your position. Full action list, exact need effects, and precise tile locations. Use this to decide which specific action to take on an object you're standing near.

The "summary" field has quick answers: who you can approach, which appliances are free in your zone, and which nearby objects have actions you can use right now.`,
  schema: j.object({
    character: j.string().describe("Your character key"),
    radius: j.number().nullable().describe("Vision radius in tiles for full-detail layer, default 10"),
  }),
  execute: async ({ character, radius }) => {
    const r = radius ?? 10
    const res = await fetch(`${SERVER}/perception/${character}?radius=${r}`)
    return await res.json()
  },
})

worker.tool("getAdvertisedActions", {
  title: "Get Available Actions in Zone",
  description:
    "Get a list of actions you can take with objects in a given zone. Each action shows what need it satisfies and how long it takes. Use this to find actions that match your current needs.",
  schema: j.object({
    zone: j
      .string()
      .describe(
        "Zone name, e.g. 'break room', 'kitchen', 'sales', 'conference_room', \"men's bathroom\""
      ),
  }),
  execute: async ({ zone }) => {
    const encoded = encodeURIComponent(zone)
    const res = await fetch(`${SERVER}/advertised-actions/${encoded}`)
    return await res.json()
  },
})

worker.tool("findActionsForNeeds", {
  title: "Find Actions That Satisfy Urgent Needs",
  description: `You already know the office layout — you don't need to discover objects. Use this tool when a need is urgent and you want the most efficient way to satisfy it, ranked by how much each action helps and how close it is to you.

Returns the top K appliance actions that address your urgent needs, sorted by relevance. Each result includes the zone to navigate to, the appliance name to use in submitAction, and the exact need effects.

Example: urgent_needs=["hunger","thirst"] returns coffee machine (thirst+10, energy+25), kitchen fridge (hunger+28), vending machine (hunger+20, thirst+18), etc.

Call this when your needs override your plan. Then call submitAction with move_to to navigate to the zone, and perceiveRadius once you arrive for exact action point details.`,
  schema: j.object({
    character: j.string().describe("Your character key — used to rank results by proximity"),
    urgent_needs: j
      .array(j.string())
      .describe("The needs driving this decision, e.g. ['hunger', 'bladder', 'thirst']"),
    k: j.number().nullable().describe("Max results to return, default 5"),
  }),
  execute: async ({ character, urgent_needs, k }) => {
    const needs = urgent_needs.join(",")
    const count = k ?? 5
    const res = await fetch(
      `${SERVER}/actions-for-needs?character=${character}&needs=${needs}&k=${count}`
    )
    return await res.json()
  },
})

// ── Action submission (write) ─────────────────────────────────────────────────

worker.tool("submitAction", {
  title: "Submit Action Decision",
  description: `Submit your character's action decision for this tick.

Action types:
- "continue"               — keep doing what you're already doing
- "idle"                   — stand around, do nothing specific
- "move_to"                — walk to a zone or location (set target to zone name or desk id)
- "use_appliance"          — interact with an object in your zone (set target to appliance name, appliance_action to action name)
- "initiate_conversation"  — start talking to someone nearby (set want_to_talk)

Always call getWorldState and getPlan first. Set follow_plan to false only if deviating, and provide deviation_reason.`,
  schema: j.object({
    character: j.string().describe("Your character key"),
    action: j
      .string()
      .describe("One of: continue | idle | move_to | use_appliance | initiate_conversation"),
    target: j
      .string()
      .nullable()
      .describe("Zone name, appliance objectName, or character key depending on action type"),
    description: j.string().describe("Brief natural-language description of what you are doing"),
    emoji: j.string().describe("One emoji representing the action"),
    follow_plan: j.boolean().describe("True if following your current plan block"),
    deviation_reason: j
      .string()
      .nullable()
      .describe("Why you are deviating from the plan — only if follow_plan is false"),
    update_currently: j
      .string()
      .nullable()
      .describe(
        "New one-sentence living status if something notable just happened. Omit if nothing changed."
      ),
    want_to_talk: j
      .object({
        character_key: j.string().describe("The character key you want to talk to"),
        opening_topic: j.string().describe("What you want to talk about"),
      })
      .nullable()
      .describe("Only if action is initiate_conversation"),
    appliance_action: j
      .string()
      .nullable()
      .describe("The specific action name on the appliance, e.g. 'buy snack', 'get coffee'"),
  }),
  execute: async (body) => {
    const res = await fetch(`${SERVER}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        // Normalize nulls to undefined for the server
        target: body.target ?? undefined,
        deviation_reason: body.deviation_reason ?? undefined,
        update_currently: body.update_currently ?? undefined,
        want_to_talk: body.want_to_talk ?? undefined,
        appliance_action: body.appliance_action ?? undefined,
      }),
    })
    return await res.json()
  },
})

export default worker
