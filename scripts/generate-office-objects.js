#!/usr/bin/env node
// scripts/generate-office-objects.js
//
// Reads:  frontend/public/assets/tilemap/dunder-mifflin-tilemap.json
// Writes: frontend/public/assets/world/office-objects.json
//
// Usage (from project root):
//   node scripts/generate-office-objects.js

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const INPUT_PATH  = path.join(ROOT, 'frontend/public/assets/tilemap/dunder-mifflin-tilemap.json');
const OUTPUT_DIR  = path.join(ROOT, 'frontend/public/assets/world');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'office-objects.json');

const VALID_FACING = new Set(['left', 'right', 'front', 'back']);

/** Desk props with no Tiled action points — used via hard-coded seated flow in the game. */
const APPLIANCES_WITHOUT_ACTION_POINTS_OK = new Set(['dwight_pc', 'dwight_phone']);

// ── Validation collector ──────────────────────────────────────────────────────

const errors   = [];
const warnings = [];

function error(msg)   { errors.push(msg); }
function warning(msg) { warnings.push(msg); }

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively search for a layer by name through Tiled group layers. */
function findLayer(layers, name) {
  for (const layer of layers) {
    if (layer.name === name) return layer;
    if (layer.type === 'group' && layer.layers) {
      const found = findLayer(layer.layers, name);
      if (found) return found;
    }
  }
  return null;
}

/** Flatten a Tiled properties array into a plain object. */
function parseProps(propertiesArray) {
  const result = {};
  for (const prop of (propertiesArray || [])) {
    result[prop.name] = prop.value;
  }
  return result;
}

/**
 * Compute the world-space centroid of a Tiled object.
 * Polygon vertices are relative to the object's x/y origin.
 * Falls back to x/y for point objects.
 */
function centroid(obj) {
  const poly = obj.polygon;
  if (!poly || poly.length === 0) {
    return { x: round(obj.x), y: round(obj.y) };
  }
  const n = poly.length;
  const sumX = poly.reduce((acc, pt) => acc + pt.x, 0);
  const sumY = poly.reduce((acc, pt) => acc + pt.y, 0);
  return {
    x: round(obj.x + sumX / n),
    y: round(obj.y + sumY / n),
  };
}

