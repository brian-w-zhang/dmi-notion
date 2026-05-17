import { NotionAgentsClient, stripLangTags } from "@notionhq/agents-client"
import type { WorldState } from "../simulation/WorldState.js"
import { buildTickContext, buildAppraisalContext, buildReflectionContext } from "./ContextBuilder.js"
import { runConversation } from "./ConversationFlow.js"
import { runGroupConversation } from "./GroupConversationFlow.js"
import { CHARACTER_AGENT_IDS, CHARACTER_NAMES } from "./characters.js"
import { getActionNeedDeltas } from "../simulation/WorldData.js"

interface AgentDecision {
  thinking?: string           // interior deliberation — stored in log for interpretability
  follow_plan: boolean
  action: "continue" | "move_to" | "use_appliance" | "initiate_conversation" | "announce" | "summon_meeting" | "idle"
  target?: string
  appliance_action?: string
  description: string
  emoji: string
  reasoning: string
  deviation_reason?: string
  update_currently?: string
  want_to_talk?: { character_key: string; opening_topic: string }
  announcement?: string       // only when action === "announce"
  meeting_topic?: string      // only when action === "summon_meeting"
}

// Fires all active character ticks in parallel against the current world snapshot.
export async function runTickRound(
  world: WorldState,
  client: NotionAgentsClient
): Promise<Map<string, AgentDecision>> {
  const active = world.getActiveCharacters()
  console.log(`\n[Round ${world.step}] Ticking ${active.length} active characters...`)

  const results = await Promise.allSettled(
    active.map(async (c) => {
      const decision = await tickCharacter(c.name, world, client)
      return { key: c.name, decision }
    })
  )

  const decisions = new Map<string, AgentDecision>()
  for (const result of results) {
    if (result.status === "fulfilled") {
      decisions.set(result.value.key, result.value.decision)
    } else {
      console.error(`Tick failed:`, result.reason)
    }
  }

  return decisions
}

