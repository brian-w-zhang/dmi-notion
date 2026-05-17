# Dunder Mifflin Infinity

A psychologically grounded generative-agent simulation of the Scranton branch of Dunder Mifflin. A 2D top-down game sandbox built with Phaser, a hand-painted Tiled map, and LimeZu character assets. The Office cast runs forward from a canon seed state; identity is architecturally persistent, not just prompt-level, and emergent behavior is the point.

This is not a reenactment. Canon is the seed, not the objective.

---

## What It Is

DMI is a live top-down sandbox where characters move through a faithful map of the Dunder Mifflin office, make decisions grounded in their psychological profiles and episodic memories, initiate conversations, react to perturbations, and generate "talking heads" as the simulation runs. The goal is to produce replayable Office episodes: simulation days seeded with a perturbation premise (a downsizing rumor, a corporate audit, a prank escalation) where the resulting dynamics are fully emergent.

The core demo artifact: inspectable simulation days you can scrub like a DVR, click into any moment to see a character's needs vector, retrieved memories, decision rationale, and internal state.

---

## Research Foundations

DMI synthesizes several lines of research into a single architecture:

### Park et al. - Generative Agents / Smallville (2023)
The primary inspiration. Smallville demonstrated that LLM agents with a memory stream (recency + relevance + importance scoring), daily planning, and reflection can produce surprisingly coherent emergent social behavior. DMI improves on it in one key way: Smallville agents had shallow persona prompts. DMI characters have episodic memory seeded from actual canon dialogue and annotated psychological state. There is no domain mismatch: Jim's memory of pranking Dwight is directly retrievable when he's sitting across from Dwight at 10am in the same office.

### The Sims - Needs + Object Advertising
Characters don't invent actions from scratch. The world advertises affordances: the water cooler offers "get water," the copier offers "print report," the conference room offers "attend meeting." A numeric needs vector (hunger, social, stimulation, belonging, esteem, autonomy) decays over time, creating constant action pressure. The simulation scores candidate actions by `need_urgency x weight x proximity x social_context`, then passes the shortlist to the LLM to select with identity and memory in context.

### Psychological Grounding
The memory and emotion systems are built around established cognitive science:

- **OCC Model** (Ortony, Clore & Collins, 1988): emotions as appraisals of events relative to goals. Michael isn't "sad" randomly; he's sad because a specific goal ("be seen as the cool boss") was blocked by a specific event. Every memory row carries a `goal_status` field encoding the appraisal.
- **Spreading Activation** (Collins & Loftus, 1975): memory retrieval expands along associative edges, not just keyword matches. A "Fixed Bag" of curated concept terms per character operationalizes this in the retrieval layer.
- **PAD Model** (Pleasure-Arousal-Dominance): a continuous affective state that drifts based on events and shapes memory retrieval weighting.
- **State-Dependent Memory** (Bower, 1981): memories encoded in a similar affective state are easier to retrieve. Retrieval scoring weights `state_match` alongside recency and importance.
- **Constructive Episodic Simulation** (Schacter & Addis, 2007): retrieved reflections are passed as predictive priors, not just history. Jim doesn't just recall "I put the stapler in Jello once" — he simulates forward from it.
- **Big Five (OCEAN)**: personality traits map directly to simulation parameters (not passed raw to the LLM). Extraversion shapes social need decay rate; Conscientiousness shapes plan adherence; Neuroticism shapes stress accumulation.

---

## Architecture

```
Phaser frontend  <── WebSocket ──>  Backend bridge  <──>  LLM agents
  (body + world)                    (Node/Python)          (mind + memory)
```

**Phaser (body + world):** renders the tilemap, handles character movement and animation, manages needs decay, enforces world rules, assembles candidate action sets, and executes action chains (walk, face, animate, SFX, complete). Two modes: **Sandbox** (player-controlled, dev/testing) and **Simulation** (replay-driven, agent output).

**LLM agents (mind + memory):** one agent per character (Michael, Dwight, Jim, Pam, etc.). Each runs a full cognitive pipeline in a single invocation: perception, needs appraisal, memory retrieval, action selection, dialogue, reflection.

**Backend bridge (planned):** a thin Node/Python server that mediates between the agents and Phaser. Exposes REST endpoints and pushes state changes to the frontend over WebSocket.

