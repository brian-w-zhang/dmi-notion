## Vision

A live, 2D top-down simulation of the Dunder Mifflin office (Phaser + tile map) where characters move, talk, work, gossip, and react to perturbations in real time.

**Canon is the seed state, not the objective.** The Office cast provides a shared personality grounding reference (“Dwight-like”, “Michael-like”) so viewers can judge identity consistency and then watch how dynamics branch under new conditions.

**Core goal:** build a psychologically grounded, cognitively rich generative-agent sandbox that combines:

- Smallville’s memory/reflection/planning loop
- The Sims’ needs + object advertising / affordance discovery
- Desire-driven / needs-to-language bridges (D2A-style)
- AgentSociety-style explicit separation of emotions/needs/cognition and interpretable planning bridges (e.g., TPB)

**Demo artifact:** not a single reenacted cold open, but replayable *“Office episodes”* (pre-run simulation days) that can be scrubbed, re-watched, and inspected like an interactive documentary.

---

## Reference: Generative Agents (Park et al., 2023)

Study their techniques and improve on each, but treat it as a foundation rather than the end state:

- **Sprites & movement** — Smallville used Phaser.js with a tile-based map. Adapt: SVG/canvas floor plan of Dunder Mifflin with named zones (Michael's Office, Open Plan, Conference Room, Kitchen, Reception). Characters snap to zones rather than pixel-level movement.
- **Dialogue** — Generative Agents used proximity triggers to initiate conversation. Adapt: Conversations DB in Notion, semi-synchronous turns via agent triggers. Richer because characters have 9 seasons of relational history, not a 200-word bio.
- **Context window** — They used a memory stream with recency + relevance + importance scoring for retrieval. Adapt: same scoring model but applied to Office-canon episodic memories. Workplace context (paper sales, Dunder Mifflin culture, specific relationships) remains permanently relevant.
- **Reflection** — Reflection is frequent and event-driven (not just periodic/end-of-day). Reflections are baked into many interactions (mirroring the show’s “talking head” + internal reflection cadence), then later synthesized into higher-level narrative identity updates.
- **Planning** — Morning planning step generating a daily intention. Keep and improve: intentions are character-specific and psychologically grounded (Michael's intention is never just "complete tasks").
- demo: https://reverie.herokuapp.com/arXiv_Demo/

**Key improvement over Generative Agents:** Their agents had shallow persona prompts. DMI characters have episodic memory seeded from actual canon dialogue and annotated psychological state. Identity is architecturally persistent, not just prompt-level.

---

## Why Office Memories Stay Relevant in a Novel Simulation

The characters' memories are *about paper sales, Scranton, and each other* — which is exactly what the simulation environment contains. There is no domain mismatch. Jim's memory of pranking Dwight with the stapler-in-jello is directly retrievable when he's sitting across from Dwight at 10am. Michael's memory of corporate visits shapes how he responds to any authority figure who walks in.

The seeding strategy: annotated CSV memories from S1–S2E12 are loaded into each character's Memory DB. Every future simulation action can retrieve from this store. The workplace context is the *same* context the memories were formed in. That's the advantage over Generative Agents' generic sandbox.

---

## Notion Custom Agents as the Engine

Notion is the *mind layer* for persistence, inspectability, and orchestration. Phaser renders/enforces world rules; Notion agents decide and write cognition artifacts.

High-level responsibilities split:

- **Phaser (body + world):** needs decay, PAD baseline drift, perception radius, navigation, action execution, conversation session management, and candidate action assembly.
- **Notion (mind + memory):** memory storage/retrieval, relationship summaries, talking heads/reflections, and high-level decision selection.

Key Notion agents:

- **One custom agent per character** (Michael, Dwight, Jim, Pam, etc.).
- Mental processes (perception → needs appraisal → memory retrieval → decision → dialogue → reflection) are **not split into separate agents**. Instead, they are encoded as sequential, multi-step tasks in each character agent's instruction page, forming a single decision-making loop that runs within one agent invocation.
- The instruction page for each character defines: their personality + psychological baseline, the ordered cognitive pipeline (perception → appraisal → retrieval → choose action → execute → reflect), and the Notion DB operations (read/write Memory, Relationships, World State, Conversations) to call at each step.

### Strategy 1 — Notion Agents SDK as Synchronous API

For synchronous inter-agent interactions, use the **Notion Agents SDK** (`@notionhq/agents-client`, Alpha) as the message bus between characters and between the orchestrator and the backend:

- **Orchestrator** instantiates a `NotionAgentsClient` with an internal integration token and holds a reference to each character agent by their Notion agent ID.
- **Invoking a character:** call `agent.chatStream({ message, threadId? })` to send a context payload (current world state, perception snapshot, pending conversation turn) to a character agent and stream back their action decision + dialogue.
    - Use `threadId` to continue an existing conversation thread, preserving in-agent memory across turns in the same interaction.
- **Inter-character dialogue:** the orchestrator mediates — when Character A's response indicates `initiate_conversation(target: B, topic: ...)`, the orchestrator assembles B's context payload and calls `agentB.chatStream(...)`. No mail involved; the orchestrator is the message router.
- **Polling fallback:** for fire-and-forget writes (memory encoding, end-of-day reflection), use `agent.chat()` + `thread.poll()` so the orchestrator isn't blocked.
- **Structured payloads:** the `message` field carries a JSON-encoded context block (world state snapshot, needs vector, recent percepts, conversation history). Each character's instruction page defines how to parse and act on this payload.

```tsx
import { NotionAgentsClient, stripLangTags } from "@notionhq/agents-client"

const client = new NotionAgentsClient({ auth: process.env.NOTION_API_TOKEN })
const jimAgent = client.agents.agent(JIM_AGENT_ID)

// Send world-state context to Jim; stream his decision back
for await (const chunk of jimAgent.chatStream({ message: JSON.stringify(contextPayload) })) {
  if (chunk.type === "message" && chunk.role === "agent") {
    process.stdout.write(stripLangTags(chunk.content))
  }
}
```

The Agents SDK keeps all cognitive I/O in one typed client with no additional infrastructure.

**Game action execution** is handled by a single `executeGameAction` Notion worker, complementing the SDK layer. After the SDK triggers a character agent and streams back a decision, the orchestrator passes the structured action output to this worker:

- The character agent emits `{ character, actionType, params }` — `actionType` is a string (e.g. `"move"`, `"initiate_conversation"`, `"reflect"`), `params` carries the action-specific payload.
- The worker writes the appropriate Notion DB(s) (World State, Conversations, Memory, Relationships) and forwards the action to the backend via `POST /action`.
- The backend pushes it to Phaser over WebSocket; Phaser executes the visual side (sprite movement, dialogue bubble, animation) independently.

```tsx
// Orchestrator: SDK triggers the agent, then worker executes the result
const action = await getActionFromAgentStream(jimAgent, contextPayload)
await executeGameAction(action) // writes Notion DBs + POST /action → WebSocket → Phaser
```

One worker handles the full action space regardless of how many action types accumulate. New action types require only a new routing branch, not a new worker.

### Strategy 2 — Backend API Bridge to 2D Frontend

A lightweight backend (Node.js or Python) sits between Notion and the 2D simulation frontend:

- Exposes REST endpoints that Workers call: `POST /move`, `POST /dialogue`, `POST /event`
- Pushes state changes to the frontend via WebSocket
- The 2D frontend subscribes to WebSocket updates and renders character movements and dialogue bubbles in real time
- Also serves as the Notion API polling layer for the DVR/replay feature

The backend is thin — it's a bridge, not the brain. All cognitive work stays in Notion agents.

---

## Frontend Design

- **2D office map (Tiled → Phaser)**
    - Tiled-authored map rendered in Phaser (tile-based).
    - Semantic zones (office areas) + entity metadata (desks, fridge, copier, conference table, water cooler, etc.).
    - The map is not just visuals: it’s a structured affordance layer for action selection.
- **Character sprites + navigation**
    - Tile navigation with a simple action executor (walk → face direction → animate → complete).
    - Early MVP can snap-to-zone for legibility; later can move tile-granular.
- **Conversation UI**
    - Dialogue bubbles in-world + optional transcript panel.
    - Conversations are proximity-triggered (Smallville-style), but constrained by zone privacy/acoustics.
- **Episode replay + DVR**
    - A full-day simulation can be replayed as an “episode” (play/pause/scrub).
    - Timeline is driven by an append-only event log so it is deterministic and inspectable.
- **POV / camera**
    - Manual POV: follow a character, zoom/pan, jump to an event.
    - Auto POV: a “documentary crew” layer that switches to high-salience events (meetings, confrontations, dense clusters, rapid state changes) and triggers periodic “talking heads”.
- **Inspectability layer (the research hook)**
    - Clicking a character at a timestamp shows: needs vector, PAD/emotion snapshot, selected action + alternatives considered, retrieved memories + why they were retrieved, relationship context, and internal thought.
    - Wiki-like browsing of character profiles, memory logs, relationship graph, and narrative identity summaries.
    - Talking heads and reflections can be browsed as their own artifacts, not only as end-of-day outputs.

---

## Demo Strategy (Twitter + Web)

### “Episodes”, not a single cold open

Rather than reenacting a cold open, the core demo artifact is a small set of *replayable simulation days*:

- Run the sim to generate ~3 predefined “Office episodes” (each = one full simulation day).
- Each episode is seeded with a clear perturbation premise, but the resulting interactions are emergent.
- Episodes are hosted publicly on a website with a DVR-like player (play/pause/scrub).

### Perturbation-driven sitcom premises (episode seeds)

Examples:

- Downsizing rumor (security/stress spike; info diffusion)
- Corporate visit / audit (status/esteem threat)
- HR crackdown / policy change (norms + perceived control shift)
- Incentive contest / sales leaderboard (competence/esteem pressure)
- Prank escalation chain (social dynamics + retaliation loops)

### Documentary camera + “talking heads” as first-class mechanics

The demo should feel like an interactive documentary:

- **Manual POV:** follow any character, zoom/pan, and jump between key events.
- **Auto POV:** a “documentary crew” layer that finds salient moments (dense clusters, confrontations, meetings, sharp relationship deltas) and switches camera.
- **Talking heads:** frequent, situation-triggered cutaways (not once/day) as outward reflections to the documentary crew.
    - These are distinct from private internal reflections: talking heads are “performative” and audience-aware, while internal reflections can be more raw.

### Inspectable episodes (why this is Notion-native)

The website episode player should make internal cognition explorable:

- click any moment → see retrieved memories + decision rationale
- click any conversation → see both sides’ internal thought + relationship context
- view needs/PAD traces over time

### Twitter clip

A 30–60s highlight reel cut from a pre-run episode:

- show the office + event feed
- show a POV switch + one high-salience interaction
- show a talking head
- end with “watch the full episode” + link

---

## Key Inspirations Beyond Smallville (high level)

- **The Sims (needs + object advertising)**
    - Needs decay creates constant action pressure.
    - “Objects as advertisers” means the world offers actions; agents don’t need to invent actions from scratch.
    - DMI twist: use utility-style scoring to *build a candidate set*, then let the LLM choose with memory/identity/social context.
- **D2A (desire-driven autonomy)**
    - Convert numeric needs into natural-language desires so the LLM reasons over “I feel excluded / I need approval” rather than raw meters.
- **AgentSociety**
    - Three-layer mental framing (emotions / needs / cognition) and interpretable bridges (TPB-like scoring) that keep decisions auditable.
- **PAD-tagged / state-dependent memory**
    - Encode affect with memories and weight retrieval by similarity to current affect to get emotionally coherent recall.
- **Option/action hierarchy (cost control)**
    - LLM chooses a high-level option; Phaser executes the low-level action chain without LLM calls every tick.

---

## Research Instrumentation (Build in from Day 1)

Even if the paper comes later, wire these now so the data exists:

- Every agent action → timestamped Event Log row (character, action type, target, content summary, emotional state at time)
- Every relationship update → delta + triggering event + before/after state
- Every memory write → importance score + emotion tag
- Reflections + talking heads → stored as retrievable cognition artifacts (with occasional heavier end-of-day synthesis), so the next decision can reference both immediate micro-reflections and longer-term narrative identity

This costs nothing to add at build time. Retrofitting it later is painful.

[the office themed games (inspiration)](https://www.notion.so/the-office-themed-games-inspiration-32dd23b11b04801ba01ef1f0254511d2?pvs=21)
