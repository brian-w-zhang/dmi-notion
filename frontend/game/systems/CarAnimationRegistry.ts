import Phaser from 'phaser';
import { CarSheetInfo, CAR_SHEET_6x6, CAR_SHEET_5x5 } from '../data/carAnimations';

export { CAR_SHEET_6x6, CAR_SHEET_5x5 };

/**
 * Registers all car animations for a given texture key.
 *
 * Because car frames are non-uniform size, the sheet must be loaded as a plain
 * image (not a spritesheet). This function:
 *   1. Adds named pixel-crop frames to the texture.
 *   2. Creates Phaser animation keys from those named frames.
 *
 * Safe to call multiple times — skips frames/animations that already exist.
 *
 * Key format: {textureKey}-{animName}-{direction}
 *   e.g. "car-white-drive-right", "car-white-idle-back"
 *
 * Usage:
 *   // Preloader.ts
 *   this.load.image('car-3-white', '/assets/cars/car_3_white.png');
 *   this.load.image('car-4-white', '/assets/cars/car_4_white.png');
 *
 *   // MainMap.ts (in create)
 *   registerCarAnimations(this, 'car-3-white', CAR_SHEET_6x6);
 *   registerCarAnimations(this, 'car-4-white', CAR_SHEET_5x5);
 */
export function registerCarAnimations(
  scene: Phaser.Scene,
  textureKey: string,
  sheetInfo: CarSheetInfo,
): void {
  const tex = scene.textures.get(textureKey);

  for (const [animName, def] of Object.entries(sheetInfo.animDefs)) {
    for (const [dir, crops] of Object.entries(def.directions)) {
      const phaserFrames = crops.map((crop, i) => {
        const frameName = `${animName}-${dir}-${i}`;
        if (!tex.has(frameName)) {
          tex.add(frameName, 0, crop.x, crop.y, crop.w, crop.h);
        }
        return { key: textureKey, frame: frameName };
      });

      const animKey = `${textureKey}-${animName}-${dir}`;
      if (!scene.anims.exists(animKey)) {
        scene.anims.create({
          key:       animKey,
          frames:    phaserFrames,
          frameRate: def.frameRate,
          repeat:    def.repeat,
        });
      }
    }
  }
}
