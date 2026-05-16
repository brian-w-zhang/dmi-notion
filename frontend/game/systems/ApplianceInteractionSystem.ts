import type { ApplianceActionsData } from '../data/appliances';
import type { ActionPoint, ApplianceEntity, OfficeObjectsData } from '../data/officeObjects';
import { findObjectGroupInJSON, type TiledLayer, type TiledMapJsonRoot } from './CollisionSystem';

/** Dwight's desk chair object id in office-objects / Tiled (sales). */
export const DWIGHT_DESK_CHAIR_ID = 101;
/** When seated at desk, PC/phone use a wider reach than standing appliance radius. */
const DESK_APPLIANCE_INTERACTION_RADIUS = 200;

export type FacingDir = 'right' | 'left' | 'front' | 'back';

export interface ApplianceInteractable {
  objectId: number;
  objectName: string;
  zone: string | null;
  actionPointId: number;
  actionPointName: string;
  actionName: string;
  emoji: string;
  loadingPhrases: string[];
  durationMs: number | null;
  position: { x: number; y: number };
  facing: FacingDir;
  polygon: { x: number; y: number }[] | null;
  /** If set, this interactable only appears when seated in this chair (occupied by player). */
  requiresOccupiedChairId: number | null;
  /** If true, skip scripted walk — already at desk (seated). */
  skipWalkToActionPoint: boolean;
  /** When set, HUD uses this number as `[n]` for this action (desk bundles, etc.). */
  hotkeySlot: number | null;
  /** From `appliances.json` action; loader keys under `sound effects/`. */
  sfxStartKey?: string;
  sfxLoopKey?: string;
  sfxEndKey?: string;
  sfxStartVolumeScale?: number;
  sfxLoopVolumeScale?: number;
  sfxEndVolumeScale?: number;
}

export function parseAppliancePolygons(
  tiledJSON: TiledMapJsonRoot
): Map<number, { x: number; y: number }[]> {
  const result = new Map<number, { x: number; y: number }[]>();
  const group = findObjectGroupInJSON(tiledJSON.layers as TiledLayer[], 'Appliances');
  if (!group?.objects) return result;

  for (const obj of group.objects) {
    if (!obj.polygon || obj.id === undefined) continue;
    result.set(obj.id, obj.polygon.map((v) => ({ x: obj.x + v.x, y: obj.y + v.y })));
  }
  return result;
}

function chooseActionPoint(entity: ApplianceEntity, preferredActionPointId: number | null): ActionPoint | null {
  if (entity.actionPoints.length === 0) return null;
  if (preferredActionPointId == null) return entity.actionPoints[0];

  return entity.actionPoints.find((point) => point.id === preferredActionPointId) ?? entity.actionPoints[0];
}

const ACTION_NAME_CONTAINS: Array<[string, string]> = [
  ['coffee',       'get coffee'],
  ['water_cooler', 'get water'],
  ['fridge',       'get snack'],
  ['microwave',    'heat food'],
  ['printer',      'print document'],
  ['vending',      'buy snack'],
  ['sink',         'wash hands'],
  ['toaster',      'make toast'],
  ['tv',           'watch screen'],
  ['easel',        'present idea'],
  ['toilet',       'use restroom'],
  ['urinal',       'use restroom'],
  ['trash',        'throw away trash'],
  ['fire_hydrant', 'inspect hydrant'],
];

const EMOJI_EXACT: Record<string, string> = {
  dwight_pc:    'computer',
  dwight_phone: 'phone',
};

const EMOJI_CONTAINS: Array<[string, string]> = [
  ['coffee',       'coffee'],
  ['water_cooler', 'water_bottle'],
  ['fridge',       'sandwich'],
  ['microwave',    'fire'],
  ['printer',      'paper'],
  ['vending',      'soda_can'],
  ['sink',         'bath'],
  ['toaster',      'bread_loaf'],
  ['tv',           'computer'],
  ['easel',        'lightbulb'],
  ['toilet',       'toilet_paper'],
  ['urinal',       'toilet_paper'],
  ['trash',        'trash'],
  ['fire_hydrant', 'caution'],
];

