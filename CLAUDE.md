# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Dunder Mifflin Infinity (DMI)** is a psychologically grounded, 2D generative-agent simulation of the Scranton branch. The Office cast provides shared personality grounding so viewers can judge identity consistency and watch dynamics branch under novel conditions.

The two key inspirations to hold in mind:
- **Park et al. (Generative Agents / Smallville)** — memory/reflection/planning loop. The `generative_agents/` folder is the open-source reference codebase; DMI builds on and improves it.
- **The Sims** — needs + object advertising / affordance discovery (characters don't invent actions; the world advertises them).

The simulation is **not a reenactment**. It runs forward from a canon seed state, and emergent behavior is the point.

---

## Repository Layout

```
frontend/              Next.js + Phaser frontend (the rendered simulation)
  app/                 Next.js App Router entry (page.tsx → PhaserGame component)
  game/                All Phaser code
    EventBus.ts        Phaser.Events.EventEmitter bridge between React and Phaser
    PhaserGame.tsx     React wrapper that mounts/destroys the Phaser.Game instance
    scenes/
      Preloader.ts     Loads all tilemap JSON + tileset PNGs + spritesheets, then starts MainMap
      MainMap.ts       Renders the tilemap, camera (mouse-only), spawns characters
    systems/
      AnimationRegistry.ts   Registers all spritesheet animations for a given sprite key
    entities/
      Character.ts     Character class — wraps a Phaser Sprite, handles movement + animation state
    data/
      characterAnimations.ts Full animation frame map (20 rows, all directions, frame ranges)
  public/assets/
    tilemap/
      dunder-mifflin-tilemap.json   The Tiled map (infinite map format)
      images/          All tileset PNGs (32×32 tile size)
      tilesets/        Tiled .tsx tileset definitions
    sprites/           Character spritesheet PNGs (one per cast member, LimeZu format)

generative_agents/     Park et al. reference implementation (Django + Python)

planning/              Design documents (rough but authoritative)
  dmi-plan.MD          Full project vision and architecture
  psychology.MD        Psychological theories and their simulation mappings
  personality-ideas.MD Big Five → simulation parameter mappings per character
  decision-loop-ideas.txt  Per-tick decision loop pseudocode
```

---

## Frontend Dev Commands

All commands run from `frontend/`:

```bash
npm run dev      # Start dev server (uses Turbopack, http://localhost:3000)
npm run build    # Production build
npm run start    # Serve production build
```

There are no tests configured yet. TypeScript checking: `npx tsc --noEmit` from `frontend/`.

---

## Frontend Architecture

### React ↔ Phaser boundary

Phaser requires the DOM/WebGL and **cannot SSR**. The bridge pattern:

1. `app/page.tsx` imports `PhaserGame` via `next/dynamic(..., { ssr: false })`.
2. `PhaserGame.tsx` is a React component that creates and destroys the `Phaser.Game` instance in a `useEffect`.
3. `EventBus.ts` (a `Phaser.Events.EventEmitter`) is the sole communication channel between Phaser scenes and React. Phaser emits; React listens (and vice versa).

Do **not** pass React state into Phaser scenes directly — use `EventBus`.

### Phaser scene lifecycle

`Preloader` → `MainMap` (sequential, single-scene at a time after boot).

- **Preloader**: loads all assets (tilesets + character spritesheets). Adding a new tileset requires a `this.load.image(key, path)` call here. Adding a new character spritesheet requires `this.load.spritesheet(key, path, { frameWidth: 32, frameHeight: 64 })`.
- **MainMap**: creates the tilemap, registers tilesets, renders visible layers, sets up mouse camera, registers animations, and spawns characters. Tilesets must be registered with the exact `name` field from the Tiled JSON — see the `tilesetDefs` array at the top of `MainMap.create()`.

### Tilemap conventions

- Map format: **Tiled infinite map** (chunked JSON). `map.widthInPixels`/`heightInPixels` return 0; camera bounds are computed manually by iterating tile pixel coordinates.
- Tile size: **32×32px**.
- WebGL renderer (`Phaser.WEBGL`). `pixelArt: true`, `antialias: false`, `roundPixels: true` — keep these; they prevent texture bleeding.
- Camera bounds: intentionally unclamped so you can pan anywhere across the infinite map.
- Tileset naming convention in the `tilesetDefs` array: `[tiledName, phaserKey]` where `tiledName` is the `name` field inside the Tiled JSON `tilesets` array (exact match required).

### Tilemap layer depth structure

The render loop assigns `layer.setDepth(index)` where `index` is the flat position in `map.layers`. The layer stack (in order) is:

| Depth | Group | Notes |
|---|---|---|
| 0–9 | Background | Ground, walls, trees, shelves |
| 10–16 | Stairs Shadows | Drop shadows |
| 17–18 | Sprites *(invisible)* | Placeholder group — never rendered, but reserves the depth slot |
| 19–24 | Foreground | Walls, shelves, decor that occlude characters |

**Character sprites must use `depth = 17`** — above background/shadows, below foreground furniture.

⚠️ **Phaser gotcha:** Phaser may not include layers from invisible parent groups in `map.layers`. Do not rely on `map.layers.findIndex` to locate invisible layers at runtime — use the hardcoded value `17` instead.

### Camera and input

- **Camera:** mouse-only. Drag to pan, scroll to zoom. No keyboard camera control.
- **Character movement:** WASD + arrow keys control the active character sprite.

### Character spritesheets

- Source: LimeZu Modern Interiors character generator.
- Frame size: **32×64 px** (characters are taller than one tile).
- Sheet layout: **56 columns × 20 rows**. Direction order within each row: right → back → left → front.
- Full frame map (all 20 animation rows, frame ranges per direction): `game/data/characterAnimations.ts`.
- Adding a new character spritesheet: (1) `this.load.spritesheet(key, path, { frameWidth: 32, frameHeight: 64 })` in `Preloader.preload()`, (2) `registerAnimations(this, key)` in `MainMap.create()` before constructing the `Character`.

---

## Immediate Next Steps (current work in progress)

1. **Additional characters** — spawn remaining cast as AI-driven agents, wire up `CharacterKeys` from the decision loop.
2. **Needs system** — implement per-character need decay, urgency scoring, and action candidate assembly in Phaser.
3. **Backend bridge** — lightweight server between Notion agents and Phaser (REST + WebSocket).

---

## Agent / Simulation Architecture (planned, not yet implemented)

The simulation splits responsibility:

- **Phaser (body + world):** needs decay, PAD baseline drift, perception radius, navigation, action execution, conversation sessions, candidate action assembly.
- **Notion agents (mind + memory):** one custom agent per character. Handles memory storage/retrieval, reflections, talking heads, and high-level decision selection via the Notion Agents SDK (`@notionhq/agents-client`).
- **Backend bridge (planned):** lightweight Node/Python server between Notion and Phaser. Exposes REST endpoints (`POST /move`, `/dialogue`, `/event`) and pushes updates to the frontend over WebSocket.

### Character data files (to be created)

- `actions_config.json` — base need delta profiles per action, with character overrides.
- `character_seeds.json` — per-character Big Five scores + derived simulation parameters + character-specific actions.

### Personality system

Big Five (OCEAN) traits map directly to simulation parameters (not passed to the LLM). See `planning/personality-ideas.MD` for the full formula reference. Key mappings:
- **Extraversion** → social need shape and decay rate
- **Conscientiousness** → plan adherence and planning horizon
- **Neuroticism** → stress accumulation and PAD recovery rate
- **Agreeableness** → belonging multiplier and conflict response
- **Openness** → stimulation decay and novelty bonus

MBTI is used only in natural-language LLM context payloads, not as a computed parameter.

### Decision loop (per tick)

See `planning/decision-loop-ideas.txt` for the full pseudocode. Abbreviated:
1. Update need state (decay + event modifications)
2. Check active plan block vs. need urgency
3. Score action candidates (pre-action: need urgency × weight × distance × social context)
4. LLM selects action from candidates (receives needs, plan, memories, observations)
5. Execute action (navigate → animate → observe → optional dialogue)
6. Post-action appraisal (fixed delta for physical actions; appraisal agent for social/dialogue)
7. Update plan, encode memory, update relationships

### Memory retrieval

Retrieval uses a weighted score: `importance × 0.4 + recency × 0.3 + state_match × 0.3`. The "Fixed Bag" strategy (8–12 curated concept terms per character) operationalizes spreading activation — see `planning/psychology.MD` for character-specific bags. Memories are stored with OCC appraisal fields (`goal_status`), PAD state, self-persona role, and relational deltas.

---

## Sound System

### Adding a new sound file

1. Drop the file under `frontend/public/assets/sound effects/`.
2. Register it in `game/config/soundEffects.ts` using the `sfx(filename, volumeScalar?)` helper. The loader key is the filename with the **last** extension stripped (e.g. `entrance_door.mp3` → key `entrance_door`; `Cloth_dig1.ogg.mp3` → key `Cloth_dig1.ogg`).
3. Use the key anywhere via `this.sound.play(key, config)` or the appliance JSON fields below.

Use underscores in filenames, not spaces — `vending_machine.mp3` not `vending machine.mp3`.

### Appliance action SFX (no code required)

Appliance actions in `appliances.json` support three optional SFX fields:

| Field | Behaviour |
|---|---|
| `sfxStartKey` | One-shot played when the action progress bar begins |
| `sfxLoopKey` | Loops for the duration; stopped when complete or interrupted |
| `sfxEndKey` | One-shot played when the progress bar completes |

Volume is taken from `soundEffects.ts` (the `volumeScalar` arg) and optionally multiplied by `sfxStartVolumeScale` / `sfxLoopVolumeScale` / `sfxEndVolumeScale` in the JSON.

### Footsteps and character event sounds

- `FootstepSystem` (`game/systems/FootstepSystem.ts`) ticks in the dismounted update loop. It picks a random `Cloth_dig` variant with randomised `detune` (±200 cents) and `rate` (0.85–1.15) every ~400 ms while Dwight is walking.
- Sit, stand, and door sounds are fired via `onSit` / `onStand` / `onDoor` callbacks in `DismountedUpdateArgs` — same pattern as `onApplianceAction`. Wire new character-event sounds the same way.

---

## Key Constraints and Gotchas

- **Next.js version is 16.2.3** — this version has breaking changes from earlier versions. Read the docs in `node_modules/next/dist/docs/` before using Next.js APIs.
- The tilemap is an **infinite map** — don't assume `map.widthInPixels` is valid.
- When adding a new tileset: (1) add `this.load.image(key, path)` in `Preloader.preload()`, (2) add `[tiledName, key]` to `tilesetDefs` in `MainMap.create()`. The `tiledName` must match the `name` field inside the Tiled JSON exactly.
- The map JSON lives at `frontend/public/assets/tilemap/dunder-mifflin-tilemap.json` and is served as a static asset at `/assets/tilemap/dunder-mifflin-tilemap.json`.
