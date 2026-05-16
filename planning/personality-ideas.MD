# Personality System — DMI Architecture Reference

## Overview

Every agent in DMI has a personality profile stored in `personalities.json` and `character_seeds.json`. Personality does not directly control behavior — it **modulates the parameters** that drive behavior. The same need state in two different characters produces different actions because personality shapes weights, decay rates, thresholds, and satisfaction sources.

Two frameworks are used:

- **Big Five (OCEAN)** — the primary computational framework. Five continuous dimensions (0.0–1.0) that map directly to simulation parameters. Used to derive need weights, decay rates, planning adherence, emotional reactivity, and action scoring multipliers.
- **MBTI** — a descriptive shorthand used in LLM context payloads and character descriptions. Not computed against directly. Helps the LLM reason about character behavior in natural language.

---

## Big Five → Simulation Parameter Mappings

### Extraversion → Social Need Architecture

Extraversion is the most directly impactful trait on daily behavior. It controls the shape of the social need curve, not just the weight.

```
social.expected_value     = 2 + (extraversion × 7)
social.decay_rate         = 0.3 + (extraversion × 1.7)
social.crowding_sensitivity = (0.5 - extraversion) × 1.6
```

High extraversion agents have a high social expected value — they feel wrong unless they are around people. Their social need decays fast when isolated. Crucially, crowding satisfies their social need (negative sensitivity = crowding is good).

Low extraversion agents have a low expected value and slow decay. They don't need interaction to feel whole. Their `crowding_sensitivity` is positive — being in a crowded zone actually depletes their social need over time. A forced meeting actively costs Stanley and Angela social need while filling Michael's.

The `forced_social_delta` handles interactions the agent didn't initiate:

```
forced_social_delta = (0.4 - extraversion) × 0.25
```

Introverts get a small social depletion from conversations they didn't seek. Extraverts get a small bonus.

**Character examples:**

| Character | Extraversion | social.expected_value | social.decay_rate | crowding_sensitivity |
|---|---|---|---|---|
| Michael | 0.97 | 8.8 | 1.95 | -0.75 |
| Kelly | 0.96 | 8.7 | 1.93 | -0.74 |
| Jim | 0.72 | 7.0 | 1.52 | -0.35 |
| Pam | 0.38 | 4.7 | 0.95 | +0.19 |
| Angela | 0.22 | 3.5 | 0.67 | +0.45 |
| Stanley | 0.19 | 3.3 | 0.62 | +0.50 |
| Creed | 0.31 | 4.2 | 0.83 | +0.31 |

---

### Conscientiousness → Planning and Productivity

Conscientiousness is the primary driver of planning behavior and productivity need dynamics.

**Planning parameters:**
```
plan_adherence            = 0.1 + (conscientiousness × 0.85)
plan_horizon_hours        = 1 + (conscientiousness × 7)
plan_granularity          = "fine" if > 0.7, "medium" if 0.4–0.7, "coarse" if < 0.4
replan_threshold          = "low" if > 0.75, "medium" if 0.4–0.75, "high" if < 0.4
disruption_stress_spike   = conscientiousness × 0.35
```

High conscientiousness agents plan further ahead, plan in finer detail, stick to their plans, and experience stress when plans are disrupted. Dwight's plan_adherence of 0.92 means he follows his plan 92% of the time when a competing action is available. He also experiences a stress spike when interrupted.

Low conscientiousness agents barely plan, don't follow plans when they do, and are unbothered by disruption. Kevin's plan_adherence of 0.18 means he usually just does whatever is most immediately salient.

**Productivity need parameters:**
```
productivity.weight        = 0.2 + (conscientiousness × 1.8)
productivity.decay_rate    = 0.1 + (conscientiousness × 1.5)
```

High conscientiousness agents feel genuinely uncomfortable when not being productive. Dwight's productivity.weight of 1.95 means productivity urgency dominates his decision scoring. His decay_rate of 1.56 means it depletes fast — he's always looking for something to do.

Kevin's productivity.weight of 0.36 means it barely registers in action scoring. His decay rate is so low it never becomes urgent.

**Character examples:**

