# Why This Page Exists

To move Office RPLAs from "search engines" to "characters," the memory system needs to be grounded in how human memory and psychology actually work. This page documents the key theories, what they mean for DMI, and the implementation strategies that follow from them.

---

## Core Psychological Theories

### 1. Spreading Activation (Collins & Loftus, 1975)

**What it is:** Memory is not a filing cabinet — it is a semantic web. Concepts are nodes; associations are edges. When one node is activated (by a cue, a word, a situation), activation spreads outward along edges to related nodes, making them easier to retrieve.

**Classic example:** Hearing "nurse" activates "doctor," "hospital," "medicine" — even if none of those words were spoken.

**For DMI:** The word "prank" should warm up nodes like "Dwight," "Jello," "stapler," "Jim's desk" — not because those words appear in the prompt, but because they are associatively linked in the character's memory. A naive SQL `WHERE title LIKE '%prank%'` will miss most of the relevant memories. The retrieval strategy needs to simulate spreading activation by querying associated concepts, not just matching surface keywords.

**Implementation:** The "Fixed Bag" strategy (see below) is the operationalization of spreading activation in Notion's substrate. Pre-define a curated concept graph per character. When a scene activates one concept, expand the query to its neighbors.

---

### 2. The OCC Model (Ortony, Clore & Collins, 1988)

**What it is:** Emotions are not random states — they are **appraisals of events relative to goals, standards, and attitudes**. The model defines ~22 emotion types, each arising from a specific cognitive evaluation.

**Key appraisals:**

- **Goal-relevant events** → Joy (goal met) / Distress (goal blocked)
- **Actions by agents** → Admiration (agent acted well) / Reproach (agent acted badly)
- **Objects/situations** → Liking / Disliking

**For DMI:** Michael isn't "sad" randomly. He's sad because a specific goal ("be seen as the cool boss") was blocked (Toby said his idea was a liability). Without modeling the goal underneath the emotion, the emotional response will feel arbitrary. The OCC model gives you a principled way to derive what emotion a character should feel in any given scene.

**Implementation:** The `goal_status` field (Met / Blocked / Delayed / Unexpected) on each memory row encodes the OCC appraisal. SQL queries that filter for `goal_status = 'Blocked'` will surface memories where Michael felt frustrated or defensive — exactly the emotional state you want to prime.

---

### 3. Constructive Episodic Simulation (Schacter & Addis, 2007)

**What it is:** Memory's primary function is not to preserve the past — it is to **simulate the future**. We reconstruct past episodes not to replay them but to recombine their fragments into predictions about what will happen next. This is why memory is "reconstructive" rather than reproductive: it is optimized for forward simulation, not backward retrieval.

**Implication:** Human memory is inherently predictive and goal-directed. We remember what was useful for anticipating similar situations.

**For DMI:** An RPLA should not just retrieve past scenes as historical records. It should use them to predict how the current situation will unfold. When Jim is about to prank Dwight, he shouldn't just recall "I put the stapler in Jello once" — he should simulate: *"Based on how Dwight reacted last time, he will escalate to Michael. I need to be ready for that."* The `reflection` field is the seed for this: it already contains the character's forward-looking conclusion from each scene.

**Implementation:** Pass the retrieved `reflection` fields into the system prompt as "predictive priors" — not as history, but as the character's current expectations about how people and situations will behave.

---

### 4. Temporal Context Model (TCM) (Howard & Kahana, 2002)

**What it is:** Memories are not retrieved in isolation — they are encoded with a "temporal context" tag. When you retrieve one memory from a specific episode or time period, that context becomes active and makes other memories from the same period easier to retrieve. Memory is organized in time, and time bleeds through.

**For DMI:** Finding one memory from the "Casino Night" episode (S2E22) should make other Casino Night memories easier to surface — even if they are not topically related. Michael's conversation with Jan on the roof is temporally linked to everything else that happened that night. An RPLA that can "follow the thread" of an episode rather than treating each scene as isolated will feel more coherent and human.

**Implementation:** The `episode` column is the TCM anchor. When the current scene involves something with high emotional weight, first query: `WHERE episode = [current episode]` before falling back to semantic search. This mimics the way human memory clusters around emotionally salient events.

---

### 5. State-Dependent Memory (Bower, 1981)

**What it is:** Retrieval is highest when the internal state at retrieval matches the internal state at encoding. If you were anxious when you learned something, you remember it better when you are anxious again. Mood congruence and state-dependence are well-replicated effects.