// Applies decisions to world state, spawning conversation/meeting flows as needed.
// Also handles meeting phase transitions: assembling → in_progress → ended.
export function applyDecisions(
  decisions: Map<string, AgentDecision>,
  world: WorldState,
  client: NotionAgentsClient
) {
  // ── Meeting phase check ────────────────────────────────────────────────────
  // If a meeting is assembling and the travel window has elapsed, start it now.
  if (world.activeMeeting?.phase === "assembling" && world.step >= world.activeMeeting.assemblyDueStep) {
    world.activeMeeting.phase = "in_progress"
    const meeting = world.activeMeeting
    const groupConvId = `meeting-${meeting.initiatorKey}-${world.step}`
    meeting.conversationId = groupConvId

    runGroupConversation(
      {
        id: groupConvId,
        participants: meeting.participants,
        location: "conference_room",
        topic: meeting.topic,
        startStep: world.step,
      },
      world,
      client
    )
      .then((record) => {
        world.pushGroupConversation(record)
        world.endMeeting(`Meeting on "${meeting.topic}" concluded with ${record.turns.length} turns.`)
      })
      .catch((err) => {
        console.error(`[Meeting ${groupConvId}] failed:`, err)
        world.endMeeting()
      })

    console.log(`[Meeting] assembly window elapsed — group conversation starting`)
    return  // skip individual decisions this round; everyone is in the meeting
  }

  // ── If meeting is in_progress, skip all individual ticks ──────────────────
  if (world.activeMeeting?.phase === "in_progress") {
    return
  }

  // ── Normal per-character decisions ────────────────────────────────────────
  for (const [key, decision] of decisions) {
    const c = world.getCharacter(key)

    if (decision.thinking) {
      world.getCharacter(key).lastThinking = decision.thinking
    }

    if (decision.update_currently) {
      world.updateCurrently(key, decision.update_currently)
    }

    if (!decision.follow_plan && decision.deviation_reason) {
      world.addEvent({ type: "deviation", character: key, detail: decision.deviation_reason })
    }

    // ── Announce ─────────────────────────────────────────────────────────────
    if (decision.action === "announce" && decision.announcement) {
      world.broadcastAnnouncement(key, decision.announcement)
      applyActionToCharacter(c, decision)
      console.log(`  📢 ${CHARACTER_NAMES[key]}: "${decision.announcement.slice(0, 80)}"`)
      continue
    }

    // ── Summon meeting ────────────────────────────────────────────────────────
    if (decision.action === "summon_meeting" && !world.activeMeeting) {
      const topic = decision.meeting_topic ?? "a meeting"
      world.startMeeting(topic, key)
      applyActionToCharacter(c, { ...decision, description: `called a meeting: ${topic}`, emoji: "📋" })
      console.log(`  📋 ${CHARACTER_NAMES[key]}: summoned a meeting — "${topic}"`)
      continue
    }

    // ── 1:1 Conversation ──────────────────────────────────────────────────────
    if (decision.action === "initiate_conversation" && decision.want_to_talk) {
      const targetKey = decision.want_to_talk.character_key
      const targetChar = world.characters.get(targetKey)

      if (!targetChar) {
        console.warn(`  [${key}] tried to talk to unknown character: ${targetKey}`)
        applyActionToCharacter(c, decision)
        continue
      }
      if (targetChar.state !== "active" && targetChar.state !== "idle") {
        console.log(`  [${key}] wanted to talk to ${targetKey} but they're ${targetChar.state}`)
        applyActionToCharacter(c, decision)
        continue
      }
      if (world.isOnCooldown(key, targetKey)) {
        console.log(`  [${key}] on cooldown with ${targetKey} — skipping`)
        applyActionToCharacter(c, decision)
        continue
      }

      const convId = `conv-${key}-${targetKey}-${world.step}`
      world.startConversation(convId, {
        id: convId,
        participants: [key, targetKey] as [string, string],
        location: c.action,
        trigger: decision.want_to_talk.opening_topic,
        turns: [],
        startStep: world.step,
        endStep: world.step,
      })

      runConversation(
        { id: convId, initiatorKey: key, targetKey, location: c.action, trigger: decision.want_to_talk.opening_topic, startStep: world.step },
        world, client
      )
        .then(async (completed) => {
          const appraisalCtx = buildAppraisalContext({
            participants: completed.participants,
            location: completed.location,
            trigger: completed.trigger,
            turns: completed.turns,
            simTime: world.simTimeString(),
          })
          const appraisal = await runAppraisal(client, appraisalCtx)
          world.endConversation(convId, appraisal?.summary, appraisal
            ? { valence: appraisal.valence, relationshipDelta: appraisal.relationship_delta, takeaway: appraisal.takeaway }
            : undefined
          )
          if (appraisal) {
            const [kA, kB] = completed.participants
            if (appraisal.pad_delta_a) world.applyPadDeltas(kA, appraisal.pad_delta_a)
            if (appraisal.pad_delta_b) world.applyPadDeltas(kB, appraisal.pad_delta_b)
            if (appraisal.need_delta_a) world.applyNeedDeltas(kA, appraisal.need_delta_a)
            if (appraisal.need_delta_b) world.applyNeedDeltas(kB, appraisal.need_delta_b)
          }
          console.log(`  [Conv ${convId}] complete — ${appraisal?.valence ?? "?"}`)
        })
        .catch((err) => {
          console.error(`[Conv ${convId}] failed:`, err)
          world.endConversation(convId)
        })

      console.log(`  → ${CHARACTER_NAMES[key]} → ${CHARACTER_NAMES[targetKey]}`)
      continue
    }

    // ── Move to destination ───────────────────────────────────────────────────
    if (decision.action === "move_to" && decision.target) {
      const ok = world.setDestination(key, decision.target)
      if (!ok) console.warn(`  [${key}] move_to: unknown locationId "${decision.target}"`)
      else console.log(`  → ${CHARACTER_NAMES[key]} moving to ${decision.target} (${c.plannedPath.length} tiles)`)
    }

    // ── Use appliance ────────────────────────────────────────────────────────
    if (decision.action === "use_appliance" && decision.target) {
      if (decision.appliance_action) {
        const deltas = getActionNeedDeltas(decision.target, decision.appliance_action)
        if (deltas) {
          world.applyNeedDeltas(key, deltas)
          console.log(`  → ${CHARACTER_NAMES[key]} used ${decision.target}:${decision.appliance_action} — deltas applied`)
        }
      }
      world.setDestination(key, decision.target)
    }

    // ── Standard action ───────────────────────────────────────────────────────
    applyActionToCharacter(c, decision)
    world.pushLogEntry(key, {
      type: "action",
      action: decision.action,
      description: decision.description,
      locationId: decision.target ?? c.tile.join(","),
      startMin: world.simMinutes,
      endMin: world.simMinutes + world.secPerStep / 60,
      followedPlan: decision.follow_plan,
      deviationReason: decision.deviation_reason,
      thinking: decision.thinking,
    })
    console.log(`  ${CHARACTER_NAMES[key]}: ${decision.description} ${decision.emoji}${decision.follow_plan ? "" : " [deviation]"}`)
    if (decision.thinking) {
      console.log(`    💭 ${decision.thinking.slice(0, 100)}${decision.thinking.length > 100 ? "…" : ""}`)
    }
  }
}

// ── Single character tick ─────────────────────────────────────────────────────