| Character | Conscientiousness | plan_adherence | productivity.weight | productivity.decay_rate |
|---|---|---|---|---|
| Dwight | 0.97 | 0.92 | 1.95 | 1.56 |
| Angela | 0.95 | 0.91 | 1.91 | 1.53 |
| Oscar | 0.82 | 0.80 | 1.68 | 1.33 |
| Pam | 0.74 | 0.73 | 1.53 | 1.21 |
| Jim | 0.31 | 0.36 | 0.76 | 0.57 |
| Meredith | 0.19 | 0.26 | 0.54 | 0.39 |
| Kevin | 0.09 | 0.18 | 0.36 | 0.24 |
| Creed | 0.04 | 0.13 | 0.27 | 0.16 |

---

### Neuroticism → Emotional Reactivity and Stress

Neuroticism governs how intensely agents respond to emotional events and how quickly stress accumulates.

```
stress.accumulation_multiplier    = 0.3 + (neuroticism × 1.7)
occ_intensity_multiplier          = 0.5 + (neuroticism × 1.0)
pad_recovery_rate                 = 1.5 - (neuroticism × 1.2)
belonging.event_sensitivity       = 0.5 + (neuroticism × 1.0)
```

High neuroticism agents accumulate stress faster from the same events, experience OCC emotion spikes more intensely, take longer to return to their PAD baseline, and are more sensitive to belonging-relevant events (inclusion, exclusion, rejection).

Low neuroticism agents are emotionally stable. The same negative event produces a smaller, shorter-lived emotional response. They recover to baseline quickly.

**Character examples:**

| Character | Neuroticism | stress.accumulation_multiplier | occ_intensity_multiplier | pad_recovery_rate |
|---|---|---|---|---|
| Kelly | 0.81 | 1.68 | 1.31 | 0.53 |
| Michael | 0.78 | 1.63 | 1.28 | 0.56 |
| Toby | 0.67 | 1.44 | 1.17 | 0.69 |
| Angela | 0.61 | 1.34 | 1.11 | 0.77 |
| Pam | 0.52 | 1.18 | 1.02 | 0.88 |
| Oscar | 0.29 | 0.79 | 0.79 | 1.15 |
| Jim | 0.33 | 0.86 | 0.83 | 1.10 |
| Creed | 0.12 | 0.50 | 0.62 | 1.36 |

---

### Agreeableness → Social Interaction Outcomes and Conflict

Agreeableness determines how positively or negatively social interactions resolve in terms of need satisfaction.

```
conversation.belonging_multiplier  = 0.4 + (agreeableness × 1.2)
conflict.stress_spike              = 0.05 + ((1 - agreeableness) × 0.55)
conflict.esteem_gain               = (1 - agreeableness) × 0.3
social.initiation_threshold        = 0.7 - (agreeableness × 0.4)
```

High agreeableness agents get more belonging satisfaction from conversations — connection comes more easily and feels more genuine. They find conflict very stressful. Their initiation threshold is lower — they are more willing to approach others.

Low agreeableness agents get less belonging from generic social interaction — they're harder to reach. They don't find conflict stressful; they sometimes find it satisfying (esteem gain from winning). Angela and Dwight both experience mild esteem satisfaction from confrontations they win.

**Character examples:**

| Character | Agreeableness | belonging_multiplier | conflict.stress_spike | conflict.esteem_gain |
|---|---|---|---|---|
| Pam | 0.85 | 1.42 | 0.51 | 0.02 |
| Phyllis | 0.84 | 1.41 | 0.50 | 0.03 |
| Kevin | 0.79 | 1.35 | 0.46 | 0.06 |
| Toby | 0.82 | 1.38 | 0.49 | 0.04 |
| Jim | 0.68 | 1.22 | 0.35 | 0.10 |
| Oscar | 0.52 | 1.02 | 0.20 | 0.14 |
| Meredith | 0.44 | 0.93 | 0.12 | 0.17 |
| Dwight | 0.21 | 0.65 | 0.00 | 0.24 |
| Ryan | 0.18 | 0.62 | 0.00 | 0.25 |
| Angela | 0.14 | 0.57 | 0.00 | 0.27 |

---

### Openness → Stimulation Need and Action Variety

Openness controls how quickly agents get bored with routine and how much they seek novel experiences.

```
stimulation.decay_rate             = 0.3 + (openness × 1.2)
stimulation.novel_action_bonus     = (openness - 0.5) × 0.6
stimulation.routine_penalty        = (openness - 0.5) × 0.15
stimulation.expected_value         = 3 + (openness × 4)
```

High openness agents bore faster, get more satisfaction from novel or unusual actions, and get slightly less satisfaction from repeating the same action. Jim's stimulation decays at 1.27/tick — it becomes urgent regularly.