**For DMI:** High-arousal Michael should preferentially retrieve high-arousal memories. If Michael is currently in a frantic, validation-seeking state, he should be pulling from memories where he was similarly activated — not calm, reflective moments. This creates emotional coherence across a scene.

**Implementation:** The PAD model (Pleasure, Arousal, Dominance) gives you a 3-dimensional emotional vector. Encode each memory with its approximate PAD state at the time. At retrieval, weight memories by similarity to the current PAD state. In Notion's substrate, a simplified version: add an `emotional_intensity` field (1–10) and an `emotional_valence` field (positive / negative / mixed). Query for memories that match the current state's intensity and valence before returning results.

---

### 6. Narrative Identity Theory (McAdams, 1988)

**What it is:** Humans construct identity by assembling life experiences into a coherent personal narrative — a story with themselves as the protagonist, with a consistent theme, tone, and arc. This narrative is not a record of facts; it is a **selective, interpretive account** that preserves the self-image.

**For DMI:** Michael's self-narrative is: *"I am a beloved mentor and entertainer who is underappreciated by corporate but deeply loved by my team."* Every memory is filtered through this narrative. A scene where the team laughs at his joke gets encoded as confirmation of the narrative. A scene where they roll their eyes gets reinterpreted ("they were tired") or suppressed. The self-narrative is the lens through which all episodic memory is reconstructed.

**Implementation:** The `self_persona` tag (Hero / Victim / Mentor / Cool Guy / Entertainer) captures which aspect of Michael's self-narrative was active in a given scene. When Michael needs confidence, he queries `WHERE self_persona = 'Hero'`. When he needs to process a failure, he queries `WHERE self_persona = 'Victim'` — and reframes it accordingly.

---

### 7. Theory of Mind (Premack & Woodruff, 1978)

**What it is:** The ability to attribute mental states — beliefs, desires, intentions, emotions — to others, and to understand that those states may differ from your own. Humans constantly model what others are thinking, wanting, and planning.

**For DMI:** Michael Scott has a profoundly distorted Theory of Mind — he consistently misattributes what others want and feel, which is the engine of most of his comedy. Dwight has an accurate ToM for threats but poor ToM for emotional nuance. Jim has excellent ToM for everyone except his own feelings about Pam. ToM is not just a feature — it is character-specific and measurable.

**Implementation:** Each agent needs a "What I Think Others Want" model — not just its own goals, but its current beliefs about other characters' goals and states. This can be stored in the Relationships DB as an additional field: `my_model_of_their_goal`. Michael's row for Toby might read: `"Wants to ruin fun."` (incorrect). Jim's row for Pam might read: `"Wants to stay safe."` (partially correct, and that limitation is the whole arc).

---

### 8. Hierarchical Goal Theory (Austin & Vancouver, 1996)

**What it is:** Human motivation is organized in a hierarchy, not a flat list. Goals at different levels are linked: higher-level goals provide purpose for lower-level tasks; lower-level tasks are the means to higher-level ends. Failure at a low level may or may not threaten the higher level, depending on the structure.

**Three levels for DMI:**

| **Level** | **Description** | **Michael example** | **Jim example** |
| --- | --- | --- | --- |
| Life Motive | Permanent core drive. Never fully achieved, never abandoned. | "Be loved and admired by everyone around me." | "Do as little as possible while remaining respected." |
| Long-term Goal | Season- or arc-level aspiration. Can be completed or failed. | "Keep the Scranton branch open and avoid downsizing." | "Avoid becoming a person who actually cares about this job." |
| Short-term Task | Scene-specific objective. Most memories are encoded at this level. | "Win this basketball game." | "Get Dwight to react to the stapler in Jello." |

