import type { LiveCharacter } from "../simulation/types.js"
import type { WorldState } from "../simulation/WorldState.js"
import { CHARACTER_NAMES } from "./characters.js"

// Builds the message payload sent to a character's Notion agent each tick.
// The agent's built-in Notion DB access handles memory retrieval —
// the context tells it what to look up.

export function buildTickContext(characterKey: string, world: WorldState): string {
  const c = world.getCharacter(characterKey)
  const nearby = world.getNearby(characterKey, 5)
  const simTimeStr = world.simTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

  const needsSummary = needsToNaturalLanguage(c.needs)
  const nearbyDesc = nearby.length > 0
    ? nearby.map((n) => `${CHARACTER_NAMES[n.name] ?? n.name} is nearby (${n.action})`).join("; ")
    : "no one nearby"

  // Structured JSON payload — agent parses this and returns a structured decision
  const payload = {
    character: CHARACTER_NAMES[characterKey],
    sim_time: simTimeStr,
    step: world.step,
    current_action: c.action,
    current_location: tileToZone(c.tile),
    needs: {
      raw: c.needs,
      summary: needsSummary,
    },
    perception: {
      nearby_characters: nearby.map((n) => ({
        name: CHARACTER_NAMES[n.name] ?? n.name,
        action: n.action,
        tile_distance: tileDist(c.tile, n.tile),
      })),
      description: nearbyDesc,
    },
    instructions: [
      "Review your current needs and situation.",
      "Check your memory database for relevant context about your current task and the people nearby.",
      "Decide what to do next. You may continue your current action, start a new one, or initiate a conversation.",
      "Respond ONLY with a JSON object in this exact format (no other text):",
      JSON.stringify({
        action: "one of: continue | move_to | use_appliance | initiate_conversation | idle",
        target: "zone name, appliance name, or character name depending on action",
        description: "brief description of what you are doing",
        emoji: "one emoji representing the action",
        reasoning: "one sentence — why this action given your needs and memories",
        want_to_talk: "if action is initiate_conversation: name of character and opening topic",
      }),
    ],
  }

  return JSON.stringify(payload, null, 2)
}

export function buildConversationTurnContext(args: {
  speakerKey: string
  listenerKey: string
  scene: { location: string; trigger: string }
  history: { speaker: string; line: string }[]
  isOpening: boolean
  simTime: string
}): string {
  const speakerName = CHARACTER_NAMES[args.speakerKey]
  const listenerName = CHARACTER_NAMES[args.listenerKey]

  const payload = {
    character: speakerName,
    sim_time: args.simTime,
    scene: {
      location: args.scene.location,
      trigger: args.scene.trigger,
      speaking_to: listenerName,
    },
    conversation_so_far: args.history,
    instructions: [
      args.isOpening
        ? `You are initiating a conversation with ${listenerName}. Say your opening line.`
        : `${listenerName} just spoke to you. Respond in character.`,
      "Check your memory for anything relevant about this person or situation.",
      "Respond ONLY with a JSON object:",
      JSON.stringify({
        line: "what you actually say out loud",
        tone: "e.g. sarcastic | nervous | enthusiastic | dry | warm",
        nonverbal: "brief physical action, e.g. 'straightens tie' or 'glances at camera' — or null",
        end: "true if you are ending the conversation, false to continue",
      }),
    ],
  }

  return JSON.stringify(payload, null, 2)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function needsToNaturalLanguage(needs: Record<string, number>): string {
  const urgent = Object.entries(needs)
    .filter(([, v]) => v < 0.3)
    .map(([k]) => k)
  const high = Object.entries(needs)
    .filter(([, v]) => v > 0.7)
    .map(([k]) => k)

  const parts: string[] = []
  if (urgent.length) parts.push(`urgently needs: ${urgent.join(", ")}`)
  if (high.length) parts.push(`high: ${high.join(", ")}`)
  return parts.join("; ") || "all needs satisfied"
}

function tileDist(a: [number, number], b: [number, number]): number {
  return Math.round(Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2))
}

// Placeholder — replace with your actual tile→zone lookup from office-objects.json
function tileToZone(tile: [number, number]): string {
  return `tile [${tile[0]}, ${tile[1]}]`
}
