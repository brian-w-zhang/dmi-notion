import { NotionAgentsClient, stripLangTags } from "@notionhq/agents-client"
import type { WorldState } from "../simulation/WorldState.js"
import type { ConversationRecord, ConversationTurn } from "../simulation/types.js"
import { buildConversationTurnContext } from "./ContextBuilder.js"
import { CHARACTER_AGENT_IDS, CHARACTER_NAMES } from "./characters.js"

const MAX_TURNS = 8

interface ConversationInit {
  id: string
  initiatorKey: string
  targetKey: string
  location: string
  trigger: string
  startStep: number
}

// Runs a full multi-turn conversation between two character agents.
// Blocks both participants for the duration. Other characters tick normally.
export async function runConversation(
  init: ConversationInit,
  world: WorldState,
  client: NotionAgentsClient,
  onTurnComplete?: (turn: ConversationTurn) => void
): Promise<ConversationRecord> {
  const { id, initiatorKey, targetKey, location, trigger, startStep } = init
  const history: { speaker: string; line: string }[] = []
  const turns: ConversationTurn[] = []
  const simTimeStr = world.simTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

  const initiatorAgent = client.agents.agent(CHARACTER_AGENT_IDS[initiatorKey])
  const targetAgent = client.agents.agent(CHARACTER_AGENT_IDS[targetKey])

  // Each character gets their own thread for this conversation
  let initiatorThreadId: string | undefined
  let targetThreadId: string | undefined

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const isEvenTurn = turn % 2 === 0
    const speakerKey = isEvenTurn ? initiatorKey : targetKey
    const speakerAgent = isEvenTurn ? initiatorAgent : targetAgent
    const speakerThreadId = isEvenTurn ? initiatorThreadId : targetThreadId

    const context = buildConversationTurnContext({
      speakerKey,
      listenerKey: isEvenTurn ? targetKey : initiatorKey,
      scene: { location, trigger },
      history,
      isOpening: turn === 0,
      simTime: simTimeStr,
    })

    const parsed = await callAgentForDialogue(speakerAgent, context, speakerThreadId)

    // Capture returned thread ID for continuation
    if (isEvenTurn) initiatorThreadId = parsed.threadId
    else targetThreadId = parsed.threadId

    const turnRecord: ConversationTurn = {
      speaker: speakerKey,
      line: parsed.line,
      tone: parsed.tone,
      nonverbal: parsed.nonverbal ?? undefined,
    }
    turns.push(turnRecord)
    history.push({ speaker: CHARACTER_NAMES[speakerKey], line: parsed.line })
    onTurnComplete?.(turnRecord)

    console.log(`  [${CHARACTER_NAMES[speakerKey]}]: "${parsed.line}"`)

    if (parsed.end) break
  }

  return {
    id,
    participants: [initiatorKey, targetKey],
    location,
    trigger,
    turns,
    startStep,
    endStep: world.step,
  }
}

async function callAgentForDialogue(
  agent: ReturnType<NotionAgentsClient["agents"]["agent"]>,
  message: string,
  threadId?: string
): Promise<{ line: string; tone?: string; nonverbal?: string | null; end: boolean; threadId?: string }> {
  let fullContent = ""
  let returnedThreadId: string | undefined

  for await (const chunk of agent.chatStream({ message, threadId })) {
    if (chunk.type === "started") {
      returnedThreadId = chunk.thread_id
    } else if (chunk.type === "message" && chunk.role === "agent") {
      fullContent = stripLangTags(chunk.content)
    } else if (chunk.type === "error") {
      throw new Error(`Agent stream error: ${chunk.message}`)
    }
  }

  // Extract the JSON block from the agent's response
  const jsonMatch = fullContent.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.warn("Agent returned non-JSON dialogue response:", fullContent)
    return { line: fullContent.trim(), end: false, threadId: returnedThreadId }
  }

  const parsed = JSON.parse(jsonMatch[0])
  return {
    line: parsed.line ?? fullContent.trim(),
    tone: parsed.tone,
    nonverbal: parsed.nonverbal,
    end: parsed.end === true || parsed.end === "true",
    threadId: returnedThreadId,
  }
}