**Key insight:** A failure at the Short-term Task level (losing the basketball game) is emotionally tolerable. A failure at the Life Motive level (nobody laughs at Michael's speech) triggers a much more intense retrieval and emotional response. Tag each memory by which goal level was affected, and weight emotional intensity accordingly.

---

### 9. Implicit vs. Explicit Motivation (McClelland, 1987)

**What it is:** People have **explicit motives** (what they say they want, what they consciously pursue) and **implicit motives** (what they actually respond to emotionally, often below awareness). These frequently conflict, and the conflict is a major source of psychological drama.

**For DMI:**

- Jim's explicit motive: "I just want to do my job and go home."
- Jim's implicit motive: "I want Pam to notice me, and I want Dwight to respect me even as I demean him."
- The gap between these two is where Jim's character lives.

**Implementation:** Two fields per character — `stated_goal` (explicit, what the character would say out loud) and `implicit_drive` (what they actually respond to). The `internal_thoughts` field is where implicit drives surface. When they contradict `motivation` (the explicit goal), that's where the most interesting character behavior emerges.

---

### 10. Theory of Planned Behavior (Ajzen, 1991)

**What it is:** A compact model for *deliberate* action selection. Behavior is most directly predicted by **intention**, and intention is shaped by three levers:

- **Attitude**: "Do I think doing X is good/bad?"
- **Subjective norm**: "Do the people I care about approve of X?"
- **Perceived behavioral control (PBC)**: "Do I believe I can actually do X?" (ability, constraints, opportunities)

**Why it matters for generative agents:** It’s a psychologically grounded way to go from *values/needs → intention → plan → behavior*, without pretending the agent has perfect control. PBC is the key realism knob: it captures "I want to, but I can’t." 

**How AgentSociety uses it (high-level):** They treat needs as continuously updated priorities, then use TPB as an explicit planner to formulate action plans aimed at satisfying the currently prioritized needs (i.e., needs drive *what matters*, TPB drives *what I’m willing/able to do next*). 

**For DMI:** TPB is a principled replacement (or complement) to a pure "LLM decides" step when you want stable, inspectable behavior.

- Michael often has **high attitude** ("this will be awesome"), **high subjective norm (imagined)** ("everyone will love it"), but **low PBC** (corporate constraints, social skill gaps). That mismatch is *comedy + realism*.

**Implementation sketch (practical fields):**

- `behavior_candidate` (Text): label of a proposed action ("announce Dundies now")
- `attitude_score` (0–1 or 1–5)
- `norm_score` (0–1 or 1–5): computed from *who’s watching* + relationship weights + "office culture" priors
- `pbc_score` (0–1 or 1–5): computed from environment constraints + skills/resources + authority state
- `intention_score` = f(attitude, norm, pbc) (weighted sum is usually enough)
- Choose the top intention action, then execute through tools/world rules.

---

### 11. Maslow’s Hierarchy of Needs (Maslow, 1943) — as a control panel for motivation

**What it is:** A layered model of human needs (often simplified) where unmet lower-level needs tend to dominate attention.

- **Physiological** (food, sleep)
- **Safety** (security, stability)
- **Love/Belonging** (friendship, intimacy, inclusion)
- **Esteem** (respect, competence, status)
- **Self-actualization** (growth, meaning, creativity)

**For DMI:** Most Office-comedy dynamics sit in *belonging + esteem*, with "safety" showing up as job security / corporate threats.

- Michael: belonging + esteem are chronically "hungry".
- Dwight: safety (order/control) + esteem (rank) dominate.
- Jim: esteem (not being trapped/mediocre) + belonging (Pam) oscillate.

**Implementation idea (needs vector → desire-driven planning):**

- Maintain a per-agent **needs vector** (e.g., `{belonging: 0.8, esteem: 0.6, safety: 0.2}` where higher = more deprived).
- Convert the top-need(s) into **desires** ("seek affirmation", "restore control", "avoid humiliation")
- Generate candidate actions and score them by expected need reduction (plus costs/risks).

**Connection to D2A (Desire-driven Autonomous Agent):** D2A-style agents explicitly treat *intrinsic desires* (grounded in a needs theory) as the driver for proposing and selecting tasks, rather than relying only on external prompts/rewards.

---

## Strategy & Implementation Shifts

### From "Recent SQL" to "Affective SQL"

Default retrieval: `ORDER BY timestamp DESC LIMIT 5` — get the most recent memories.

Problem: recency is not salience. A mildly embarrassing moment from this morning is less emotionally relevant to Michael than a humiliation from three months ago that touched his Life Motive.

Better retrieval: Weight by `importance × emotional_valence_match × recency`. The formula roughly:

`score = (importance × 0.4) + (recency × 0.3) + (state_match × 0.3)`

Where `state_match` is whether the current emotional state matches the memory's encoded state. In Notion's substrate, implement this as a weighted SQL query or a multi-pass fetch: first get high-importance memories, then blend with recency.

---

### The "Fixed Bag" Strategy (Spreading Activation operationalized)

Each character has a curated concept vocabulary — 8–12 terms that represent the nodes in their personal semantic network. When the agent needs to query memory, it first selects 2–3 concepts from the bag that are most relevant to the current situation, then uses those as search terms.

**Michael's Fixed Bag:**

`Validation | Cinema | Family | Performance | Leadership | Approval | Loneliness | Cool | Comedy | Awards | Jan | Corporate`

**Dwight's Fixed Bag:**

`Authority | Survival | Beet Farm | Loyalty | Superiority | Threat | Rules | Michael | Hierarchy | Martial Arts | Manipulation | Bears`

**Jim's Fixed Bag:**

`Boredom | Pam | Dwight | Escape | Effortlessness | Humor | Observation | Ceiling | Potential | Roy | Quiet | Directness`

**Pam's Fixed Bag:**

`Containment | Jim | Roy | Art | Warmth | Observation | Safety | Suppression | Coordination | Loyalty | Possibility | Voice`

The agent runs: "Given the current scene, which 2–3 concepts from my Fixed Bag are most active right now?" Then queries: `WHERE title CONTAINS [concept_1] OR title CONTAINS [concept_2]`. This simulates spreading activation without requiring a full graph database.

---

### Narrative Compression Layers

Every 5–10 triggers, the agent runs a **reflection pass** and generates a Relationship Summary per key character in their life:

> *"Jim: He's my friend, I think, but he makes me look bad in front of people. Last week he got credit for a deal I helped close. I don't fully trust him anymore but I still like him."*
> 

This summary acts as a **permanent filter** on all subsequent episodic fetches involving Jim. When Michael retrieves Jim-related memories, the summary is prepended as context — it primes the LLM to interpret retrieved scenes through Michael's current relational stance.

Store summaries in the Relationships DB under `current_dynamic`. Update on the reflection pass cycle.

---

### Dense Title Formatting

Notion's semantic search operates primarily on page titles. This makes the title field the highest-leverage field in the entire memory DB. Format:

`[Character action / event] | [Emotional tag], [Concept tag], [Relationship delta]`

Examples:

- `Michael pitches a movie idea to Ryan, who humors him politely | validation, mentor, Ryan+0`
- `Dwight catches Jim leaving early and reports to Michael | authority, threat, Jim-1, Michael+1`
- `Jim watches Pam laugh at Roy's joke from across the room | longing, containment, Pam+0, Roy-1`

The second half of the pipe gives the retrieval system emotional and relational metadata in searchable text form without adding new columns.

---

### The "Cognitive Snapshot" Prompt Pattern

Instead of passing raw memory rows to the agent, construct a synthesized context buffer:

> *"The last time you interacted with Dwight, your short-term task goal was Blocked (he enforced a policy that embarrassed you in front of Ryan). You were in a Mentor self-persona but your internal thoughts were 'he's making me look stupid.' Your reflection was that Dwight is loyal but doesn't understand the optics of leadership. Your current model of what Dwight wants: to expose your incompetence so he can take your job."*
> 

This is far more useful than 5 raw scene rows. It gives the LLM a first-person reconstructed memory state, not a database dump.

---

## Fields to Add / Modify

### Recommended field lengths

| **Field** | **Length** | **Purpose** |
| --- | --- | --- |
| `motivation` | 1 sentence, 50–100 chars | Clear "I want X" — explicit goal active in this scene |
| `internal_thoughts` | 1–2 sentences, 75–120 chars | Knee-jerk reaction — the gap between face and interiority |
| `reflection` | 2–3 sentences, 150–250 chars | Narrative identity integration — how this scene updates the self-story |
| `importance` | Integer 1–10 | Retrieval weight — scales with goal hierarchy level affected |

### Proposed additional fields

**`goal_status`** — Select: Met / Blocked / Delayed / Unexpected

The OCC appraisal field. Drives emotional tone retrieval. Query `WHERE goal_status = 'Blocked'` to surface frustration/defensiveness. The engine of emotion.

**`self_persona`** — Select: Hero / Victim / Mentor / Cool Guy / Entertainer / Soldier / Observer

Which role in their self-narrative was the character playing in this scene. Enables queries like: "Find moments where Michael felt like a Hero" to prime confidence before a big moment.

**`relational_delta`** — Text: e.g. `Jim:-1, Michael:+1`

A shorthand encoding of how this scene moved relationship valence. Enables aggregate calculation of "current affinity" toward any character by summing across memories. Can live in the title (via the pipe format above) or as a separate field.

**`anchor_object`** — Text: e.g. `Dundie`, `Jello stapler`, `George Foreman Grill`

A TCM anchor — a concrete object from the scene. Enables associative leaps: if the current scene mentions a "trophy," query `WHERE anchor_object = 'Dundie'` to surface the Dundies-related memory cluster. Mimics how physical cues trigger episodic recall in humans.

**`goal_level`** — Select: Life Motive / Long-term Goal / Short-term Task

Tags which level of the goal hierarchy was activated. Memories where Life Motive was blocked should have much higher `importance` scores and should be retrieved under more conditions.

---

## Missing Pieces in Standard RPLA Design

**Theory of Mind** — Most RPLAs model only their own goals. A character without a model of what others want will misinterpret every interaction. Store `my_model_of_their_goal` per relationship in the Relationships DB. Update it when new information arrives.

**Inference Budget (Cognitive Limits)** — Real humans don't perfectly process all available information. An agent that retrieves the "perfect" memories every time feels robotic. Introduce a soft limit on how many memories are passed to context per trigger (e.g., max 5), and occasionally let the agent work with a degraded or incomplete picture. Imperfect recall is more human.

**Temporal Era Weighting** — Michael's relationship with Jan in S1 is fundamentally different from S3. The `episode` field is the proxy for era. Weight recent memories slightly higher, but allow high-importance old memories to break through. Do not flatten all episodes equally.

**Implicit Motive vs. Stated Goal** — Encode both. `motivation` = explicit goal (what they'd say out loud). `internal_thoughts` = implicit drive (what they actually respond to). The gap between them is where character lives.

**Emotional Contagion** — In multi-agent scenes, character states influence each other. Dwight's agitation raises Jim's alertness. Pam's warmth softens Michael. This isn't implemented in individual agent memory but should be modeled in the Relationships DB as a `contagion_weight` — how much this character's state is influenced by the other's.

---

## Character-Specific Goal Hierarchies (Seed State at S2E12)

### Michael Scott

- **Life Motive:** Be loved and admired. Need for unconditional social approval.
- **Long-term Goal:** Keep Scranton open; maintain the illusion of competent leadership for Corporate.
- **Implicit drive:** Perform being a good boss more than actually being one.
- **Self-narrative:** *"I am the cool boss who is also everyone's best friend. They don't always show it, but they need me."*

### Jim Halpert

- **Life Motive:** Avoid the trap of caring too much about something that doesn't deserve it.
- **Long-term Goal:** Stay employed with minimal effort; keep the Pam situation unresolved because resolution is terrifying.
- **Implicit drive:** Be seen as exceptional by at least one person who matters.
- **Self-narrative:** *"I'm smarter than this place. I'm just here temporarily. I'm not like the others."*

### Dwight Schrute

- **Life Motive:** Be objectively, measurably the best — at everything, always.
- **Long-term Goal:** Become Regional Manager; neutralize Jim as a threat.
- **Implicit drive:** Earn Michael's unconditional approval and loyalty.
- **Self-narrative:** *"I am the most capable person in this building. The fact that I am not in charge is a bureaucratic error that will eventually be corrected."*

### Pam Beesly

- **Life Motive:** Be safe. Don't risk something real on an outcome that might not come.
- **Long-term Goal:** Get through the engagement to Roy without examining it too closely.
- **Implicit drive:** Be truly seen by someone — which Jim does, which is the problem.
- **Self-narrative:** *"I'm happy. This is fine. I chose this. I'm not the kind of person who blows up their life for a feeling."*

## Source Dump

Integrating the OCC Model of Emotions in Embodied Characters
https://www.bartneck.de/publications/2002/integratingTheOCCModel/bartneckHF2002.pdf

The OCC model revisited
https://people.idsia.ch/~steunebrink/Publications/KI09_OCC_revisited.pdf

Simulating Personality and Emotion in AI Agents through Individual-Based Modelling
https://gradex.staffs.ac.uk/wp-content/uploads/2025/05/5396_Simulating-Personality-and-Emotion-in-AI-Agents-through-Individual-Based-Modelling.pdf

[Frontiers | Enhancing memory retrieval in generative agents through LLM-trained cross attention networks](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1591618/full)

#### **arXiv papers:**

[A Multi-Agent Psychological Simulation System for Human Behavior Modeling](https://arxiv.org/html/2511.02606v1)

[Position: LLM Social Simulations Are a Promising Research Method](https://arxiv.org/html/2504.02234v2)

[Sentipolis: Emotion-Aware Agents for Social Simulations](https://arxiv.org/html/2601.18027v1)
