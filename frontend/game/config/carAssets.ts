import type { CarSheetInfo } from '../data/carAnimations';
import { CAR_SHEET_5x5, CAR_SHEET_6x6 } from '../systems/CarAnimationRegistry';
import characterCarsJson from '../../public/data/character_cars.json';

/** Matches `makeCarSheetInfo` block sizes in `carAnimations.ts` (car_3 vs car_4/car_5). */
export type CarSheetLayout = '6x6' | '5x5';

export interface ActiveCarConfig {
  textureKey: string;
  imagePath: string;
  /** If set, skips filename inference (e.g. non-standard asset names). */
  sheetLayout?: CarSheetLayout;
}

/**
 * Infer sheet layout from the cars asset path/filename.
 * Convention: `Car_3_*` → 6×6 blocks; `Car_4_*` / `Car_5_*` → 5×5 blocks.
 */
export function getCarSheetLayoutFromPath(imagePath: string): CarSheetLayout {
  const base = imagePath.split('/').pop() ?? imagePath;
  if (base.startsWith('Car_3_')) return '6x6';
  if (base.startsWith('Car_4_') || base.startsWith('Car_5_')) return '5x5';
  throw new Error(
    `[carAssets] Unknown car sheet family for "${imagePath}". ` +
      'Expected basename to start with Car_3_, Car_4_, or Car_5_.',
  );
}

export function sheetInfoForLayout(layout: CarSheetLayout): CarSheetInfo {
  return layout === '6x6' ? CAR_SHEET_6x6 : CAR_SHEET_5x5;
}

/** Half-axis sizes aligned to crop rects from `makeCarSheetInfo` (side view long × short). */
export function defaultHalfSizesForLayout(layout: CarSheetLayout): {
  halfLong: number;
  halfShort: number;
} {
  return layout === '6x6'
    ? { halfLong: 96, halfShort: 48 }
    : { halfLong: 80, halfShort: 48 };
}

export function resolvedSheetLayoutForActiveCar(config: ActiveCarConfig): CarSheetLayout {
  return config.sheetLayout ?? getCarSheetLayoutFromPath(config.imagePath);
}

// ---------------------------------------------------------------------------
// Active car — change `textureKey` + `imagePath` together (Phaser texture key
// must match `registerCarAnimations` / `Car`).

export const ACTIVE_CAR: ActiveCarConfig =
{ textureKey: 'car-3-1', imagePath: '/assets/cars/Car_3_32x32_1.png' }

// ---------------------------------------------------------------------------
// All character car assignments (from public/data/character_cars.json).
// Each entry maps a character owner key to their car texture and parking spot.

export interface CharacterCarConfig {
  owner: string;
  carTextureKey: string;
  carImagePath: string;
  carSheetLayout: CarSheetLayout;
  parkingSpot: string;
}

export const CHARACTER_CARS: CharacterCarConfig[] = characterCarsJson as CharacterCarConfig[];

/*
  Other paint jobs / families (copy one block into ACTIVE_CAR):

  { textureKey: 'car-3-1', imagePath: '/assets/cars/Car_3_32x32_1.png' }
  { textureKey: 'car-3-2', imagePath: '/assets/cars/Car_3_32x32_2.png' }
  { textureKey: 'car-3-3', imagePath: '/assets/cars/Car_3_32x32_3.png' }
  { textureKey: 'car-3-4', imagePath: '/assets/cars/Car_3_32x32_4.png' }
  { textureKey: 'car-3-5', imagePath: '/assets/cars/Car_3_32x32_5.png' }
  { textureKey: 'car-3-6', imagePath: '/assets/cars/Car_3_32x32_6.png' }
  { textureKey: 'car-3-7', imagePath: '/assets/cars/Car_3_32x32_7.png' }

  { textureKey: 'car-4-1', imagePath: '/assets/cars/Car_4_32x32_1.png' }
  { textureKey: 'car-4-2', imagePath: '/assets/cars/Car_4_32x32_2.png' }
  { textureKey: 'car-4-3', imagePath: '/assets/cars/Car_4_32x32_3.png' }
  { textureKey: 'car-4-4', imagePath: '/assets/cars/Car_4_32x32_4.png' }
  { textureKey: 'car-4-5', imagePath: '/assets/cars/Car_4_32x32_5.png' }
  { textureKey: 'car-4-6', imagePath: '/assets/cars/Car_4_32x32_6.png' }
  { textureKey: 'car-4-7', imagePath: '/assets/cars/Car_4_32x32_7.png' }

  { textureKey: 'car-5-1', imagePath: '/assets/cars/Car_5_32x32_1.png' }
  { textureKey: 'car-5-2', imagePath: '/assets/cars/Car_5_32x32_2.png' }
  { textureKey: 'car-5-3', imagePath: '/assets/cars/Car_5_32x32_3.png' }
  { textureKey: 'car-5-4', imagePath: '/assets/cars/Car_5_32x32_4.png' }
  { textureKey: 'car-5-5', imagePath: '/assets/cars/Car_5_32x32_5.png' }
  { textureKey: 'car-5-6', imagePath: '/assets/cars/Car_5_32x32_6.png' }
*/
