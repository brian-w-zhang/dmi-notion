import { NotionAgentsClient, stripLangTags } from "@notionhq/agents-client"
import type { WorldState } from "../simulation/WorldState.js"
import { buildTickContext } from "./ContextBuilder.js"
import { runConversation } from "./ConversationFlow.js"
import { CHARACTER_AGENT_IDS, CHARACTER_NAMES } from "./characters.js"

interface AgentDecision {
  action: "continue" | "move_to" | "use_appliance" | "initiate_conversation" | "idle"
  target?: string
  description: string
  emoji: string
  reasoning: string
  want_to_talk?: { character: string; topic: string }
}

// Fires all active character ticks in parallel against the current world snapshot.
// Returns decisions for applying to world state.
export async function runTickRound(
  world: WorldState,
  client: NotionAgentsClient
): Promise<Map<string, AgentDecision>> {
  const active = world.getActiveCharacters()
  console.log(`\n[Round ${world.step}] Ticking ${active.length} active characters in parallel...`)

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

    if (decision.action === "initiate_conversation" && decision.want_to_talk) {
      const targetName = decision.want_to_talk.character
      const targetKey = Object.entries(CHARACTER_NAMES).find(
        ([, name]) => name === targetName
      )?.[0]

      if (targetKey && world.characters.get(targetKey)?.state === "active") {
        const convId = `conv-${key}-${targetKey}-${world.step}`
        const record = {
          id: convId,
          participants: [key, targetKey] as [string, string],
          location: c.action,
          trigger: decision.want_to_talk.topic,
          turns: [],
          startStep: world.step,
          endStep: world.step,
        }
        world.startConversation(convId, record)

        // Spawn conversation async — does not block other characters
        runConversation(
          { id: convId, initiatorKey: key, targetKey, location: c.action, trigger: decision.want_to_talk.topic, startStep: world.step },
          world,
          client
        ).then((completed) => {
          world.endConversation(convId)
          // Merge completed record (with turns) back into world state
          // It'll be picked up in the next step's advanceStep() flush
          ;(world as any)._completedConversations?.push(completed)
        }).catch((err) => {
          console.error(`[Conversation ${convId}] failed:`, err)
          world.endConversation(convId)
        })

        console.log(`  → ${CHARACTER_NAMES[key]} initiates conversation with ${targetName}`)
        continue
      }
    }

    // Apply non-conversation actions to character state
    c.action = decision.description
    c.emoji = decision.emoji
    console.log(`  ${CHARACTER_NAMES[key]}: ${decision.description} ${decision.emoji}`)
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

function parseDecision(raw: string, characterKey: string): AgentDecision {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.warn(`[${characterKey}] non-JSON response:`, raw.slice(0, 100))
    return { action: "idle", description: "idle", emoji: "💭", reasoning: raw.slice(0, 80) }
  }
  try {
    return JSON.parse(jsonMatch[0]) as AgentDecision
  } catch {
    return { action: "idle", description: "idle", emoji: "💭", reasoning: "parse error" }
  }
}
