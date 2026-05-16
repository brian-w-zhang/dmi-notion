import Phaser from 'phaser';
import { Character, type FacingDirection } from '../entities/Character';
import { CHARACTER_ASSETS, type CharacterAssetDef, type CharacterOwner } from '../config/characters';
import { NPC_WALK_SPEED, SPRITE_WORLD_DEPTH } from './mainMap.constants';
import { findOwnedChair, type Chair } from '../systems/ChairSystem';
import { registerAnimations } from '../systems/AnimationRegistry';

export interface CastSittingAction {
  type: 'sitting';
  chairName: string;
  sitPointName: string;
}

export interface CastMemberState {
  id: string;
  owner: CharacterOwner;
  spriteKey: string;
  zone: string;
  position: { x: number; y: number };
  facing: FacingDirection;
  action: CastSittingAction;
}

export interface SpawnedCastMember {
  config: CharacterAssetDef;
  actor: Character;
  state: CastMemberState;
}

function chairNameForOwner(owner: CharacterOwner): string {
  return `${owner}_chair`;
}

function toFacingDirection(facing: string): FacingDirection | null {
  if (facing === 'right' || facing === 'left' || facing === 'front' || facing === 'back') {
    return facing;
  }
  return null;
}

export function spawnStaticCastMembers(
  scene: Phaser.Scene,
  chairs: Chair[],
  worldObjects: Phaser.GameObjects.GameObject[]
): SpawnedCastMember[] {
  const spawned: SpawnedCastMember[] = [];

  for (const config of CHARACTER_ASSETS) {
    if (config.isPlayerControlled) continue;

    const expectedChairName = chairNameForOwner(config.owner);
    const chair = findOwnedChair(chairs, config.owner, expectedChairName);
    if (!chair) {
      console.warn(
        `[MainMap] Skipping ${config.displayName}: chair "${expectedChairName}" for owner "${config.owner}" was not found`
      );
      continue;
    }

    const sitPoint = chair.sitPoints[0];
    if (!sitPoint) {
      console.warn(
        `[MainMap] Skipping ${config.displayName}: chair "${chair.name}" has no sit points`
      );
      continue;
    }

    const facing = toFacingDirection(sitPoint.facing);
    if (!facing) {
      console.warn(
        `[MainMap] Skipping ${config.displayName}: sit point "${sitPoint.name}" has unsupported facing "${sitPoint.facing}"`
      );
      continue;
    }

    registerAnimations(scene, config.spriteKey);

    const actor = new Character({
      scene,
      spriteKey: config.spriteKey,
      x: sitPoint.position.x,
      y: sitPoint.position.y,
      depth: SPRITE_WORLD_DEPTH,
      speed: NPC_WALK_SPEED,
    });
    actor.sit(sitPoint.position.x, sitPoint.position.y, facing);
    chair.occupiedBy = config.owner;
    worldObjects.push(actor.sprite);

    spawned.push({
      config,
      actor,
      state: {
        id: config.owner,
        owner: config.owner,
        spriteKey: config.spriteKey,
        zone: chair.zone,
        position: {
          x: sitPoint.position.x,
          y: sitPoint.position.y,
        },
        facing,
        action: {
          type: 'sitting',
          chairName: chair.name,
          sitPointName: sitPoint.name,
        },
      },
    });
  }

  return spawned;
}
