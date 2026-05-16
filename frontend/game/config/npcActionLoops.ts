import type { CharacterOwner } from './characters';

// ─── Step type definitions ─────────────────────────────────────────────────

/** Walk to an appliance, face it, show emoji for durationMs, then continue. */
export interface NpcApplianceStep {
  type: 'appliance';
  /** Must match `objectName` in appliances.json (e.g. 'water_cooler'). */
  applianceName: string;
  durationMs?: number;
}

/**
 * Walk to own desk chair, sit, show emoji for durationMs, stand, continue.
 * Emoji/duration defaults are taken from the sit variant — use for generic
 * desk presence (reading, filing, etc.).
 */
export interface NpcSitAtOwnChairStep {
  type: 'sitAtOwnChair';
  durationMs: number;
}

/**
 * Sit at own desk chair and perform phone or computer work.
 * Emoji and default duration are taken from dwight_pc / dwight_phone constants.
 */
export interface NpcDeskWorkStep {
  type: 'deskWork';
  variant: 'computer' | 'sales_call';
  durationMs?: number;
}

/** Walk toward target; when within 80 px face each other and show talk emoji. */
export interface NpcTalkStep {
  type: 'talk';
  target: CharacterOwner;
  durationMs?: number;
}

/** Pause in place for durationMs before advancing. */
export interface NpcWaitStep {
  type: 'wait';
  durationMs: number;
}

export type NpcActionStep =
  | NpcApplianceStep
  | NpcSitAtOwnChairStep
  | NpcDeskWorkStep
  | NpcTalkStep
  | NpcWaitStep;

// ─── Desk-work variant constants ───────────────────────────────────────────
// Mirror dwight_pc / dwight_phone entries from appliances.json so we can show
// the right emoji without depending on ApplianceActionController at runtime.

export const DESK_WORK_CONFIG: Record<
  NpcDeskWorkStep['variant'],
  { emojiKey: string; defaultDurationMs: number }
> = {
  computer:   { emojiKey: 'emoji16-computer',  defaultDurationMs: 4500 },
  sales_call: { emojiKey: 'emoji16-phone',      defaultDurationMs: 6200 },
};

export const DEFAULT_TALK_DURATION_MS   = 6500;
export const DEFAULT_APPLIANCE_STEP_MS  = 2500;

// ─── Per-character action loops ────────────────────────────────────────────

