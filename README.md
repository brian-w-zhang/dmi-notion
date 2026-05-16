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

**Phaser (body + world):** renders the tilemap, handles character movement and animation, manages needs decay, enforces world rules, assembles candidate action sets, and executes action chains (walk, face, animate, SFX, complete).

**LLM agents (mind + memory):** one agent per character (Michael, Dwight, Jim, Pam, etc.). Each runs a full cognitive pipeline in a single invocation: perception, needs appraisal, memory retrieval, action selection, dialogue, reflection.

**Backend bridge (in progress):** a thin Node/Python server that mediates between the agents and Phaser. Exposes REST endpoints and pushes state changes to the frontend over WebSocket.

---

## Repository Layout

```
frontend/              Next.js + Phaser frontend (the rendered simulation)
  app/                 Next.js App Router entry point
  game/                All Phaser game code (scenes, systems, entities)
  public/assets/       Tilemap, tilesets, sprites, sound effects

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

The Phaser game runs inside a Next.js app. The simulation backend is not yet connected; this runs the visual frontend independently.

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The Dunder Mifflin office loads and you can control Dwight with WASD / arrow keys.

**Controls:**
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

