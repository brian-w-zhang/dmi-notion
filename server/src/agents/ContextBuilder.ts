import type { LiveCharacter, LogEntry } from "../simulation/types.js"
import type { WorldState } from "../simulation/WorldState.js"
import { CHARACTER_NAMES } from "./characters.js"

export function buildTickContext(characterKey: string, world: WorldState): string {
  const c = world.getCharacter(characterKey)
  const nearby = world.getNearby(characterKey, 5)
  const currentBlock = world.getCurrentPlanBlock(characterKey)
  const nextBlock = world.getNextPlanBlock(characterKey)
  const recentLog = world.getRecentLog(characterKey, 5)

  const minutesRemainingInBlock = currentBlock
    ? (currentBlock.startMin + currentBlock.durationMin) - world.simMinutes
    : null

  const payload = {
    character: CHARACTER_NAMES[characterKey],
    sim_time: world.simTimeString(),
    step: world.step,

    // Living status — updated by agent after notable events
    currently: c.currently,

    // What the plan says you should be doing
    current_plan_block: currentBlock
      ? {
          action: currentBlock.action,
          description: currentBlock.description,
          location: currentBlock.locationId,
          emoji: currentBlock.emoji,
          minutes_remaining: minutesRemainingInBlock,
        }
      : null,
    next_plan_block: nextBlock
      ? { action: nextBlock.action, description: nextBlock.description, starts_in_minutes: nextBlock.startMin - world.simMinutes }
      : null,
    plan_adherence: c.planAdherence,

    // What you're actually doing now
    current_action: c.action,
    current_location: c.tile,

    // Needs
    needs: {
      raw: c.needs,
      summary: needsToNaturalLanguage(c.needs),
    },

    // What you've done so far today (rolling, prevents repeats)
    completed_this_hour: c.completedThisHour,

    // Last few log entries — prevents amnesia across ticks
    recent_log: formatRecentLog(recentLog, characterKey),

    // Who's around
    perception: {
      nearby_characters: nearby.map((n) => ({
        name: CHARACTER_NAMES[n.name] ?? n.name,
        action: n.action,
        tile_distance: tileDist(c.tile, n.tile),
        on_cooldown: world.isOnCooldown(characterKey, n.name),
      })),
    },

    instructions: [
      "You are a character in a simulation. Review your current situation.",
      "Check your plan. Your plan_adherence score reflects how likely you are to follow it.",
      "Consider your needs — if something is urgent, it may override the plan.",
      "Check nearby characters — you may initiate conversation if not on cooldown.",
      "Consult your memory database for any relevant context.",
      "Respond ONLY with a JSON object in this exact format (no other text):",
      JSON.stringify({
        follow_plan: "true if continuing with current_plan_block, false if deviating",
        action: "continue | move_to | use_appliance | initiate_conversation | idle",
        target: "zone name, appliance name, or character key depending on action",
        description: "brief description of what you are doing",
        emoji: "one emoji representing the action",
        reasoning: "one sentence — why this action given needs, plan, and memories",
        deviation_reason: "only if follow_plan is false — why you are deviating",
        update_currently: "optional — new one-sentence status if something notable just happened, else omit",
        want_to_talk: "only if action is initiate_conversation — { character_key, opening_topic }",
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
        ? `You are starting a conversation with ${listenerName}. Say your opening line.`
        : `${listenerName} just spoke to you. Respond in character.`,
      "Check your memory for anything relevant about this person or situation.",
      "Respond ONLY with a JSON object:",
      JSON.stringify({
        line: "what you actually say out loud",
        tone: "e.g. sarcastic | nervous | enthusiastic | dry | warm",
        nonverbal: "brief physical action e.g. 'glances at camera' — or null",
        end: "true if you are ending the conversation, false to continue",
      }),
    ],
  }

  return JSON.stringify(payload, null, 2)
}

// Builds the appraisal prompt sent after a conversation completes.
// One call from the orchestrator, not from individual characters.
export function buildAppraisalContext(args: {
  participants: [string, string]
  location: string
  trigger: string
  turns: { speaker: string; line: string; tone?: string }[]
  simTime: string
}): string {
  const [a, b] = args.participants.map((k) => CHARACTER_NAMES[k] ?? k)

  const payload = {
    conversation_between: [a, b],
    location: args.location,
    trigger: args.trigger,
    sim_time: args.simTime,
    transcript: args.turns,
    instructions: [
      "Summarize this conversation and evaluate its emotional outcome.",
      "Respond ONLY with a JSON object:",
      JSON.stringify({
        summary: "1–2 sentence neutral summary of what was discussed",
        valence: "positive | neutral | negative — overall emotional tone",
        relationship_delta: "improved | neutral | damaged — how the relationship changed",
        takeaway: "one-line memorable outcome e.g. 'Jim agreed to cover Stanley's client call'",
      }),
    ],
  }

  return JSON.stringify(payload, null, 2)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function needsToNaturalLanguage(needs: Record<string, number>): string {
  const urgent = Object.entries(needs).filter(([, v]) => v < 0.3).map(([k]) => k)
  const high = Object.entries(needs).filter(([, v]) => v > 0.7).map(([k]) => k)
  const parts: string[] = []
  if (urgent.length) parts.push(`urgently needs: ${urgent.join(", ")}`)
  if (high.length) parts.push(`high: ${high.join(", ")}`)
  return parts.join("; ") || "all needs satisfied"
}

function tileDist(a: [number, number], b: [number, number]): number {
  return Math.round(Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2))
}

function formatRecentLog(log: LogEntry[], selfKey: string): object[] {
  return log.map((entry) => {
    if (entry.type === "action") {
      return {
        type: "action",
        action: entry.action,
        minutes_ago: "recent",
        followed_plan: entry.followedPlan,
        ...(entry.deviationReason ? { deviated_because: entry.deviationReason } : {}),
      }
    }
    return {
      type: "conversation",
      with: CHARACTER_NAMES[entry.with] ?? entry.with,
      summary: entry.summary,
      tone: entry.appraisal.valence,
      takeaway: entry.appraisal.takeaway,
    }
  })
}