export const NPC_ACTION_LOOPS: Partial<Record<CharacterOwner, NpcActionStep[]>> = {

  // ── Michael Scott ─────────────────────────────────────────────────────────
  // Starts at desk, then does coffee / conference wander and extended chats.
  michael: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 5200 },
    { type: 'appliance',    applianceName: 'coffee_machine', durationMs: 2500 },
    { type: 'talk',         target: 'pam',                   durationMs: 7600 },
    { type: 'appliance',    applianceName: 'conf_easel',     durationMs: 3000 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6800 },
    { type: 'talk',         target: 'jim',                   durationMs: 7200 },
  ],

  // ── Jim Halpert ───────────────────────────────────────────────────────────
  // Starts at desk, mixes calls with cooler + kitchen + Pam chats.
  jim: [
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6500 },
    { type: 'talk',         target: 'pam',                   durationMs: 7600 },
    { type: 'appliance',    applianceName: 'water_cooler',   durationMs: 2000 },
    { type: 'deskWork',     variant: 'computer',              durationMs: 5200 },
    { type: 'appliance',    applianceName: 'kitchen_fridge', durationMs: 2000 },
    { type: 'talk',         target: 'michael',               durationMs: 6800 },
  ],

  // ── Pam Beesly ────────────────────────────────────────────────────────────
  // Starts at desk, rotates between reception/admin tasks and longer desk focus.
  pam: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 5600 },
    { type: 'appliance',    applianceName: 'coffee_machine', durationMs: 2000 },
    { type: 'talk',         target: 'jim',                   durationMs: 7400 },
    { type: 'appliance',    applianceName: 'sales_printer',  durationMs: 2500 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6200 },
    { type: 'appliance',    applianceName: 'reception_trash', durationMs: 1500 },
  ],

  // ── Ryan Howard ───────────────────────────────────────────────────────────
  // Starts at desk, with long calls punctuated by Kelly + snack runs.
  ryan: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 5600 },
    { type: 'talk',         target: 'kelly',                  durationMs: 7800 },
    { type: 'appliance',    applianceName: 'vending_machines',durationMs: 3000 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6200 },
    { type: 'appliance',    applianceName: 'sales_printer',  durationMs: 2500 },
    { type: 'talk',         target: 'michael',               durationMs: 7000 },
  ],

  // ── Kelly Kapoor ──────────────────────────────────────────────────────────
  // Starts at desk, very social, with snack detours.
  kelly: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 5200 },
    { type: 'talk',         target: 'ryan',                  durationMs: 8000 },
    { type: 'appliance',    applianceName: 'break_room_microwave', durationMs: 2500 },
    { type: 'appliance',    applianceName: 'vending_machines',durationMs: 3000 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6400 },
    { type: 'talk',         target: 'pam',                   durationMs: 7400 },
  ],

  // ── Angela Martin ─────────────────────────────────────────────────────────
  // Starts at desk and does strict accounting loops with occasional short social.
  angela: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 6200 },
    { type: 'appliance',    applianceName: 'accounting_printer', durationMs: 2500 },
    { type: 'appliance',    applianceName: 'accounting_fire_hydrant', durationMs: 2000 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6800 },
    { type: 'appliance',    applianceName: 'water_cooler',   durationMs: 2000 },
    { type: 'talk',         target: 'oscar',                 durationMs: 6500 },
  ],

  // ── Oscar Martinez ────────────────────────────────────────────────────────
  // Starts at desk, alternates focused work with accounting + kitchen visits.
  oscar: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 6400 },
    { type: 'appliance',    applianceName: 'accounting_printer', durationMs: 2500 },
    { type: 'appliance',    applianceName: 'coffee_machine',  durationMs: 2000 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6200 },
    { type: 'talk',         target: 'angela',                 durationMs: 7000 },
    { type: 'appliance',    applianceName: 'kitchen_sink',   durationMs: 2000 },
  ],

  // ── Kevin Malone ──────────────────────────────────────────────────────────
  // Starts at desk. Uses deskWork (not sitAtOwnChair) so desk states show phone/computer emojis.
  kevin: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 5600 },
    { type: 'appliance',    applianceName: 'vending_machines',durationMs: 3500 },
    { type: 'appliance',    applianceName: 'break_room_microwave', durationMs: 2500 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6500 },
    { type: 'talk',         target: 'oscar',                  durationMs: 7200 },
    { type: 'appliance',    applianceName: 'kitchen_fridge', durationMs: 2000 },
  ],

  // ── Stanley Hudson ────────────────────────────────────────────────────────
  // Starts at desk, does longer desk blocks with low-energy errands.
  stanley: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 7000 },
    { type: 'appliance',    applianceName: 'coffee_machine', durationMs: 2000 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6400 },
    { type: 'appliance',    applianceName: 'sales_printer',  durationMs: 2500 },
    { type: 'appliance',    applianceName: 'kitchen_fridge', durationMs: 2000 },
    { type: 'talk',         target: 'phyllis',               durationMs: 6800 },
  ],

  // ── Phyllis Vance ─────────────────────────────────────────────────────────
  // Starts at desk and alternates long desk sessions with kitchen/water walks.
  phyllis: [
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6600 },
    { type: 'talk',         target: 'stanley',                durationMs: 7000 },
    { type: 'appliance',    applianceName: 'kitchen_fridge', durationMs: 2000 },
    { type: 'deskWork',     variant: 'computer',              durationMs: 5600 },
    { type: 'appliance',    applianceName: 'water_cooler',   durationMs: 2000 },
    { type: 'talk',         target: 'pam',                   durationMs: 6600 },
  ],

  // ── Meredith Palmer ───────────────────────────────────────────────────────
  // Starts at desk. Uses deskWork (not sitAtOwnChair) so desk states avoid question marks.
  meredith: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 5200 },
    { type: 'appliance',    applianceName: 'kitchen_fridge', durationMs: 2500 },
    { type: 'appliance',    applianceName: 'kitchen_microwave', durationMs: 2500 },
    { type: 'appliance',    applianceName: 'sales_printer',  durationMs: 2000 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6200 },
    { type: 'talk',         target: 'creed',                 durationMs: 7000 },
  ],

  // ── Creed Bratton ─────────────────────────────────────────────────────────
  // Starts at desk, then eccentric office wandering.
  creed: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 5800 },
    { type: 'appliance',    applianceName: 'sales_fire_hydrant', durationMs: 2000 },
    { type: 'appliance',    applianceName: 'kitchen_trash',   durationMs: 1500 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6200 },
    { type: 'talk',         target: 'ryan',                   durationMs: 7000 },
    { type: 'appliance',    applianceName: 'vending_machines',durationMs: 3000 },
  ],

  // ── Toby Flenderson ───────────────────────────────────────────────────────
  // Starts at desk and does longer solo work with small breaks.
  toby: [
    { type: 'deskWork',     variant: 'computer',              durationMs: 6200 },
    { type: 'appliance',    applianceName: 'water_cooler',   durationMs: 1500 },
    { type: 'deskWork',     variant: 'sales_call',            durationMs: 6400 },
    { type: 'appliance',    applianceName: 'accounting_printer', durationMs: 2500 },
    { type: 'wait',         durationMs: 3000 },
    { type: 'talk',         target: 'pam',                   durationMs: 6800 },
  ],
};
