import { NotionAgentsClient, stripLangTags } from "@notionhq/agents-client"
import type { WorldState } from "../simulation/WorldState.js"
import { buildTickContext, buildAppraisalContext } from "./ContextBuilder.js"
import { runConversation } from "./ConversationFlow.js"
import { CHARACTER_AGENT_IDS, CHARACTER_NAMES } from "./characters.js"

interface AgentDecision {
  follow_plan: boolean
  action: "continue" | "move_to" | "use_appliance" | "initiate_conversation" | "idle"
  target?: string
  description: string
  emoji: string
  reasoning: string
  deviation_reason?: string
  update_currently?: string
  want_to_talk?: { character_key: string; opening_topic: string }
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

// Applies decisions to world state, spawning conversation flows where needed.
export function applyDecisions(
  decisions: Map<string, AgentDecision>,
  world: WorldState,
  client: NotionAgentsClient
) {
  for (const [key, decision] of decisions) {
    const c = world.getCharacter(key)

    // Update living status if the agent flagged a notable change
    if (decision.update_currently) {
      world.updateCurrently(key, decision.update_currently)
    }

    // Log deviations as world events
    if (!decision.follow_plan && decision.deviation_reason) {
      world.addEvent({
        type: "deviation",
        character: key,
        detail: decision.deviation_reason,
      })
    }

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
        console.log(`  [${key}] on cooldown with ${targetKey} — skipping conversation`)
        applyActionToCharacter(c, decision)
        continue
      }

      const convId = `conv-${key}-${targetKey}-${world.step}`
      const record = {
        id: convId,
        participants: [key, targetKey] as [string, string],
        location: c.action,
        trigger: decision.want_to_talk.opening_topic,
        turns: [],
        startStep: world.step,
        endStep: world.step,
      }
      world.startConversation(convId, record)

      runConversation(
        {
          id: convId,
          initiatorKey: key,
          targetKey,
          location: c.action,
          trigger: decision.want_to_talk.opening_topic,
          startStep: world.step,
        },
        world,
        client
      )
        .then(async (completed) => {
          // Generate appraisal
          const appraisalContext = buildAppraisalContext({
            participants: completed.participants,
            location: completed.location,
            trigger: completed.trigger,
            turns: completed.turns,
            simTime: world.simTimeString(),
          })
          const appraisal = await runAppraisal(client, appraisalContext)

          world.endConversation(
            convId,
            appraisal?.summary,
            appraisal
              ? {
                  valence: appraisal.valence,
                  relationshipDelta: appraisal.relationship_delta,
                  takeaway: appraisal.takeaway,
                }
              : undefined
          )
          console.log(`  [Conversation ${convId}] complete — ${appraisal?.valence ?? "?"}`)
        })
        .catch((err) => {
          console.error(`[Conversation ${convId}] failed:`, err)
          world.endConversation(convId)
        })

      console.log(`  → ${CHARACTER_NAMES[key]} initiates conversation with ${CHARACTER_NAMES[targetKey]}`)
      continue
    }

    // Non-conversation actions
    const currentBlock = world.getCurrentPlanBlock(key)
    applyActionToCharacter(c, decision)

    // Log the action
    world.pushLogEntry(key, {
      type: "action",
      action: decision.action,
      description: decision.description,
      locationId: decision.target ?? c.tile.join(","),
      startMin: world.simMinutes,
      endMin: world.simMinutes + world.secPerStep / 60,
      followedPlan: decision.follow_plan,
      deviationReason: decision.deviation_reason,
    })

    console.log(`  ${CHARACTER_NAMES[key]}: ${decision.description} ${decision.emoji}${decision.follow_plan ? "" : " [deviation]"}`)
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

async function runAppraisal(
  client: NotionAgentsClient,
  context: string
): Promise<{ summary: string; valence: "positive" | "neutral" | "negative"; relationship_delta: "improved" | "neutral" | "damaged"; takeaway: string } | null> {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyActionToCharacter(
  c: ReturnType<WorldState["getCharacter"]>,
  decision: AgentDecision
): void {
  c.action = decision.description
  c.emoji = decision.emoji
  if (decision.target) c.plannedPath = [] // reset path so Phaser recalculates
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
