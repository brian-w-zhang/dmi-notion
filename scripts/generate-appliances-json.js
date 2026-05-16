#!/usr/bin/env node
// scripts/generate-appliances-json.js
//
// Reads:  frontend/public/assets/world/office-objects.json
// Writes: frontend/public/assets/world/appliances.json
//
// Usage (from project root):
//   node scripts/generate-appliances-json.js

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'frontend/public/assets/world/office-objects.json');
const OUTPUT_PATH = path.join(ROOT, 'frontend/public/assets/world/appliances.json');

function defaultActionForName(objectName) {
  const name = String(objectName || '').toLowerCase();

  if (name === 'dwight_pc') return { name: 'client_research', emoji: 'computer' };
  if (name === 'dwight_phone') return { name: 'sales_call', emoji: 'phone' };

  if (name.includes('coffee')) return { name: 'get coffee', emoji: 'coffee' };
  if (name.includes('water_cooler')) return { name: 'get water', emoji: 'water_bottle' };
  if (name.includes('fridge')) return { name: 'get snack', emoji: 'sandwich' };
  if (name.includes('microwave')) return { name: 'heat food', emoji: 'fire' };
  if (name.includes('printer')) return { name: 'print document', emoji: 'paper' };
  if (name.includes('vending')) return { name: 'buy snack', emoji: 'soda_can' };
  if (name.includes('sink')) return { name: 'wash hands', emoji: 'bath' };
  if (name.includes('toaster')) return { name: 'make toast', emoji: 'bread_loaf' };
  if (name.includes('tv')) return { name: 'watch screen', emoji: 'computer' };
  if (name.includes('easel')) return { name: 'present idea', emoji: 'lightbulb' };
  if (name.includes('toilet') || name.includes('urinal')) return { name: 'use restroom', emoji: 'toilet_paper' };
  if (name.includes('trash')) return { name: 'throw away trash', emoji: 'trash' };
  if (name.includes('fire_hydrant')) return { name: 'inspect hydrant', emoji: 'caution' };

  return { name: 'interact', emoji: 'question' };
}

function normalizeExistingAction(action, fallbackActionPointId) {
  if (!action || typeof action !== 'object') return null;
  const id = typeof action.id === 'string' && action.id.trim() ? action.id.trim() : 'action_1';
  const name = typeof action.name === 'string' && action.name.trim() ? action.name.trim() : 'interact';
  const emoji = typeof action.emoji === 'string' && action.emoji.trim() ? action.emoji.trim() : 'question';
  const actionPointId = typeof action.actionPointId === 'number'
    ? action.actionPointId
    : fallbackActionPointId;

  return { ...action, id, name, emoji, actionPointId };
}

function readExistingAppliances() {
  if (!fs.existsSync(OUTPUT_PATH)) return null;
  try {
    const existingRaw = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    if (!existingRaw || !Array.isArray(existingRaw.appliances)) return null;
    return existingRaw;
  } catch (err) {
    console.warn(`[appliances-json] Could not parse existing appliances.json, regenerating clean file: ${err}`);
    return null;
  }
}

function main() {
  const officeObjects = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const entities = Object.values(officeObjects.entitiesById || {});
  const applianceEntities = entities
    .filter((entity) => entity && entity.entityType === 'appliance')
    .sort((a, b) => a.id - b.id);

  const existing = readExistingAppliances();
  const existingById = new Map(
    (existing?.appliances || []).map((appliance) => [Number(appliance.objectId), appliance])
  );

  const appliances = applianceEntities.map((entity) => {
    const firstActionPointId = entity.actionPoints?.[0]?.id ?? null;
    const defaults = defaultActionForName(entity.name);
    const seededAction = {
      id: 'action_1',
      name: defaults.name,
      emoji: defaults.emoji,
      actionPointId: firstActionPointId,
    };

    const existingEntry = existingById.get(entity.id);
    const existingActions = Array.isArray(existingEntry?.actions)
      ? existingEntry.actions
        .map((action) => normalizeExistingAction(action, firstActionPointId))
        .filter(Boolean)
      : [];

    const entry = {
      objectId: entity.id,
      objectName: entity.name,
      zone: entity.zone ?? null,
      center: entity.center,
      actionPoints: entity.actionPoints || [],
      actions: existingActions.length > 0 ? existingActions : [seededAction],
    };

    const slot = existingEntry?.hotkeySlot;
    if (typeof slot === 'number' && slot >= 1) {
      entry.hotkeySlot = Math.floor(slot);
    }

    return entry;
  });

  const output = {
    appliances,
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFile: 'frontend/public/assets/world/office-objects.json',
      generator: 'scripts/generate-appliances-json.js',
      counts: {
        appliances: appliances.length,
      },
    },
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`[appliances-json] Wrote ${OUTPUT_PATH}`);
  console.log(`[appliances-json] Appliances: ${appliances.length}`);
}

main();
