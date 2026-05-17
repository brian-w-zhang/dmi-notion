import { NotionAgentsClient, stripLangTags } from "@notionhq/agents-client"

const client = new NotionAgentsClient({ auth: process.env.NOTION_API_TOKEN })

// ── 1. List all agents ────────────────────────────────────────────────────────
console.log("=== Step 1: List agents ===")
const { results: agents } = await client.agents.list()
console.log(`Found ${agents.length} agent(s):`)
for (const a of agents) {
  console.log(`  "${a.name}"  id=${a.id}  version=${a.version?.number ?? "none"}`)
}

if (agents.length === 0) {
  console.log("No agents found — nothing to test.")
  process.exit(0)
}

// ── 2. chatStream — single stateless call ─────────────────────────────────────
const agentData = agents[0]
const agent = client.agents.agent(agentData.id)
console.log(`\n=== Step 2: chatStream (stateless) → "${agentData.name}" ===`)

const TEST_MESSAGE = `THIS IS A TEST. Do not write to any Notion databases. Provide output only.

Respond with a single JSON object and nothing else:
{ "received": true, "agent": "<your name>", "message": "test acknowledged" }`

let fullContent = ""
let threadId1 = ""

for await (const chunk of agent.chatStream({ message: TEST_MESSAGE })) {
  if (chunk.type === "started") {
    threadId1 = chunk.thread_id
    console.log(`  [started] thread_id=${chunk.thread_id}`)
  } else if (chunk.type === "message" && chunk.role === "agent") {
    fullContent = stripLangTags(chunk.content)
    console.log(`  [message] raw length=${chunk.content.length}`)
  } else if (chunk.type === "done") {
    console.log(`  [done]`)
  } else if (chunk.type === "error") {
    console.error(`  [error] ${chunk.code}: ${chunk.message}`)
  }
}

console.log("  Content:", fullContent.slice(0, 300))
const jsonMatch = fullContent.match(/\{[\s\S]*\}/)
if (jsonMatch) {
  try {
    const parsed = JSON.parse(jsonMatch[0])
    console.log("  JSON parse: OK →", parsed)
  } catch {
    console.log("  JSON parse: FAILED — response was not valid JSON")
  }
} else {
  console.log("  JSON parse: no JSON block found in response")
}

// ── 3. chatStream — thread continuation (threadId) ────────────────────────────
console.log(`\n=== Step 3: chatStream continuation (same threadId) ===`)

const FOLLOW_UP = `THIS IS A TEST FOLLOW-UP. Do not write to any Notion databases. Provide output only.

Reply with only: { "turn": 2, "remembered_turn_1": true }`

let fullContent2 = ""
for await (const chunk of agent.chatStream({ message: FOLLOW_UP, threadId: threadId1 })) {
  if (chunk.type === "started") {
    console.log(`  [started] same thread=${chunk.thread_id === threadId1}`)
  } else if (chunk.type === "message" && chunk.role === "agent") {
    fullContent2 = stripLangTags(chunk.content)
  } else if (chunk.type === "done") {
    console.log(`  [done]`)
  } else if (chunk.type === "error") {
    console.error(`  [error] ${chunk.code}: ${chunk.message}`)
  }
}
console.log("  Content:", fullContent2.slice(0, 300))

// ── 4. Parallel calls — two agents simultaneously ────────────────────────────
if (agents.length >= 2) {
  console.log(`\n=== Step 4: Parallel chatStream — "${agents[0].name}" + "${agents[1].name}" ===`)
  const agent2 = client.agents.agent(agents[1].id)

  const PARALLEL_MSG = `THIS IS A TEST. Do not write to any Notion databases. Provide output only.
Reply with only: { "agent": "<your name>", "parallel": true }`

  const [r1, r2] = await Promise.allSettled([
    (async () => {
      let out = ""
      for await (const chunk of agent.chatStream({ message: PARALLEL_MSG })) {
        if (chunk.type === "message" && chunk.role === "agent") out = stripLangTags(chunk.content)
      }
      return out
    })(),
    (async () => {
      let out = ""
      for await (const chunk of agent2.chatStream({ message: PARALLEL_MSG })) {
        if (chunk.type === "message" && chunk.role === "agent") out = stripLangTags(chunk.content)
      }
      return out
    })(),
  ])
  console.log(`  "${agents[0].name}":`, r1.status === "fulfilled" ? r1.value.slice(0, 150) : `ERROR: ${r1.reason}`)
  console.log(`  "${agents[1].name}":`, r2.status === "fulfilled" ? r2.value.slice(0, 150) : `ERROR: ${r2.reason}`)
} else {
  console.log(`\n=== Step 4: Skipped (only 1 agent available) ===`)
}

console.log("\n=== All tests complete ===")
