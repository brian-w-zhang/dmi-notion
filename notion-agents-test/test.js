import { NotionAgentsClient } from "@notionhq/agents-client"

const client = new NotionAgentsClient({ auth: process.env.NOTION_API_TOKEN })

// Step 1: list all agents this token can see
console.log("Listing agents...")
const { results: agents } = await client.agents.list()
console.log(`Found ${agents.length} agent(s):\n`)
for (const a of agents) {
  console.log(`  ${a.name}  (id: ${a.id})`)
}

if (agents.length === 0) {
  console.log("\nNo agents found — create one in Notion first (see setup notes).")
  process.exit(0)
}

// Step 2: ping the first agent with a simple message and stream the reply
const agentData = agents[0]
const agent = client.agents.agent(agentData.id)
console.log(`\nSending test message to "${agentData.name}"...`)

process.stdout.write("Agent: ")
for await (const chunk of agent.chatStream({
  message: "Reply with exactly one sentence confirming you received this test.",
  onMessage: (msg) => {
    if (msg.role === "agent") process.stdout.write(msg.content)
  },
})) {
  if (chunk.type === "started") process.stdout.write("")
  if (chunk.type === "done")    console.log("\n\nDone. SDK access confirmed.")
  if (chunk.type === "error")   console.error("\nStream error:", chunk.message)
}
