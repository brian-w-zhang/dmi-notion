# DMI Frontend

The rendered simulation layer for Dunder Mifflin Infinity. Built with Next.js (App Router) and Phaser 3. Next.js handles the shell and React UI; Phaser owns the game loop, tilemap rendering, character animation, and all interactive world logic.

---

## Running

```bash
npm install
npm run dev      # Dev server at http://localhost:3000 (Turbopack)
npm run build    # Production build
npm run start    # Serve production build
npx tsc --noEmit # Type-check without emitting
```

---

## Folder Structure

```
app/
  page.tsx              Entry point — mounts PhaserGame via next/dynamic (SSR disabled)
  layout.tsx            Root layout

game/
  EventBus.ts           Phaser.Events.EventEmitter — the only bridge between Phaser and React
  PhaserGame.tsx        React component that creates/destroys the Phaser.Game instance

  scenes/
    Preloader.ts        Loads all assets (tilesets, spritesheets, audio), then starts MainMap
    MainMap.ts          Main game scene — tilemap, camera, character control, game loop
    mainMapSetup.ts     Tilemap init, camera setup, world data loading, entity creation
    mainMapDismounted.ts  Per-tick logic for dismounted (on-foot) Dwight state
    mainMapCast.ts      Spawns static cast members at their chairs
    mainMapHud.ts       HUD overlay (coordinates, zone label, key hints)
    mainMap.constants.ts  Shared depth and radius constants

  systems/
    AnimationRegistry.ts      Registers all character spritesheet animations for a key
    CarAnimationRegistry.ts   Registers car sprite animations
    CollisionSystem.ts        Point-in-polygon tests for walkable zones and colliders
    ChairSystem.ts            Chair occupancy, sit-point resolution, proximity detection
    ApplianceInteractionSystem.ts  Appliance interactable registry and proximity queries
    ApplianceActionController.ts  Owns action UI (progress bar, status text, emoji, SFX)
    ApplianceActionSfx.ts     Resolves SFX profile from an ApplianceInteractable
    ApplianceActionSfxRuntime.ts  Plays/stops start, loop, and end SFX for an action session
    FootstepSystem.ts         Randomised footstep audio for walking characters

  entities/
    Character.ts        Character class — sprite, movement, collision, sit/stand/walk-to
    Car.ts              Car entity — driving, mounting/dismounting
    SpeechBubbleOverlay.ts  Floating speech bubble attached to a sprite

  config/
    assets.ts           Tileset asset definitions (key + image path)
    characters.ts       Character asset definitions (spriteKey + spritePath)
    soundEffects.ts     All SFX registrations + FOOTSTEP_CLOTH_KEYS export

  data/
    characterAnimations.ts  Full animation frame map (20 rows × 4 directions, all frame ranges)

public/assets/
  tilemap/
    dunder-mifflin-tilemap.json   Tiled infinite-map source (chunked JSON)
    dunder-mifflin-infinity.tmx   Tiled project file
    images/             Tileset PNGs (32×32 tile size)
    tilesets/           Tiled .tsx tileset definitions
  world/
    office-objects.json   Parsed chairs, sit points, zones, walkable areas (generated)
    appliances.json       Parsed appliances, action points, SFX config (generated + hand-edited)
  sprites/              Character spritesheet PNGs (LimeZu Modern Interiors format)
  sound effects/        All audio files (.ogg, .mp3)
  ui/
    emojis_16x16/       Emoji PNGs for action speech bubbles
    bubbles/            Speech bubble frame PNGs
  cars/                 Car sprite sheets
```

---

## Architecture

### React ↔ Phaser boundary

Phaser requires the DOM and WebGL — it cannot run server-side. The isolation pattern:

1. `app/page.tsx` imports `PhaserGame` via `next/dynamic(..., { ssr: false })`.
2. `PhaserGame.tsx` creates and destroys the `Phaser.Game` instance inside a `useEffect`.
3. `EventBus.ts` (a `Phaser.Events.EventEmitter`) is the **only** communication channel between Phaser and React. Never pass React state directly into Phaser scenes.

### Scene lifecycle

`Preloader` → `MainMap` (sequential, single active scene after boot).

- **Preloader** loads all assets and starts `MainMap` when complete.
- **MainMap** creates the tilemap, spawns characters, wires input, and runs the game loop.

### Tilemap

- Format: **Tiled infinite map** (chunked JSON). `map.widthInPixels` / `heightInPixels` return 0 — camera bounds are computed manually by iterating chunk tile coordinates.
- Tile size: **32×32 px**.
- Renderer: `Phaser.WEBGL` with `pixelArt: true`, `antialias: false`, `roundPixels: true`. Do not change these — they prevent texture bleeding on pixel-art tiles.

**Layer depth stack:**

| Depth | Content |
|-------|---------|
| 0–9 | Background (ground, walls, furniture) |
| 10–16 | Stair shadows |
| 17 | Character sprites |
| 18 | (reserved) |
| 19–24 | Foreground (furniture that occludes characters) |

Character sprites must use `depth = 17`. Do not use `map.layers.findIndex` to locate invisible layers at runtime — Phaser may omit them. Use the hardcoded value `17`.

### Character spritesheets

- Source: LimeZu Modern Interiors character generator.
- Frame size: **32×64 px**.
- Sheet layout: **56 columns × 20 rows**. Direction order within each row: right → back → left → front.
- Animation key format: `{spriteKey}-{animName}-{direction}` (e.g. `dwight-schrute-walk-front`).
- Full frame map: `game/data/characterAnimations.ts`.

To add a new character: (1) `this.load.spritesheet(key, path, { frameWidth: 32, frameHeight: 64 })` in `Preloader.preload()`, (2) `registerAnimations(this, key)` in `MainMap.create()`, (3) add to `CHARACTER_ASSETS` in `game/config/characters.ts`.

### Appliance interactions

Appliances are defined in `public/assets/world/appliances.json` (generated from the Tiled map by `scripts/generate-appliances-json.js`, then hand-edited to add SFX, duration, and loading phrases).

Each action supports:

| JSON field | Effect |
|---|---|
| `sfxStartKey` | One-shot SFX at action start |
| `sfxLoopKey` | Looping SFX for the action duration |
| `sfxEndKey` | One-shot SFX when the progress bar completes |
| `durationMs` | Progress bar duration (default 1500ms) |
| `loadingPhrases` | Random status text shown during action |

### Sound system

All sound files live under `public/assets/sound effects/`. Registration in `game/config/soundEffects.ts` is required before use — the `sfx(filename, volumeScalar?)` helper generates the loader key by stripping the last extension (e.g. `entrance_door.mp3` → key `entrance_door`).

Use underscores in filenames, not spaces.

**Footsteps:** `FootstepSystem` picks a random `Cloth_dig` variant with randomised detune (±200 cents) and rate (0.85–1.15) every ~400 ms while the player is walking. It is ticked in `MainMap.update()` via the dismounted state path.

**Character event sounds** (sit, stand, door) are fired via callbacks in `DismountedUpdateArgs` — `onSit`, `onStand`, `onDoor` — following the same pattern as `onApplianceAction`.

### World data generation

Two scripts generate the JSON world data from the Tiled map:

```bash
# From the repository root:
node scripts/generate-office-objects.js   # → frontend/public/assets/world/office-objects.json
node scripts/generate-appliances-json.js  # → frontend/public/assets/world/appliances.json
```

`generate-appliances-json.js` only writes geometry and action stubs. Hand-authored fields (`sfxStartKey`, `sfxLoopKey`, `sfxEndKey`, `durationMs` overrides, `loadingPhrases`) must be re-applied after regeneration — check the diff before committing.