---

## Repository Layout

```
frontend/              Next.js + Phaser frontend (the rendered simulation)
  app/                 Next.js App Router entry point
    dashboard/         Character roster + per-character inspect pages
  components/          React UI components (CharacterCard, NeedsCurvesPanel, PersonalityRadar, …)
  game/                All Phaser game code
    scenes/            Boot → ModeSelect → MainMap (sandbox) or MainMapReplay (simulation)
    systems/           NpcActionRunner, PathfindingSystem, ChairSystem, ApplianceInteractionSystem, …
    entities/          Character, Car, SpeechBubbleOverlay, TalkHeadEmojiOverlay
    config/            characters.ts, characterArrivals.ts, characterCars.ts, npcActionLoops.ts, …
    data/              appliances.ts, officeObjects.ts, characterAnimations.ts
  public/assets/
    tilemap/           Tiled map JSON + tileset PNGs
    sprites/           Character spritesheets (one per cast member, LimeZu format)
    sound effects/     SFX library
    simulation/        replay.json — serialized agent-driven simulation run
  public/data/         needs_config.json, personalities.json, character_need_overrides.json

generative_agents/     Park et al. reference implementation (Django + Python)
                       Kept as a reference; DMI's architecture diverges significantly.

planning/              Design documents
  dmi-plan.MD          Full project vision and architecture
  psychology.MD        Psychological theory to implementation mappings
  personality-ideas.MD Big Five to simulation parameter mappings per character
  decision-loop-ideas.txt  Per-tick decision loop pseudocode

scripts/               Code generation utilities
  generate-office-objects.js   Generates office-objects.json from the Tiled map
  generate-appliances-json.js  Generates the appliance skeleton from the Tiled map
```

---

## Running the Frontend

The Phaser game runs inside a Next.js app. The simulation backend is not yet connected; the frontend runs standalone against a pre-recorded `replay.json`.

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A mode-select screen appears with two options:

- **SANDBOX** — player-controlled (WASD), used for dev and map testing.
- **SIMULATION** — replay mode; plays back a pre-recorded agent-driven session with all 14 cast members moving, talking, and interacting autonomously.

