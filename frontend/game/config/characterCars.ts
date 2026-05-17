import type { CharacterOwner } from './characters'
import type { ActiveCarConfig } from './carAssets'
import { getCarSheetLayoutFromPath } from './carAssets'

export interface CharacterCarConfig extends ActiveCarConfig {
  owner: CharacterOwner
  // Personality note — why this car fits this character
  note: string
}

// ── Car assignments ──────────────────────────────────────────────────────────
// Car_3 (6×6 sheet): full-size sedan
// Car_4 (5×5 sheet): compact / sporty
// Car_5 (5×5 sheet): van / utility (6 variants only)
//
// Assign each character exactly one car. Each car variant is unique —
// no two characters share the same textureKey.

export const CHARACTER_CARS: CharacterCarConfig[] = [
  {
    owner: 'dwight',
    textureKey: 'car-dwight',
    imagePath: '/assets/cars/Car_4_32x32_1.png',
    note: 'Pontiac Trans Am — functional, assertive, no nonsense',
  },
  {
    owner: 'michael',
    textureKey: 'car-michael',
    imagePath: '/assets/cars/Car_3_32x32_6.png',
    note: 'Flashy sedan — Michael always wanted something impressive',
  },
  {
    owner: 'jim',
    textureKey: 'car-jim',
    imagePath: '/assets/cars/Car_3_32x32_2.png',
    note: 'Plain normal sedan — completely unremarkable, like Jim wants it',
  },
  {
    owner: 'pam',
    textureKey: 'car-pam',
    imagePath: '/assets/cars/Car_3_32x32_3.png',
    note: 'Modest reliable car — sensible and understated',
  },
  {
    owner: 'ryan',
    textureKey: 'car-ryan',
    imagePath: '/assets/cars/Car_4_32x32_2.png',
    note: 'Compact sporty — trying to look cool on a temp salary',
  },
  {
    owner: 'kelly',
    textureKey: 'car-kelly',
    imagePath: '/assets/cars/Car_4_32x32_5.png',
    note: 'Bright compact — fun, colorful, Kelly-coded',
  },
  {
    owner: 'angela',
    textureKey: 'car-angela',
    imagePath: '/assets/cars/Car_4_32x32_3.png',
    note: 'Neat compact — immaculate, no scratches, parked perfectly',
  },
  {
    owner: 'oscar',
    textureKey: 'car-oscar',
    imagePath: '/assets/cars/Car_4_32x32_4.png',
    note: 'Sensible compact — probably fuel-efficient, Oscar is responsible',
  },
  {
    owner: 'kevin',
    textureKey: 'car-kevin',
    imagePath: '/assets/cars/Car_3_32x32_7.png',
    note: 'Beat-up sedan — old, loud, somehow still running',
  },
  {
    owner: 'stanley',
    textureKey: 'car-stanley',
    imagePath: '/assets/cars/Car_3_32x32_4.png',
    note: 'Big comfortable sedan — Stanley needs leg room and a smooth ride',
  },
  {
    owner: 'phyllis',
    textureKey: 'car-phyllis',
    imagePath: '/assets/cars/Car_3_32x32_5.png',
    note: 'Comfortable family sedan — warm and unpretentious like Phyllis',
  },
  {
    owner: 'meredith',
    textureKey: 'car-meredith',
    imagePath: '/assets/cars/Car_5_32x32_3.png',
    note: 'Utility van — battered, multi-purpose, questionable backstory',
  },
  {
    owner: 'creed',
    textureKey: 'car-creed',
    imagePath: '/assets/cars/Car_5_32x32_1.png',
    note: 'Mystery van — nobody asks where he got it',
  },
  {
    owner: 'toby',
    textureKey: 'car-toby',
    imagePath: '/assets/cars/Car_5_32x32_2.png',
    note: 'Forgettable utility — sad, overlooked, exactly right for Toby',
  },
  // Darryl — add to CHARACTER_ASSETS when spawning him in Phaser
  {
    owner: 'darryl' as CharacterOwner,
    textureKey: 'car-darryl',
    imagePath: '/assets/cars/Car_4_32x32_6.png',
    note: 'Cool compact — Darryl has taste, warehouse guy swagger',
  },
]

// ── Lookup helpers ────────────────────────────────────────────────────────────

export const CAR_BY_OWNER: Record<string, CharacterCarConfig> = Object.fromEntries(
  CHARACTER_CARS.map((c) => [c.owner, c])
)

/** All texture keys that need to be loaded in Preloader.preload() */
export const ALL_CAR_TEXTURE_DEFS = CHARACTER_CARS.map((c) => ({
  textureKey: c.textureKey,
  imagePath: c.imagePath,
  sheetLayout: c.sheetLayout ?? getCarSheetLayoutFromPath(c.imagePath),
}))
