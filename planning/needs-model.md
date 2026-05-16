# DMI Needs Model

12 needs organized across Maslow's hierarchy. Each need has an **importance curve** that maps the current value (0–100) to an urgency weight used in action scoring. Low value = character is deficient in that need.

---

## The 12 Needs

### Physiological
These are deficit needs. Urgency spikes sharply near zero and is negligible when satisfied.

| Need | Key | Curve |
|---|---|---|
| Hunger | `hunger` | Convex |
| Thirst | `thirst` | Convex |
| Bladder | `bladder` | Convex |
| Energy | `energy` | Convex |

### Safety
Event-driven accumulators. No standard importance curve — they rise from blocked needs or negative events and decay slowly. Not scored by the curve system.

| Need | Key | Curve |
|---|---|---|
| Stress | `stress` | Accumulator |
| Health | `health` | Accumulator |

### Love & Belonging
| Need | Key | Curve |
|---|---|---|
| Social | `social` | U-shaped |
| Belonging | `belonging` | Concave |

- **Social** is U-shaped: urgency rises when isolated AND when overcrowded. The midpoint (comfortable baseline) shifts with extraversion — high-extraversion characters (Michael) have a low midpoint, meaning they're comfortable only at high social values.
- **Belonging** measures quality of inclusion, not quantity of interaction. A slow steady pull, never fully negligible.

### Esteem
| Need | Key | Curve |
|---|---|---|
| Esteem | `esteem` | Concave |
| Stimulation | `stimulation` | U-shaped |
| Productivity | `productivity` | Concave |

- **Stimulation** bridges esteem and self-actualization. U-shaped: boredom is urgent, but stimulation is also sought when already engaged (overachievers/curious types).
- **Productivity** has a dual motivation axis (safety component + esteem component) per character — see `character_seeds.json`.

### Self-Actualization
| Need | Key | Curve |
|---|---|---|
| Fulfillment | `fulfillment` | Concave |

- Very slow; barely moves in a single day. Always exerts a gentle pull toward meaningful action.

---

## Curve Types & Equations

For need value `v ∈ [0, 100]`, importance `U(v) ∈ [0, 1]`.

### Convex
```
U(v) = (1 - v/100)^power
```
Shape: steep near zero, negligible when satisfied. Used for physiological deficit needs.

| Need | power |
|---|---|
| hunger | 2.5 |
| thirst | 2.5 |
| bladder | 2.8 |
| energy | 2.0 |

### U-shaped
```
U(v) = clamp(amplitude × (v/100 − midpoint)² + baseline, 0, 1)
```
Shape: high urgency at both extremes, minimum at `midpoint`. Used for social/relational needs that can be under- or over-satisfied.

| Need | amplitude | midpoint | baseline |
|---|---|---|---|
| social | 2.5 | 0.45 | 0.05 |
| stimulation | 3.0 | 0.55 | 0.10 |

### Concave
```
U(v) = amplitude × (1 − v/100)^power + baseline
```
Shape: square-root-like curve (power < 1). Slow steady pull that never fully disappears (baseline > 0).

| Need | amplitude | power | baseline |
|---|---|---|---|
| belonging | 0.80 | 0.50 | 0.05 |
| esteem | 0.80 | 0.50 | 0.08 |
| productivity | 0.75 | 0.50 | 0.10 |
| fulfillment | 0.60 | 0.50 | 0.05 |

### Accumulator
No urgency curve. Stress and health are driven by events, not time-decay. They appear in the UI as bars with an "Event-driven" indicator rather than an importance graph.

---

## Machine-readable config

See `frontend/public/data/needs_config.json` for the JSON representation consumed by the frontend graph components.