Low openness agents are comfortable with repetition. Routine is reassuring rather than boring. The same action performed daily satisfies them reliably. Angela's stimulation.decay_rate of 0.43 means she barely experiences boredom.

**Character examples:**

| Character | Openness | stimulation.decay_rate | novel_bonus | routine_penalty |
|---|---|---|---|---|
| Creed | 0.88 | 1.36 | +0.23 | -0.06 |
| Jim | 0.81 | 1.27 | +0.19 | -0.05 |
| Oscar | 0.74 | 1.19 | +0.14 | -0.04 |
| Pam | 0.58 | 1.00 | +0.05 | -0.01 |
| Stanley | 0.28 | 0.64 | -0.13 | +0.03 |
| Dwight | 0.22 | 0.56 | -0.17 | +0.04 |
| Angela | 0.11 | 0.43 | -0.23 | +0.06 |

---

## Character-Specific Action Sets

Personality also determines which actions are available to each character and what need deltas those actions produce. This is the mechanism for modeling individual satisfaction sources — Jim pranking Dwight satisfies stimulation for Jim because it's in his action set and has high stimulation delta. Stanley doesn't have a prank action; his stimulation comes from crosswords.

### Action Availability by Character

Actions are defined in `actions_config.json` with a base delta profile. Character overrides in `character_seeds.json` can:
- Add character-specific actions not available to others
- Override deltas for shared actions
- Modify the scoring weight for specific actions

```json
// In character_seeds.json
{
  "jim": {
    "action_overrides": {
      "cooler_chat": {
        "needsMultiplier": { "stimulation": 1.4, "belonging": 1.3 }
      }
    },
    "character_actions": [
      {
        "name": "prank_setup",
        "needHints": ["stimulation", "esteem"],
        "needs_delta": {
          "stimulation": 0.45,
          "esteem": 0.2,
          "belonging": 0.1
        },
        "condition": "dwight.proximity == nearby AND stimulation < 0.5",
        "dialogueImplied": false,
        "duration": 600
      },
      {
        "name": "prank_execute",
        "needHints": ["stimulation", "esteem", "social"],
        "needs_delta": {
          "stimulation": 0.6,
          "esteem": 0.25,
          "social": 0.2
        },
        "condition": "prank_setup.complete AND pam.proximity == nearby",
        "dialogueImplied": true,
        "duration": 300
      }
    ]
  }
}
```

### Character-Specific Action Reference

**Michael Scott**
```
zone_address_room        → belonging +0.4, esteem +0.3, stimulation +0.2
                           triggers when belonging < 0.4 AND agents present in zone
improv_bit               → esteem +0.25, stimulation +0.3
                           triggers when Michael is bored near other agents
movie_monday_declare     → fulfillment +0.3, belonging +0.4
                           Michael-only, condition: energy < 0.4 OR fulfillment < 0.4
call_unnecessary_meeting → belonging +0.5, esteem +0.3
                           Michael-only, triggers when belonging < 0.35
wander_floor             → belonging +0.15 per nearby agent (up to 0.4 cap)
                           Michael's primary idle action when needs are moderate
```

**Jim Halpert**
```
prank_setup              → stimulation +0.35 (anticipation delta, pre-execution)
                           condition: stimulation < 0.5 AND dwight nearby
prank_execute            → stimulation +0.6, esteem +0.25, social +0.2
                           condition: prank_setup complete AND pam.proximity nearby
pam_proximity_seek       → not a named action; Jim's scoring system weights
                           any action near reception by +0.3 when stimulation < 0.6
camera_moment            → internal_thought generated, no need delta
                           triggers on absurd observations, stored as memory
```

**Dwight Schrute**
```
security_patrol          → esteem +0.2, stimulation +0.15, stress -0.1
                           zone_wander variant, triggers when stress > 0.5
                           Dwight-only
report_to_michael        → esteem +0.3, stress -0.2, belonging +0.15
                           triggers when stress > 0.6 OR perceived threat
file_unsolicited_report  → productivity +0.25, esteem +0.2
                           Dwight-only, satisfies esteem through self-directed work
                           (no audience required)
identify_threat          → esteem +0.15, stress -0.15
                           triggers on suspicious observations about Jim
```

**Angela Martin**
```
party_planning_work      → productivity +0.3, esteem +0.2, fulfillment +0.15
                           Angela-only, satisfies through standards enforcement
silent_judgment          → stimulation +0.1, esteem +0.1
                           ambient action, Angela observes and internally judges
                           no navigation required, generates internal_thought
cat_reference            → comfort +0.2, stress -0.15
                           triggers when stress > 0.5, references cats in conversation
```