function fallbackActionName(objectName: string): string {
  const name = objectName.toLowerCase();
  for (const [substr, action] of ACTION_NAME_CONTAINS) {
    if (name.includes(substr)) return action;
  }
  return 'interact';
}

function fallbackEmoji(objectName: string): string {
  const name = objectName.toLowerCase();
  if (EMOJI_EXACT[name]) return EMOJI_EXACT[name];
  for (const [substr, emoji] of EMOJI_CONTAINS) {
    if (name.includes(substr)) return emoji;
  }
  return 'question';
}

function normalizeLoadingPhrases(
  loadingPhrases: string[] | undefined,
  fallbackActionName: string
): string[] {
  const normalized = (loadingPhrases ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  if (normalized.length > 0) return normalized;
  return [`${fallbackActionName}`];
}

const DESK_APPLIANCE_NAMES = new Set(['dwight_pc', 'dwight_phone']);

/** Default `[1]` / `[2]` mapping when `hotkeySlot` is omitted in appliances.json. */
const DESK_DEFAULT_HOTKEY_SLOT: Record<string, number> = {
  dwight_phone: 1,
  dwight_pc:    2,
};

function syntheticDeskActionPointId(applianceId: number): number {
  return -(100000 + applianceId);
}

function sfxKey(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  return t || undefined;
}

function sfxVolumeScale(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.min(raw, 8);
}

export function buildApplianceInteractables(
  officeObjectsData: OfficeObjectsData,
  applianceActionsData: ApplianceActionsData | null | undefined,
  polygonByObjectId: Map<number, { x: number; y: number }[]>
): ApplianceInteractable[] {
  const actionsByObjectId = new Map(
    (applianceActionsData?.appliances ?? []).map((entry) => [entry.objectId, entry])
  );

  const appliances: ApplianceEntity[] = Object
    .values(officeObjectsData.entitiesById)
    .filter((entity): entity is ApplianceEntity => entity.entityType === 'appliance');

  const interactables: ApplianceInteractable[] = [];
  for (const appliance of appliances) {
    if (!appliance.actionPoints.length) continue;

    const configured = actionsByObjectId.get(appliance.id);
    const action = configured?.actions?.[0];
    const actionPoint = chooseActionPoint(appliance, action?.actionPointId ?? null);
    if (!actionPoint) continue;

    interactables.push({
      objectId: appliance.id,
      objectName: appliance.name,
      zone: appliance.zone,
      actionPointId: actionPoint.id,
      actionPointName: actionPoint.name,
      actionName: action?.name?.trim() || fallbackActionName(appliance.name),
      emoji: action?.emoji?.trim() || fallbackEmoji(appliance.name),
      loadingPhrases: normalizeLoadingPhrases(
        action?.loadingPhrases,
        action?.name?.trim() || fallbackActionName(appliance.name)
      ),
      durationMs:
        typeof action?.durationMs === 'number' && action.durationMs > 0
          ? action.durationMs
          : null,
      position: actionPoint.position,
      facing: actionPoint.facing,
      polygon: polygonByObjectId.get(appliance.id) ?? null,
      requiresOccupiedChairId: null,
      skipWalkToActionPoint: false,
      hotkeySlot: null,
      sfxStartKey: sfxKey(action?.sfxStartKey),
      sfxLoopKey: sfxKey(action?.sfxLoopKey),
      sfxEndKey: sfxKey(action?.sfxEndKey),
      sfxStartVolumeScale: sfxVolumeScale(action?.sfxStartVolumeScale),
      sfxLoopVolumeScale: sfxVolumeScale(action?.sfxLoopVolumeScale),
      sfxEndVolumeScale: sfxVolumeScale(action?.sfxEndVolumeScale),
    });
  }

  // Desk-only demo appliances: no Tiled action points; interact while seated at Dwight's chair.
  for (const appliance of appliances) {
    if (appliance.actionPoints.length > 0) continue;
    if (!DESK_APPLIANCE_NAMES.has(appliance.name)) continue;

    const configured = actionsByObjectId.get(appliance.id);
    const action = configured?.actions?.[0];
    const hotkeySlot =
      typeof configured?.hotkeySlot === 'number' && configured.hotkeySlot >= 1
        ? Math.floor(configured.hotkeySlot)
        : DESK_DEFAULT_HOTKEY_SLOT[appliance.name] ?? 1;
    interactables.push({
      objectId: appliance.id,
      objectName: appliance.name,
      zone: appliance.zone,
      actionPointId: syntheticDeskActionPointId(appliance.id),
      actionPointName: `${appliance.name}_desk`,
      actionName: action?.name?.trim() || fallbackActionName(appliance.name),
      emoji: action?.emoji?.trim() || fallbackEmoji(appliance.name),
      loadingPhrases: normalizeLoadingPhrases(
        action?.loadingPhrases,
        action?.name?.trim() || fallbackActionName(appliance.name)
      ),
      durationMs:
        typeof action?.durationMs === 'number' && action.durationMs > 0
          ? action.durationMs
          : null,
      position: { ...appliance.center },
      facing: 'left',
      polygon: polygonByObjectId.get(appliance.id) ?? null,
      requiresOccupiedChairId: DWIGHT_DESK_CHAIR_ID,
      skipWalkToActionPoint: true,
      hotkeySlot,
      sfxStartKey: sfxKey(action?.sfxStartKey),
      sfxLoopKey: sfxKey(action?.sfxLoopKey),
      sfxEndKey: sfxKey(action?.sfxEndKey),
      sfxStartVolumeScale: sfxVolumeScale(action?.sfxStartVolumeScale),
      sfxLoopVolumeScale: sfxVolumeScale(action?.sfxLoopVolumeScale),
      sfxEndVolumeScale: sfxVolumeScale(action?.sfxEndVolumeScale),
    });
  }

  interactables.sort((a, b) => a.objectId - b.objectId);
  return interactables;
}

/** All desk-only interactables for Dwight's chair (sorted by hotkeySlot). */
export function activeDwightDeskBundle(appliances: ApplianceInteractable[]): ApplianceInteractable[] {
  return appliances
    .filter(
      (a) =>
        a.requiresOccupiedChairId === DWIGHT_DESK_CHAIR_ID &&
        a.skipWalkToActionPoint &&
        a.hotkeySlot != null
    )
    .sort((a, b) => (a.hotkeySlot ?? 0) - (b.hotkeySlot ?? 0));
}

export interface NearestApplianceContext {
  isSitting: boolean;
  occupiedChairId: number | null;
}

export function nearestApplianceInRange(
  appliances: ApplianceInteractable[],
  px: number,
  py: number,
  radius: number,
  context?: NearestApplianceContext
): ApplianceInteractable | null {
  let best: ApplianceInteractable | null = null;
  let bestDist = Infinity;

  for (const appliance of appliances) {
    if (appliance.requiresOccupiedChairId != null) {
      if (
        !context?.isSitting ||
        context.occupiedChairId !== appliance.requiresOccupiedChairId
      ) {
        continue;
      }
    }

    const effectiveRadius =
      appliance.requiresOccupiedChairId != null
        ? DESK_APPLIANCE_INTERACTION_RADIUS
        : radius;
    const maxDist2 = effectiveRadius * effectiveRadius;

    const dx = appliance.position.x - px;
    const dy = appliance.position.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < maxDist2 && d2 < bestDist) {
      bestDist = d2;
      best = appliance;
    }
  }

  return best;
}
