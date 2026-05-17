import { NotionAgentsClient, stripLangTags } from "@notionhq/agents-client"
import type { WorldState } from "../simulation/WorldState.js"
import type { GroupConversationRecord, ConversationTurn } from "../simulation/types.js"
import { CHARACTER_AGENT_IDS, CHARACTER_NAMES } from "./characters.js"

const MAX_ROUNDS = 3   // full round-trips through all participants
const MAX_TURNS_PER_ROUND = 1  // each participant gets one turn per round

interface GroupConversationInit {
  id: string
  participants: string[]  // character keys; first is the meeting initiator (Michael)
  location: string
  topic: string
  startStep: number
}

// Runs a multi-speaker group conversation — Michael opens, all participants
// get a chance to respond each round, Michael closes after MAX_ROUNDS.
export async function runGroupConversation(
  init: GroupConversationInit,
  world: WorldState,
  client: NotionAgentsClient
): Promise<GroupConversationRecord> {
  const { id, participants, location, topic, startStep } = init
  const turns: ConversationTurn[] = []
  const simTime = world.simTimeString()
  const buildHistory = () => turns.map((t) => ({
    speaker: CHARACTER_NAMES[t.speaker] ?? t.speaker,
    line: t.line,
  }))

  console.log(`\n[Group Meeting ${id}] "${topic}" — ${participants.length} participants`)

  // ── Opening — initiator speaks first ────────────────────────────────────────
  const initiatorKey = participants[0]
  const openingTurn = await callAgentInMeeting(
    client, initiatorKey, participants, topic, location, simTime,
    buildHistory(), "opening"
  )
  if (openingTurn) {
    turns.push(openingTurn)
    console.log(`  [${CHARACTER_NAMES[initiatorKey]}]: "${openingTurn.line.slice(0, 80)}"`)
  }

  // ── Rounds — each participant speaks, initiator may interject ───────────────
  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const speakerKey of participants.slice(1)) {  // skip initiator in rotation
      const turn = await callAgentInMeeting(
        client, speakerKey, participants, topic, location, simTime,
        buildHistory(), "participating"
      )
      if (turn) {
        turns.push(turn)
        console.log(`  [${CHARACTER_NAMES[speakerKey]}]: "${turn.line.slice(0, 80)}"`)
        if (turn.tone === "flat" && turns.length > 3) continue  // silent pass
      }
    }

    // Initiator gets an interject turn after each round
    if (round < MAX_ROUNDS - 1) {
      const interjectTurn = await callAgentInMeeting(
        client, initiatorKey, participants, topic, location, simTime,
        buildHistory(), "interjecting"
      )
      if (interjectTurn) {
        turns.push(interjectTurn)
        console.log(`  [${CHARACTER_NAMES[initiatorKey]}]: "${interjectTurn.line.slice(0, 80)}"`)
      }
    }
  }

  // ── Closing — initiator wraps up ─────────────────────────────────────────────
  const closingTurn = await callAgentInMeeting(
    client, initiatorKey, participants, topic, location, simTime,
    buildHistory(), "closing"
  )
  if (closingTurn) {
    turns.push(closingTurn)
    console.log(`  [${CHARACTER_NAMES[initiatorKey]}]: "${closingTurn.line.slice(0, 80)}"`)
  }

  return {
    id,
    participants,
    location,
    topic,
    turns,
    startStep,
    endStep: world.step,
  }
}

// ── Per-agent call ────────────────────────────────────────────────────────────

async function callAgentInMeeting(
  client: NotionAgentsClient,
  speakerKey: string,
  allParticipants: string[],
  topic: string,
  location: string,
  simTime: string,
  history: { speaker: string; line: string }[],
  role: "opening" | "participating" | "interjecting" | "closing"
): Promise<ConversationTurn | null> {
  const agentId = CHARACTER_AGENT_IDS[speakerKey]
  if (!agentId) return null

  const others = allParticipants
    .filter((k) => k !== speakerKey)
    .map((k) => CHARACTER_NAMES[k])

  const roleInstruction: Record<typeof role, string> = {
    opening:       `You called this meeting. Open with your topic. Set the tone. Be yourself.`,
    participating: `You are in a meeting. React to what's been said. You may speak up or stay quiet (respond with a very short line or just "..." if you have nothing to add).`,
    interjecting:  `React to what your colleagues said. Redirect if needed. Keep it moving.`,
    closing:       `Wrap up the meeting. Summarize what was decided. Dismiss everyone.`,
  }

  const payload = {
    mode: "conversation_turn",
    character: CHARACTER_NAMES[speakerKey],
    sim_time: simTime,
    scene: {
      location,
      event: "office_meeting",
      topic,
      attendees: allParticipants.map((k) => CHARACTER_NAMES[k]),
      speaking_to: others,
    },
    conversation_so_far: history,
    role,
    instructions: [
      roleInstruction[role],
      "Check your memory for anything relevant to this topic.",
      "Respond ONLY with a JSON object:",
      JSON.stringify({
        line: "what you say out loud — or '...' to stay silent",
        tone: "warm | dry | nervous | sarcastic | flat | enthusiastic | deflecting | authoritative",
        nonverbal: "brief physical action — or null",
        end: false,
      }),
    ],
  }

  const agent = client.agents.agent(agentId)
  let fullContent = ""
  for await (const chunk of agent.chatStream({ message: JSON.stringify(payload, null, 2) })) {
    if (chunk.type === "message" && chunk.role === "agent") {
      fullContent = stripLangTags(chunk.content)
    } else if (chunk.type === "error") {
      console.error(`[Meeting ${speakerKey}] stream error:`, chunk.message)
      return null
    }
  }

  const match = fullContent.match(/\{[\s\S]*\}/)
  if (!match) return null
  const parsed = JSON.parse(match[0])

  return {
    speaker: speakerKey,
    line: parsed.line ?? "...",
    tone: parsed.tone,
    nonverbal: parsed.nonverbal ?? undefined,
    thinking: parsed.thinking,
  }
}