**Stanley Hudson**
```
desk_crossword           → stimulation +0.3, comfort +0.1, stress -0.1
                           Stanley-only idle action, preferred over all others
                           when productivity need is satisfied
refuse_participation     → stress -0.15 (relief from not having to do something)
                           triggers on structured events Stanley deems beneath him
countdown_to_departure   → fulfillment +0.05 per instance (small satisfaction of
                           approaching 5pm), Stanley-specific background process
```

**Kevin Malone**
```
elaborate_food_plan      → hunger -0.1 (anticipatory), stimulation +0.2
                           Kevin mentally plans his next meal, generates
                           internal_thought, no navigation
desk_browse              → stimulation +0.15
                           Kevin's primary work-avoidance idle action
                           lower stimulation delta than Jim's equivalents
describe_food            → social +0.2, belonging +0.1
                           Kevin talks about food to nearby agents
                           triggers when social < 0.5 AND food recently consumed
```

**Kelly Kapoor**
```
ryan_monitor             → belonging +0.1 (if Ryan attentive), stress +0.05 (if not)
                           passive ambient action, Kelly tracks Ryan's status
fashion_commentary       → social +0.3, esteem +0.2, stimulation +0.25
                           Kelly-only, triggers on new clothing or appearance changes
                           in nearby agents
dramatic_reaction        → stimulation +0.4, social +0.3
                           Kelly responds to any moderately interesting event
                           with disproportionate emotional expression
```

**Toby Flenderson**
```
hr_attempt               → productivity +0.2, belonging -0.05 (usually rejected)
                           Toby tries to do his job, frequently ignored
                           post-action appraisal almost always generates disappointment OCC
invisible_presence       → belonging -0.1 (passive depletion when not acknowledged)
                           ambient — Toby in a social zone without being included
costa_rica_daydream      → stress -0.2, fulfillment +0.1
                           Toby-only idle action, generates internal_thought
                           triggers when stress > 0.6
```

**Creed Bratton**
```
mysterious_errand        → all needs moderate +0.05 (Creed appears content)
                           zone_wander variant with no declared destination
                           generates cryptic internal_thought
unsolicited_confession   → stimulation +0.2, social +0.1
                           Creed says something to nearby agent that makes no
                           contextual sense, triggers camera_moment in listeners
```

**Ryan Howard**
```
desk_study               → fulfillment +0.2, esteem +0.15
                           business school work at desk, Ryan-only
status_positioning       → esteem +0.25
                           Ryan ensures he is seen as above his current role
                           triggers when esteem < 0.5, involves initiating
                           conversations about his ambitions
```

**Meredith Palmer**
```
supplier_negotiation     → productivity +0.3
                           Meredith-only work action, occasionally effective
unsolicited_disclosure   → stimulation +0.2, social +0.15
                           Meredith volunteers inappropriate personal information
                           triggers when social < 0.5
```

---

## Post-Action Appraisal Modulation by Personality

Fixed need deltas apply to physical actions. Social and dialogue actions use post-action appraisal. Personality modulates how appraisal converts interaction quality into need satisfaction.

### Appraisal Weight Matrix

```
appraisal_logic_weight    = 0.3 + (conscientiousness × 0.3) + ((1-agreeableness) × 0.2)
appraisal_emotional_weight = 1 - appraisal_logic_weight
```

Highly conscientious, low-agreeableness agents (Oscar, Dwight) weight outcomes logically — did the action achieve its purpose? Highly feeling, high-agreeableness agents (Pam, Kevin, Toby) weight the emotional texture of the interaction — did it feel good?

This means the same successful sales call produces different need outcomes:

```
Dwight completing a sale:
  appraisal: logical_weight=0.72, emotional_weight=0.28
  productivity: +0.4 (goal achieved)
  esteem: +0.35 (competence demonstrated)
  social: +0.05 (minimal — relationship not the point)

Jim completing a sale:
  appraisal: logical_weight=0.47, emotional_weight=0.53
  productivity: +0.3 (goal achieved, but Jim doesn't care as much)
  esteem: +0.1 (low — Jim doesn't derive esteem from sales)
  social: +0.15 (the human interaction mattered somewhat)
```

### Belonging Appraisal

Belonging is uniquely sensitive to appraisal quality. A conversation that goes well raises it. A conversation where the agent felt ignored or excluded drops it. Neuroticism and agreeableness jointly determine sensitivity:

