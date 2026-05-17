import type { LogEntry } from "../simulation/types.js"
import type { WorldState } from "../simulation/WorldState.js"
import { CHARACTER_NAMES } from "./characters.js"
import {
  inferZoneFromTile,
  getAdvertisedActions,
  findActionsForNeeds,
  getZoneAwareness,
} from "../simulation/WorldData.js"

export function buildTickContext(characterKey: string, world: WorldState): string {
  const c = world.getCharacter(characterKey)
  const currentBlock = world.getCurrentPlanBlock(characterKey)
  const nextBlock = world.getNextPlanBlock(characterKey)
  const recentLog = world.getRecentLog(characterKey, 3)

  // Recent announcements this character heard (from dayLog)
  const heardAnnouncements = c.dayLog
    .filter((e): e is import("../simulation/types.js").AnnouncementLogEntry => e.type === "announcement")
    .slice(-3)
    .map((e) => ({ from: CHARACTER_NAMES[e.from] ?? e.from, message: e.message }))

  const minutesRemainingInBlock = currentBlock
    ? (currentBlock.startMin + currentBlock.durationMin) - world.simMinutes
    : null

  const currentZone = inferZoneFromTile(c.tile)
  const urgentNeeds = Object.entries(c.needs).filter(([, v]) => v < 0.4).map(([k]) => k)

  // Build occupied-tiles map for zone awareness
  const occupiedTiles = new Map<string, string>()
  for (const [key, ch] of world.characters) {
    occupiedTiles.set(`${ch.tile[0]},${ch.tile[1]}`, key)
  }

  // ── Zone awareness (coarse layer for connected zones) ─────────────────────
  const { visibleZones, entities: zoneEntities } = getZoneAwareness(currentZone, occupiedTiles)
  const zoneAwareness = {
    visible_zones: visibleZones,
    entities: zoneEntities.map((e) => ({
      name: e.name,
      zone: e.zone,
      status: e.status,
    })),
  }

  // ── Actions available in current zone ─────────────────────────────────────
  const actionsHere = getAdvertisedActions(currentZone).map((a) => ({
    appliance: a.appliance,
    action: a.action,
    emoji: a.emoji,
    duration_steps: a.durationSteps,
  }))

  // ── Need-scored action candidates (may require travel) ────────────────────
  const recommendedActions = urgentNeeds.length > 0
    ? findActionsForNeeds(urgentNeeds, c.tile, 5, c.needs).map((a) => ({
        appliance: a.appliance,
        action: a.action,
        emoji: a.emoji,
        zone: a.zone,
        need_effects: a.needEffects,
        utility_score: a.utilityScore,
        distance_tiles: a.distanceTiles,
      }))
    : []

  // ── Nearby characters (zone-based, not just radius) ───────────────────────
  // Include all characters in visible zones, not just a 5-tile circle.
  const nearbyCharKeys = new Set(
    zoneEntities
      .filter((e) => e.occupiedBy)
      .map((e) => e.occupiedBy!)
  )
  // Also include any within 8 tiles regardless of zone
  for (const ch of world.getNearby(characterKey, 8)) {
    nearbyCharKeys.add(ch.name)
  }
  nearbyCharKeys.delete(characterKey)

  const nearbyChars = [...nearbyCharKeys]
    .map((key) => {
      const ch = world.characters.get(key)
      if (!ch) return null
      return {
        key,
        name: CHARACTER_NAMES[key] ?? key,
        zone: inferZoneFromTile(ch.tile),
        action: ch.action,
        state: ch.state,
        tile_distance: tileDist(c.tile, ch.tile),
        on_cooldown: world.isOnCooldown(characterKey, key),
      }
    })
    .filter(Boolean)

  const payload = {
    mode: "action",
    character: CHARACTER_NAMES[characterKey],
    sim_time: world.simTimeString(),
    step: world.step,

    currently: c.currently,
    pad: c.pad,

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
      ? {
          action: nextBlock.action,
          description: nextBlock.description,
          starts_in_minutes: nextBlock.startMin - world.simMinutes,
        }
      : null,
    plan_adherence: c.planAdherence,

    // Navigation state — set when actively walking somewhere
    in_transit_to: c.destinationId ?? null,
    tiles_remaining: c.plannedPath.length > 0 ? c.plannedPath.length : null,

    // Set after a conversation that interrupted a task.
    // resume_target is a locationId you can pass directly to move_to.
    // Cleared as soon as you call move_to for any destination.
    interrupted_task: c.interruptedDestinationId
      ? { resume_target: c.interruptedDestinationId }
      : null,

    current_action: c.action,
    current_zone: currentZone,

    needs: {
      urgent: urgentNeeds,
      summary: needsToNaturalLanguage(c.needs),
    },

    // Zone awareness: coarse occupancy for your zone + connected zones
    zone_awareness: zoneAwareness,

    // Actions you can take right here without moving
    available_actions_here: actionsHere,

    // Best actions for urgent needs (may require moving)
    recommended_for_urgent_needs: recommendedActions,

    completed_this_hour: c.completedThisHour,
    recent_log: formatRecentLog(recentLog, characterKey),
    heard_announcements: heardAnnouncements,
    meeting_summoned: world.activeMeeting?.phase === "assembling"
      ? { topic: world.activeMeeting.topic, called_by: CHARACTER_NAMES[world.activeMeeting.initiatorKey] }
      : null,
    nearby_characters: nearbyChars,

    instructions: [
      "Decide what to do next. Consult your memory and relationship databases for context.",
      "meeting_summoned → MUST respond action:'move_to' target:'conference_room'.",
      "in_transit_to set → respond 'continue' to keep walking, or pick a new action.",
      "interrupted_task set → consider resuming with 'move_to' or 'continue'.",
      "Urgent needs may override the plan. Use recommended_for_urgent_needs to address them.",
      "Michael only: may use 'announce' or 'summon_meeting'.",
      "Respond ONLY with valid JSON — no prose, no markdown.",
      JSON.stringify({
        thinking: "1–2 sentences first-person inner voice",
        follow_plan: true,
        action: "continue|move_to|use_appliance|initiate_conversation|announce|summon_meeting|idle",
        target: "zone, appliance, or character_key — omit if unused",
        appliance_action: "action name — only for use_appliance",
        description: "one sentence third-person",
        emoji: "🙂",
        reasoning: "one sentence why",
        deviation_reason: "only if follow_plan false",
        update_currently: "only if something notable changed",
        want_to_talk: "{ character_key, opening_topic } — only for initiate_conversation",
        announcement: "only for announce",
        meeting_topic: "only for summon_meeting",
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
    mode: "conversation_turn",
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
  participants: [string, string]   // character keys
  location: string
  trigger: string
  turns: { speaker: string; line: string; tone?: string }[]
  simTime: string
}): string {
  const [keyA, keyB] = args.participants
  const [nameA, nameB] = args.participants.map((k) => CHARACTER_NAMES[k] ?? k)

  const payload = {
    conversation_between: [
      { key: keyA, name: nameA },
      { key: keyB, name: nameB },
    ],
    location: args.location,
    trigger: args.trigger,
    sim_time: args.simTime,
    transcript: args.turns,
    instructions: [
      "Summarize this conversation and evaluate its emotional and relational outcome.",
      "For PAD deltas: estimate how this conversation shifted each person's Pleasure, Arousal, and Dominance. Use small values (±0.1–0.3). Positive = more pleasure/arousal/dominance.",
      "For need_deltas: estimate small changes (±0.05–0.15) to social, stress, energy as appropriate.",
      "Respond ONLY with a JSON object:",
      JSON.stringify({
        summary: "1–2 sentence neutral summary of what was discussed",
        valence: "positive | neutral | negative — overall emotional tone",
        relationship_delta: "improved | neutral | damaged — how the relationship changed",
        takeaway: "one-line memorable outcome e.g. 'Jim agreed to cover Stanley's client call'",
        pad_delta_a: { pleasure: 0.0, arousal: 0.0, dominance: 0.0 },
        pad_delta_b: { pleasure: 0.0, arousal: 0.0, dominance: 0.0 },
        need_delta_a: { "social": 0.0, "stress": 0.0 },
        need_delta_b: { "social": 0.0, "stress": 0.0 },
        importance: 0.5,
      }),
    ],
  }

  return JSON.stringify(payload, null, 2)
}

// Builds the reflection/talking head prompt for end-of-hour or importance-triggered reflections.
export function buildReflectionContext(args: {
  characterKey: string
  trigger: string        // "end_of_hour" or a short event description
  recentLog: object[]
  currentPad: { pleasure: number; arousal: number; dominance: number }
  simTime: string
}): string {
  const payload = {
    mode: "reflection",
    character: CHARACTER_NAMES[args.characterKey],
    sim_time: args.simTime,
    trigger: args.trigger,
    recent_memories: args.recentLog,
    current_pad: args.currentPad,
    instructions: [
      "You are triggered to do a talking head — a direct-to-camera confessional moment.",
      "Consult your memory database and narrative identity to write an authentic reflection.",
      "Respond ONLY with a JSON object:",
      JSON.stringify({
        talking_head: "2–4 sentences, first person, to camera",
        memory_write: {
          title: "scene summary | emotional_tag, concept_tag",
          characters_involved: CHARACTER_NAMES[args.characterKey],
          given_circumstances: "what was happening when this was triggered",
          full_dialogue: "the talking head text verbatim",
          scene_arc: "one phrase — e.g. 'moment of self-recognition'",
          motivation: "what you wanted or feared",
          internal_thoughts: "what you didn't say to the camera",
          reflection: "one sentence — what you'd tell yourself tomorrow",
          importance: 0.0,
          pleasure: 0.0,
          arousal: 0.0,
          dominance: 0.0,
        },
      }),
    ],
  }

  return JSON.stringify(payload, null, 2)
}

// Builds the plan generation prompt for start-of-day or post-deviation replanning.
export function buildPlanGenerationContext(args: {
  characterKey: string
  simDate: string
  simTime: string
  recentMemoriesSummary?: string
}): string {
  const payload = {
    mode: "plan_generation",
    character: CHARACTER_NAMES[args.characterKey],
    sim_date: args.simDate,
    sim_time: args.simTime,
    recent_memories_summary: args.recentMemoriesSummary ?? null,
    instructions: [
      "Generate your daily plan for today.",
      "Consult your Narrative Identity, Memory database, and Day Plan page.",
      "Let your conscientiousness level shape how detailed the schedule is.",
      "Respond ONLY with a JSON object:",
      JSON.stringify({
        daily_goals: ["goal one", "goal two"],
        schedule: [
          { time: "07:00–08:00", activity: "description", status: "planned" },
        ],
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

function formatRecentLog(log: LogEntry[], _selfKey: string): object[] {
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
    if (entry.type === "dialogue") {
      return {
        type: "conversation",
        with: CHARACTER_NAMES[entry.with] ?? entry.with,
        summary: entry.summary,
        tone: entry.appraisal.valence,
        takeaway: entry.appraisal.takeaway,
      }
    }
    if (entry.type === "announcement") {
      return {
        type: "announcement",
        from: CHARACTER_NAMES[entry.from] ?? entry.from,
        message: entry.message,
      }
    }
    if (entry.type === "meeting") {
      return {
        type: "meeting",
        topic: entry.topic,
        participants: entry.participants.length,
        summary: entry.summary,
      }
    }
    return entry
  })
}