async function tickCharacter(
  characterKey: string,
  world: WorldState,
  client: NotionAgentsClient
): Promise<AgentDecision> {
  const agentId = CHARACTER_AGENT_IDS[characterKey]
  if (!agentId) throw new Error(`No agent ID for ${characterKey}`)

  const agent = client.agents.agent(agentId)
  const message = buildTickContext(characterKey, world)

  let fullContent = ""
  for await (const chunk of agent.chatStream({ message })) {
    if (chunk.type === "message" && chunk.role === "agent") {
      fullContent = stripLangTags(chunk.content)
    } else if (chunk.type === "error") {
      throw new Error(`[${characterKey}] stream error: ${chunk.message}`)
    }
  }

  return parseDecision(fullContent, characterKey)
}

// ── Appraisal (post-conversation) ─────────────────────────────────────────────
// Uses the first available agent (Michael — regional manager vibes as narrator).
// Could use any agent; this is just a structured summarization call.

interface AppraisalResult {
  summary: string
  valence: "positive" | "neutral" | "negative"
  relationship_delta: "improved" | "neutral" | "damaged"
  takeaway: string
  pad_delta_a?: { pleasure: number; arousal: number; dominance: number }
  pad_delta_b?: { pleasure: number; arousal: number; dominance: number }
  need_delta_a?: Record<string, number>
  need_delta_b?: Record<string, number>
  importance?: number
}

async function runAppraisal(
  client: NotionAgentsClient,
  context: string
): Promise<AppraisalResult | null> {
  try {
    const agentId = CHARACTER_AGENT_IDS["michael"]
    const agent = client.agents.agent(agentId)
    let fullContent = ""
    for await (const chunk of agent.chatStream({ message: context })) {
      if (chunk.type === "message" && chunk.role === "agent") {
        fullContent = stripLangTags(chunk.content)
      }
    }
    const match = fullContent.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch (err) {
    console.error("[Appraisal] failed:", err)
    return null
  }
}

// ── Talking head / reflection round ───────────────────────────────────────────
// Fires end-of-hour reflections for all active characters, staggered by index
// to distribute load and avoid simultaneous rate-limit spikes.

export async function runReflectionRound(
  world: WorldState,
  client: NotionAgentsClient,
  trigger: string = "end_of_hour"
): Promise<void> {
  const characters = [...world.characters.keys()]
  console.log(`\n[Reflection] Firing talking heads for ${characters.length} characters — trigger: ${trigger}`)

  for (const characterKey of characters) {
    try {
      const c = world.getCharacter(characterKey)
      const recentLog = world.getRecentLog(characterKey, 5)
      const context = buildReflectionContext({
        characterKey,
        trigger,
        recentLog: recentLog as object[],
        currentPad: c.pad,
        simTime: world.simTimeString(),
      })

      const agentId = CHARACTER_AGENT_IDS[characterKey]
      if (!agentId) continue
      const agent = client.agents.agent(agentId)

      let fullContent = ""
      for await (const chunk of agent.chatStream({ message: context })) {
        if (chunk.type === "message" && chunk.role === "agent") {
          fullContent = stripLangTags(chunk.content)
        }
      }

      const match = fullContent.match(/\{[\s\S]*\}/)
      if (!match) {
        console.warn(`  [${characterKey}] no JSON in reflection response`)
        continue
      }
      const result = JSON.parse(match[0])

      if (result.talking_head) {
        console.log(`  [${CHARACTER_NAMES[characterKey]}] 🎥 "${result.talking_head.slice(0, 80)}..."`)
      }

      // Apply PAD state from reflection output
      if (result.memory_write) {
        const { pleasure, arousal, dominance } = result.memory_write
        if (typeof pleasure === "number" || typeof arousal === "number" || typeof dominance === "number") {
          world.applyPadDeltas(characterKey, {
            pleasure: (typeof pleasure === "number" ? pleasure : 0) - c.pad.pleasure,
            arousal:  (typeof arousal  === "number" ? arousal  : 0) - c.pad.arousal,
            dominance:(typeof dominance=== "number" ? dominance: 0) - c.pad.dominance,
          })
        }
        // TODO: write memory_write to character's Notion Memory database
      }
    } catch (err) {
      console.error(`  [Reflection ${characterKey}] failed:`, err)
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyActionToCharacter(
  c: ReturnType<WorldState["getCharacter"]>,
  decision: AgentDecision
): void {
  c.action = decision.description
  c.emoji = decision.emoji
}

function parseDecision(raw: string, characterKey: string): AgentDecision {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.warn(`[${characterKey}] non-JSON response:`, raw.slice(0, 100))
    return { follow_plan: true, action: "idle", description: "idle", emoji: "💭", reasoning: raw.slice(0, 80) }
  }
  try {
    return JSON.parse(jsonMatch[0]) as AgentDecision
  } catch {
    return { follow_plan: true, action: "idle", description: "idle", emoji: "💭", reasoning: "parse error" }
  }
}