function round(v) {
  return Math.round(v * 10) / 10;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function generate() {
  console.log(`Reading: ${INPUT_PATH}\n`);
  const tilemap = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

  // Find all required layers
  const LAYER_NAMES = [
    'Zones',
    'Chairs',
    'Tables',
    'Appliances',
    'Storage',
    'Entrances',
    'Parking Spots',
    'Sit Points',
    'Action Points',
  ];
  const L = {};
  for (const name of LAYER_NAMES) {
    const layer = findLayer(tilemap.layers, name);
    if (!layer) throw new Error(`Layer not found in tilemap: "${name}"`);
    L[name] = layer;
  }

  // Build zone ID → name map
  const zoneIdToName = {};
  for (const obj of L['Zones'].objects) {
    zoneIdToName[obj.id] = obj.name;
  }

  /**
   * Resolve a Tiled zone object-reference (integer ID) to a zone name.
   * Returns the name string, or null if missing/unresolvable.
   * `required` controls whether a missing zone is an error or warning.
   */
  function resolveZone(props, label, required = false) {
    const zoneId = props.zone;
    if (zoneId == null) {
      if (required) error(`${label}: missing zone property`);
      else          warning(`${label}: no zone property (entity will be unzoned)`);
      return null;
    }
    if (typeof zoneId !== 'number') {
      error(`${label}: zone property is not a numeric ID (got ${JSON.stringify(zoneId)})`);
      return null;
    }
    const name = zoneIdToName[zoneId];
    if (!name) {
      error(`${label}: zone id=${zoneId} does not match any zone in the Zones layer`);
      return null;
    }
    return name;
  }

  // ── Validate and group Sit Points ─────────────────────────────────────────

  const sitPointsByTarget = {};

  for (const obj of L['Sit Points'].objects) {
    const label = `SitPoint id=${obj.id} "${obj.name}"`;
    const props = parseProps(obj.properties);

    // target is required
    if (props.target == null) {
      error(`${label}: missing 'target' property — sit point is not linked to any entity`);
      continue; // can't group without a target, skip
    }
    if (typeof props.target !== 'number') {
      error(`${label}: 'target' is not a numeric object ID (got ${JSON.stringify(props.target)})`);
      continue;
    }

    // facing is required and must be a valid direction
    if (props.facing == null) {
      error(`${label}: missing 'facing' property`);
    } else if (!VALID_FACING.has(props.facing)) {
      error(`${label}: 'facing' value "${props.facing}" is not valid — must be one of ${[...VALID_FACING].join(', ')}`);
    }

    // zone is required on points
    resolveZone(props, label, /* required */ true);

    (sitPointsByTarget[props.target] ||= []).push({
      id: obj.id, name: obj.name,
      position: { x: round(obj.x), y: round(obj.y) },
      facing: props.facing ?? null,
    });
  }

  // ── Validate and group Action Points ──────────────────────────────────────

  const actionPointsByTarget = {};

  for (const obj of L['Action Points'].objects) {
    const label = `ActionPoint id=${obj.id} "${obj.name}"`;
    const props = parseProps(obj.properties);

    if (props.target == null) {
      error(`${label}: missing 'target' property — action point is not linked to any entity`);
      continue;
    }
    if (typeof props.target !== 'number') {
      error(`${label}: 'target' is not a numeric object ID (got ${JSON.stringify(props.target)})`);
      continue;
    }

    if (props.facing == null) {
      error(`${label}: missing 'facing' property`);
    } else if (!VALID_FACING.has(props.facing)) {
      error(`${label}: 'facing' value "${props.facing}" is not valid — must be one of ${[...VALID_FACING].join(', ')}`);
    }

    resolveZone(props, label, /* required */ true);

    (actionPointsByTarget[props.target] ||= []).push({
      id: obj.id, name: obj.name,
      position: { x: round(obj.x), y: round(obj.y) },
      facing: props.facing ?? null,
    });
  }

  // ── Build and validate entity objects ─────────────────────────────────────

  const entitiesById = {};

  for (const obj of L['Chairs'].objects) {
    const label = `Chair id=${obj.id} "${obj.name}"`;
    const props = parseProps(obj.properties);

    // zone is required for chairs (they always belong to an area)
    const zone = resolveZone(props, label, /* required */ true);

    // owner must be a string if present
    if (props.owner != null && typeof props.owner !== 'string') {
      error(`${label}: 'owner' must be a string (got ${JSON.stringify(props.owner)})`);
    }

    // chairs without any sit points can't be sat in
    if (!sitPointsByTarget[obj.id] || sitPointsByTarget[obj.id].length === 0) {
      warning(`${label}: no SitPoints reference this chair — characters can't sit here`);
    }

    entitiesById[obj.id] = {
      id: obj.id, name: obj.name, entityType: 'chair',
      zone, center: centroid(obj),
      owner: (typeof props.owner === 'string' ? props.owner : null),
      sitPoints:    sitPointsByTarget[obj.id]    || [],
      actionPoints: actionPointsByTarget[obj.id] || [],
      actions: [],
    };
  }

  for (const obj of L['Tables'].objects) {
    const label = `Table id=${obj.id} "${obj.name}"`;
    const props = parseProps(obj.properties);

    const zone = resolveZone(props, label, /* required */ true);

    if (props.owner != null && typeof props.owner !== 'string') {
      error(`${label}: 'owner' must be a string (got ${JSON.stringify(props.owner)})`);
    }

    // Tables (desks, surfaces) don't require action points in the tilemap — they are
    // defined via actions_config.json at the action layer, not as Tiled geometry.

    entitiesById[obj.id] = {
      id: obj.id, name: obj.name, entityType: 'table',
      zone, center: centroid(obj),
      owner: (typeof props.owner === 'string' ? props.owner : null),
      actionPoints: actionPointsByTarget[obj.id] || [],
      actions: [],
    };
  }

  for (const obj of L['Appliances'].objects) {
    const label = `Appliance id=${obj.id} "${obj.name}"`;
    const props = parseProps(obj.properties);

    // zone is expected but some appliances (e.g. fire hydrant, trash) legitimately lack one
    const zone = resolveZone(props, label, /* required */ false);

    if (!actionPointsByTarget[obj.id] || actionPointsByTarget[obj.id].length === 0) {
      if (!APPLIANCES_WITHOUT_ACTION_POINTS_OK.has(obj.name)) {
        warning(`${label}: no ActionPoints reference this appliance — characters can't use it`);
      }
    }

    entitiesById[obj.id] = {
      id: obj.id, name: obj.name, entityType: 'appliance',
      zone, center: centroid(obj),
      actionPoints: actionPointsByTarget[obj.id] || [],
      actions: [],
    };
  }

  for (const obj of L['Storage'].objects) {
    const label = `Storage id=${obj.id} "${obj.name}"`;
    const props = parseProps(obj.properties);

    // zone is expected but not always present
    const zone = resolveZone(props, label, /* required */ false);

    if (!actionPointsByTarget[obj.id] || actionPointsByTarget[obj.id].length === 0) {
      warning(`${label}: no ActionPoints reference this storage — characters can't access it`);
    }

    entitiesById[obj.id] = {
      id: obj.id, name: obj.name, entityType: 'storage',
      zone, center: centroid(obj),
      actionPoints: actionPointsByTarget[obj.id] || [],
      actions: [],
    };
  }

  // ── Build and validate Entrances ──────────────────────────────────────────

  const entrances = {};
  for (const obj of L['Entrances'].objects) {
    const label = `Entrance id=${obj.id} "${obj.name}"`;
    const props = parseProps(obj.properties);

    // zone is required for entrances (otherwise zone transitions can't be resolved)
    const zone = resolveZone(props, label, /* required */ true);

    entrances[obj.name] = {
      id: obj.id, name: obj.name,
      zone, center: centroid(obj),
      actionPoints: actionPointsByTarget[obj.id] || [],
    };
  }

  // ── Orphaned interaction points (target doesn't match any entity) ──────────

  const parkingSpotIds = new Set();
  for (const obj of L['Parking Spots'].objects || []) {
    if (obj.id !== undefined) parkingSpotIds.add(obj.id);
  }

  const knownIds = new Set([
    ...Object.keys(entitiesById).map(Number),
    ...Object.values(entrances).map(e => e.id),
    ...parkingSpotIds,
  ]);

  for (const [targetId, pts] of Object.entries(actionPointsByTarget)) {
    if (!knownIds.has(Number(targetId))) {
      error(`ActionPoint(s) [${pts.map(p => `"${p.name}"`).join(', ')}] target id=${targetId} which does not exist in Chairs, Tables, Appliances, Storage, Entrances, or Parking Spots`);
    }
  }
  for (const [targetId, pts] of Object.entries(sitPointsByTarget)) {
    if (!knownIds.has(Number(targetId))) {
      error(`SitPoint(s) [${pts.map(p => `"${p.name}"`).join(', ')}] target id=${targetId} which does not exist in Chairs, Tables, Appliances, Storage, Entrances, or Parking Spots`);
    }
  }

  // ── Build zones ───────────────────────────────────────────────────────────

  const zones = {};
  for (const obj of L['Zones'].objects) {
    zones[obj.name] = { id: obj.id, name: obj.name, entities: [] };
  }
  for (const entity of Object.values(entitiesById)) {
    if (entity.zone) {
      if (zones[entity.zone]) {
        zones[entity.zone].entities.push(entity);
      } else {
        // Should be unreachable: resolveZone already validates zone names
        error(`Entity "${entity.name}" resolved zone="${entity.zone}" but that zone is not in the zones map`);
      }
    }
  }

  // ── Print validation results ──────────────────────────────────────────────

  if (errors.length > 0) {
    console.error(`ERRORS (${errors.length}):`);
    for (const msg of errors) console.error(`  ✗ ${msg}`);
    console.error('');
  }

  if (warnings.length > 0) {
    console.warn(`WARNINGS (${warnings.length}):`);
    for (const msg of warnings) console.warn(`  ⚠ ${msg}`);
    console.warn('');
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('Validation: OK — no issues found\n');
  }

  // ── Write output ──────────────────────────────────────────────────────────

  const counts = {
    zones:          L['Zones'].objects.length,
    chairs:         L['Chairs'].objects.length,
    tables:         L['Tables'].objects.length,
    appliances:     L['Appliances'].objects.length,
    storage:        L['Storage'].objects.length,
    entrances:      L['Entrances'].objects.length,
    parkingSpots:   (L['Parking Spots'].objects || []).length,
    sitPoints:      L['Sit Points'].objects.length,
    actionPoints:   L['Action Points'].objects.length,
  };

  const output = {
    zones,
    entitiesById,
    entrances,
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFile: 'frontend/public/assets/tilemap/dunder-mifflin-tilemap.json',
      counts,
    },
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');

  console.log(`Written: ${OUTPUT_PATH}`);
  console.log('Counts:', counts);
}

generate();
