---
name: gen-office-objects
description: >-
  Regenerates office-objects.json from the Tiled map. Use after editing object
  layers in dunder-mifflin-tilemap.json (chairs, tables, appliances, sit points,
  action points, zones, etc.).
---

Regenerate `frontend/public/assets/world/office-objects.json` from the Tiled map.

Run from the **repository root** (the folder that contains `scripts/`):

```bash
node scripts/generate-office-objects.js
```

After running, confirm the output counts look right and check for any validation warnings.
