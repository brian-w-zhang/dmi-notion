import Phaser from 'phaser';
import { isPointInPolygon } from '../systems/CollisionSystem';
import type { ApplianceInteractable } from '../systems/ApplianceInteractionSystem';
import type { Chair } from '../systems/ChairSystem';
import type { SpawnedCastMember } from './mainMapCast';

export type QueueTarget =
  | { kind: 'appliance'; item: ApplianceInteractable }
  | { kind: 'chair';     item: Chair }
  | { kind: 'person';    item: SpawnedCastMember };

export function queueTargetKey(t: QueueTarget | null): string | null {
  if (!t) return null;
  if (t.kind === 'appliance') return `a${t.item.objectId}`;
  if (t.kind === 'chair')     return `c${t.item.id}`;
  return `p${t.item.config.owner}`;
}

export function hitTestTarget(
  worldX: number,
  worldY: number,
  appliances: ApplianceInteractable[],
  chairs: Chair[],
  castMembers: SpawnedCastMember[]
): QueueTarget | null {
  for (const appliance of appliances) {
    if (appliance.requiresOccupiedChairId !== null) continue;
    if (!appliance.polygon) continue;
    if (isPointInPolygon(worldX, worldY, { vertices: appliance.polygon })) {
      return { kind: 'appliance', item: appliance };
    }
  }
  for (const chair of chairs) {
    if (chair.occupiedBy) continue;
    if (!chair.polygon) continue;
    if (isPointInPolygon(worldX, worldY, { vertices: chair.polygon })) {
      return { kind: 'chair', item: chair };
    }
  }
  for (const member of castMembers) {
    const sx = member.actor.sprite.x;
    const sy = member.actor.sprite.y;
    // Sprite origin is (0.5, 1): sy = feet, bounding box spans sy-64 to sy
    if (worldX >= sx - 16 && worldX <= sx + 16 && worldY >= sy - 64 && worldY <= sy) {
      return { kind: 'person', item: member };
    }
  }
  return null;
}

export function drawTargetHighlight(
  graphics: Phaser.GameObjects.Graphics,
  hit: QueueTarget | null,
): void {
  graphics.clear();
  if (!hit) return;
  if (hit.kind === 'person') return;
  graphics.lineStyle(2, 0xffd700, 1);
  const polygon = hit.item.polygon;
  if (polygon) graphics.strokePoints(polygon, true);
}
