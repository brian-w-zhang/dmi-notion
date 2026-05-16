import Phaser from 'phaser';
import { CHARACTER_ANIMATION_DEFS } from '../data/characterAnimations';

/**
 * Registers all animations from CHARACTER_ANIMATION_DEFS for the given spriteKey.
 * Safe to call multiple times — skips any animation key that already exists.
 *
 * Key format:
 *   directional  → {spriteKey}-{animName}-{direction}   e.g. "dwight-schrute-walk-front"
 *   simple       → {spriteKey}-{animName}               e.g. "dwight-schrute-sleep"
 *   sequenced    → {spriteKey}-{animName}-{subAnimName} e.g. "dwight-schrute-phone-loop"
 *
 * To add a new character: call registerAnimations(scene, 'jim-halpert') — no changes needed here.
 */
export function registerAnimations(scene: Phaser.Scene, spriteKey: string): void {
  for (const [animName, def] of Object.entries(CHARACTER_ANIMATION_DEFS)) {
    if (def.type === 'directional') {
      for (const [dir, range] of Object.entries(def.directions)) {
        const key = `${spriteKey}-${animName}-${dir}`;
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(spriteKey, {
            start: range.start,
            end:   range.end,
          }),
          frameRate: def.frameRate,
          repeat:    def.repeat,
        });
      }
    } else if (def.type === 'simple') {
      const key = `${spriteKey}-${animName}`;
      if (!scene.anims.exists(key)) {
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(spriteKey, {
            start: def.frames.start,
            end:   def.frames.end,
          }),
          frameRate: def.frameRate,
          repeat:    def.repeat,
        });
      }
    } else if (def.type === 'sequenced') {
      for (const [subName, range] of Object.entries(def.subAnims)) {
        const key = `${spriteKey}-${animName}-${subName}`;
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(spriteKey, {
            start: range.start,
            end:   range.end,
          }),
          frameRate: def.frameRate,
          repeat:    0, // sub-anims are chained externally; default play-once
        });
      }
    }
  }
}
