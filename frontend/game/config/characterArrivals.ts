import type { CharacterOwner } from './characters'

// ── Arrival time config ───────────────────────────────────────────────────────
// Defines each character's canonical work-arrival window.
// These seed the planning module — the Notion agent can override the specific
// time within the window when generating a day plan.
//
// simArrivalMinutes: minutes after midnight in sim time (e.g. 7*60+15 = 435 = 7:15 AM)
// arrivalWindowMins: ± variance around the base time
//
// Source: show canon + Big Five personality (conscientiousness → early;
//         extraversion → later; neuroticism → erratic)

export interface ArrivalConfig {
  owner: CharacterOwner
  /** Base arrival time — minutes after midnight (sim clock). */
  simArrivalMinutes: number
  /** ± variance in minutes. Actual time = base + random(-window, +window). */
  arrivalWindowMins: number
  /** Human-readable for debugging and planning prompts. */
  arrivalLabel: string
  note: string
}

export const CHARACTER_ARRIVALS: ArrivalConfig[] = [
  {
    owner: 'dwight',
    simArrivalMinutes: 7 * 60 + 15,   // 7:15 AM
    arrivalWindowMins: 20,
    arrivalLabel: '~7:15 AM',
    note: 'Always first in — duty, security patrol, beet farm schedule forces early rise',
  },
  {
    owner: 'angela',
    simArrivalMinutes: 7 * 60 + 50,   // 7:50 AM
    arrivalWindowMins: 15,
    arrivalLabel: '~7:50 AM',
    note: 'High conscientiousness — arrives before most to maintain control of the space',
  },
  {
    owner: 'oscar',
    simArrivalMinutes: 8 * 60 + 45,   // 8:45 AM
    arrivalWindowMins: 15,
    arrivalLabel: '~8:45 AM',
    note: 'Responsible, reliable, slightly before the crowd',
  },
  {
    owner: 'toby',
    simArrivalMinutes: 8 * 60 + 50,   // 8:50 AM
    arrivalWindowMins: 10,
    arrivalLabel: '~8:50 AM',
    note: 'Nothing else to do — HR is his whole life',
  },
  {
    owner: 'pam',
    simArrivalMinutes: 8 * 60 + 55,   // 8:55 AM
    arrivalWindowMins: 10,
    arrivalLabel: '~8:55 AM',
    note: 'Receptionist — needs to be there before the phones start',
  },
  {
    owner: 'phyllis',
    simArrivalMinutes: 9 * 60,         // 9:00 AM
    arrivalWindowMins: 10,
    arrivalLabel: '~9:00 AM',
    note: 'Punctual, comfortable routine, nothing flashy',
  },
  {
    owner: 'stanley',
    simArrivalMinutes: 9 * 60,         // 9:00 AM exactly
    arrivalWindowMins: 5,
    arrivalLabel: '9:00 AM sharp',
    note: 'Stanley does not arrive early and does not arrive late. 9:00 AM. Always.',
  },
  {
    owner: 'meredith',
    simArrivalMinutes: 9 * 60 + 5,    // 9:05 AM
    arrivalWindowMins: 30,
    arrivalLabel: '~9:05 AM (variable)',
    note: 'High neuroticism, unpredictable schedule, wide variance',
  },
  {
    owner: 'jim',
    simArrivalMinutes: 9 * 60 + 10,   // 9:10 AM
    arrivalWindowMins: 15,
    arrivalLabel: '~9:10 AM',
    note: 'Low conscientiousness about punctuality — just barely on time',
  },
  {
    owner: 'kevin',
    simArrivalMinutes: 9 * 60 + 15,   // 9:15 AM
    arrivalWindowMins: 20,
    arrivalLabel: '~9:15 AM',
    note: 'Never quite on time, but not drastically late either',
  },
  {
    owner: 'ryan',
    simArrivalMinutes: 9 * 60 + 20,   // 9:20 AM
    arrivalWindowMins: 15,
    arrivalLabel: '~9:20 AM',
    note: 'Too cool to be on time, fashionably late',
  },
  {
    owner: 'michael',
    simArrivalMinutes: 9 * 60 + 30,   // 9:30 AM
    arrivalWindowMins: 25,
    arrivalLabel: '~9:30 AM',
    note: 'Regional Manager — arrives when he feels like it, usually late',
  },
  {
    owner: 'kelly',
    simArrivalMinutes: 9 * 60 + 35,   // 9:35 AM
    arrivalWindowMins: 20,
    arrivalLabel: '~9:35 AM',
    note: 'Spent too long getting ready, got distracted texting',
  },
  {
    owner: 'creed',
    simArrivalMinutes: 9 * 60 + 0,    // 9:00 AM nominal
    arrivalWindowMins: 60,
    arrivalLabel: 'Unpredictable',
    note: 'Could be 8 AM or 10 AM. Nobody knows where Creed comes from.',
  },
  {
    owner: 'darryl' as CharacterOwner,
    simArrivalMinutes: 8 * 60 + 30,   // 8:30 AM
    arrivalWindowMins: 20,
    arrivalLabel: '~8:30 AM',
    note: 'Warehouse runs earlier shifts — Darryl is already in when office starts',
  },
]

export const ARRIVAL_BY_OWNER: Record<string, ArrivalConfig> = Object.fromEntries(
  CHARACTER_ARRIVALS.map((a) => [a.owner, a])
)

// ── Spawn point ───────────────────────────────────────────────────────────────
// Where cars appear before driving into the parking lot.
// This is a world-space pixel coordinate just off the top of the lot.
// TODO: confirm exact coords from tilemap — placeholder for now.
// Car spawns here (world-space pixels) and drives left into the parking lot lane.
export const CAR_SPAWN_WORLD_POS = { x: 2728, y: 1421 }

// ── Arrival sequence (Phaser state machine) ───────────────────────────────────
// After parking, character follows this fixed path before NPC loops begin:
//   parked → walk to car exit point → walk to office entrance → enter building
//            → walk to elevator → walk to desk → NPC action loop starts
//
// These are named waypoints that MainMap resolves to world coords.
export const ARRIVAL_WAYPOINTS = {
  officeEntrance: 'entrance_door',   // objectName in office-objects.json
  elevator:       'elevator_call',   // action point name in tilemap
} as const
