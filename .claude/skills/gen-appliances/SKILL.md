---
name: gen-appliances
description: >-
  Regenerates appliances.json from the Tiled map. Use after editing appliance
  object layers in dunder-mifflin-tilemap.json (appliances, action points, zones, etc.).
  Note: this overwrites SFX keys and other hand-authored fields — re-add them after running.
---

Regenerate `frontend/public/assets/world/appliances.json` from the Tiled map.

Run from the **repository root** (the folder that contains `scripts/`):

```bash
node scripts/generate-appliances-json.js
```

After running, confirm the output counts look right and check for any validation warnings.

⚠️ The generator only writes geometry and action metadata. Any hand-authored fields (`sfxStartKey`, `sfxLoopKey`, `sfxEndKey`, `durationMs` overrides, `loadingPhrases`) must be re-applied after regeneration — check the diff carefully before committing.