The **dashboard** at [http://localhost:3000/dashboard](http://localhost:3000/dashboard) shows the full cast roster and links to per-character pages with needs curves, Big Five personality radar, and sprite preview.

**Sandbox controls:**
| Key | Action |
|-----|--------|
| WASD / Arrow keys | Move Dwight (dismounted) / drive car (mounted) |
| X | Dismount / remount car |
| C | Sit at nearest chair / stand up |
| 1 | Interact with nearest appliance |
| E | Enter / exit building |
| H | Toggle HUD (coordinates, zone, key hints) |
| Mouse drag | Pan camera |
| Scroll wheel | Zoom |

---

## Milestones

### ✅ 1. World Layer
The office map as a structured affordance space, not just visuals.

- Tiled map with named semantic zones (open plan, Michael's office, conference room, kitchen, reception, warehouse)
- Object metadata layer: desks, copier, fridge, water cooler, whiteboard, printers — each with action point coordinates and affordance tags
- Appliance interaction system with progress bars and SFX
- Chair sit/stand system with per-seat ownership and sit point data
- Building entrance transitions (interior ↔ exterior)
- Car system with mount/dismount, driving state, and auto-park
- Collision and walkability zones; polygon-based pathfinding grid

### ✅ 2. Character System
All 14 canon cast members running as independent agents in the same world.

- All cast members spawned with individual spritesheets and animation registration
- NPC action runner: scripted daily loops (desk work, appliance use, chair sit/stand, dialogue)
- Pathfinding (A\* on a walkability grid) and navigation to target tiles/zones
- Commuting system: characters arrive by car, park, and enter the building at scene start
- Character-to-character proximity detection; `NpcDialogueCoordinator` manages conversation turns
- Speech bubble overlays and talking-head emoji overlays during dialogue
- Mode select screen: **Sandbox** (player-controlled) vs. **Simulation** (replay-driven)

### 🔄 3. Needs System
The Sims-style need decay creating constant action pressure.

- Needs data layer: `needs_config.json` with decay curves and per-character overrides
- Big Five personality data: `personalities.json` maps each character's OCEAN scores
- Dashboard UI: per-character needs curves (graphed over time) and Big Five radar chart
- *Not yet wired:* runtime need decay in the simulation loop; urgency-scored action candidate assembly

### 🔄 4. DVR / Replay Layer
Every simulation run is a replayable episode.

- `replay.json` format: timestamped event log with character positions, facing, animation, action, emoji, PAD state, needs snapshot, and active conversation turns
- `MainMapReplay` scene plays back a recorded run against the full tilemap with all 14 characters
- *Not yet implemented:* scrub controls, timeline UI, auto POV "documentary crew" camera

### ⬜ 5. Cognitive Loop
The per-tick decision pipeline that runs inside each character agent.

- Perception snapshot: what each character can currently see and hear within their radius
- Memory retrieval: weighted score of `importance × 0.4 + recency × 0.3 + state_match × 0.3`
- PAD (Pleasure-Arousal-Dominance) state tracking and baseline drift
- OCC appraisal: emotions as goal-relative event evaluations, written into every memory row
- Daily morning planning: character-specific intentions grounded in personality and current needs
- Action selection: LLM receives needs vector, candidate actions, retrieved memories, current plan, relationship context → selects one
- Post-action appraisal: fixed delta for physical actions; appraisal agent for social/dialogue outcomes
- Micro-reflections after significant events; end-of-day synthesis into narrative identity updates

### ⬜ 6. Memory Architecture
Episodic memory seeded from canon and extended by simulation — the core identity persistence layer.

- Memory DB per character, seeded with annotated memories from S1–S2 canon dialogue
- Memory write schema: content, importance score, PAD state at encoding, OCC `goal_status`, relational deltas
- Retrieval using Fixed Bag spreading activation (8–12 curated concept terms per character)
- State-dependent retrieval: current PAD state weights `state_match` in retrieval scoring
- Constructive simulation: retrieved memories passed as predictive priors, not just historical facts
- Relationship DB: per-pair relationship summaries updated with deltas and triggering events

### ⬜ 7. Notion Agents + Backend Bridge
The mind-body connection: Notion agents handle cognition, the backend bridge relays decisions to Phaser.

- One Notion custom agent per cast member with a full cognitive pipeline instruction page
- Orchestrator using the Notion Agents SDK (`@notionhq/agents-client`) to invoke agents and stream decisions
- `executeGameAction` worker: writes Notion DBs (World State, Conversations, Memory, Relationships) and forwards actions to backend
- Backend bridge (Node/Python): REST endpoints (`POST /move`, `/dialogue`, `/event`) + WebSocket push to Phaser
- Phaser subscribes to WebSocket and executes the visual side (movement, animation, SFX) independently of the decision loop
- Inter-character dialogue mediated by the orchestrator: Character A's decision triggers Character B's context assembly and invocation

### ⬜ 8. Conversation System
Character-to-character dialogue as a first-class mechanic, not a post-hoc text dump.

- Proximity-triggered conversation initiation (Smallville-style)
- Zone acoustics constraints (conversations leak or don't based on zone)
- In-world dialogue bubbles + optional transcript panel
- Multi-turn conversation threads with `threadId` continuity across agent invocations
- Conversation DB in Notion: both sides' internal thought, emotional state, and relationship context stored per turn
- Talking heads: situation-triggered performative cutaways (not once-per-day) — audience-aware reflections distinct from private internal reflection

### ⬜ 9. Inspectability Layer
The research hook. Clicking any character at any moment reveals the full cognitive trace.

- Needs vector snapshot at any timestamp
- PAD/emotion trace over the day
- Retrieved memories at decision time: which memories were pulled and why (score breakdown)
- Action candidates considered and the selected action with rationale
- Relationship context used in the decision
- Internal thought vs. talking head (private vs. performative reflection)
- Wiki-style character profiles: Big Five parameters, memory log, relationship graph, narrative identity summary

### ⬜ 10. Episode Demos
Pre-run simulation days seeded with a perturbation premise and hosted as interactive artifacts.

- Perturbation seeds: downsizing rumor, corporate audit, HR crackdown, sales leaderboard contest, prank escalation chain
- Each episode is a complete simulation day runnable and replayable on the public site
- Episode player with inspectability layer exposed (click any moment → see the cognitive trace)
- 30–60s highlight reel clips cut from pre-run episodes for distribution

---