```
belonging_appraisal_sensitivity = (neuroticism × 0.6) + ((1 - agreeableness) × -0.3) + 0.4
```

Toby (neuroticism 0.67, agreeableness 0.82) has sensitivity of 0.97 — belonging is extremely reactive to interaction quality. A good conversation with Pam substantially raises his belonging. Michael ignoring him drops it sharply.

Oscar (neuroticism 0.29, agreeableness 0.52) has sensitivity of 0.51 — belonging is less reactive. He doesn't need others to fully engage to feel okay.

---

## Planning Behavior Summary by Character

| Character | plan_adherence | horizon_hours | granularity | spontaneous_preference | notable |
|---|---|---|---|---|---|
| Dwight | 0.92 | 7.8 | fine | 0.08 | Replans formally on any disruption |
| Angela | 0.91 | 7.6 | fine | 0.09 | Party planning blocks are inviolable |
| Oscar | 0.80 | 6.8 | medium | 0.20 | Realistic, flexible when needed |
| Pam | 0.73 | 5.3 | medium | 0.27 | Plans around others' schedules |
| Phyllis | 0.71 | 5.1 | medium | 0.29 | Reliable, unspectacular adherence |
| Stanley | 0.51 | 3.6 | coarse | 0.49 | Plans only what matters (departure time, lunch) |
| Toby | 0.61 | 4.5 | medium | 0.39 | Plans earnestly, frequently disrupted by Michael |
| Ryan | 0.44 | 3.2 | coarse | 0.56 | Plans for status, ignores routine work |
| Jim | 0.36 | 2.2 | coarse | 0.64 | Deliberately under-plans, open blocks preferred |
| Meredith | 0.26 | 1.3 | none | 0.74 | Reactive, minimal planning |
| Michael | 0.22 | 0.9 | none | 0.78 | Impulse constantly overrides intention |
| Kelly | 0.21 | 0.8 | none | 0.79 | Plans = wishes, never executed |
| Kevin | 0.18 | 0.6 | none | 0.82 | Plans only food timing |
| Creed | 0.13 | 0.3 | none | 0.87 | Operating on a completely separate timeline |

---

## Implementation Notes

### In character_seeds.json

Each character entry should include:
```json
{
  "big5": { "O": 0.81, "C": 0.31, "E": 0.72, "A": 0.68, "N": 0.33 },
  "mbti": "ENTP",
  "derived_params": {
    "social": { "expected_value": 7.0, "decay_rate": 1.52, "crowding_sensitivity": -0.35 },
    "productivity": { "weight": 0.76, "decay_rate": 0.57 },
    "stress": { "accumulation_multiplier": 0.86 },
    "stimulation": { "decay_rate": 1.27, "novel_bonus": 0.19 },
    "planning": { "adherence": 0.36, "horizon_hours": 2.2, "granularity": "coarse" },
    "appraisal": { "logic_weight": 0.47, "emotional_weight": 0.53 }
  },
  "action_overrides": { },
  "character_actions": [ ]
}
```

Derived params can be computed from Big Five values at initialization using the formulas above, or precomputed and hardcoded. Precomputing is recommended so the values can be manually tuned after initial generation.

### In actions_config.json

Base need deltas are defined without character specificity. Character overrides are applied multiplicatively:

```json
{
  "cooler_chat": {
    "needs_delta": {
      "default": { "social": 0.3, "belonging": 0.15, "stimulation": 0.2, "thirst": 0.3 }
    },
    "character_overrides": {
      "jim": { "multipliers": { "stimulation": 1.4, "belonging": 1.3 } },
      "stanley": { "multipliers": { "social": 0.3, "belonging": 0.4 } },
      "michael": { "multipliers": { "social": 1.6, "belonging": 1.5 } },
      "creed": { "multipliers": { "social": 0.5 } }
    }
  }
}
```

### LLM Context Usage

MBTI type is included in the LLM context payload as part of the character description, not as a structured field the LLM is expected to parse mechanically:

```
"character_context": "Jim Halpert — ENTP. Sharp, self-aware, ambivalent about 
his potential. Uses social intelligence primarily to avoid effort and manufacture 
entertainment. Currently: stimulation depleted (0.72), productivity low (0.28), 
Pam is nearby at reception."
```

The Big Five values are not passed to the LLM directly — their influence is already baked into the action scoring and need states the LLM receives.
