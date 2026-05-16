/**
 * All SFX under `public/assets/sound effects/`.
 * Loader keys are the filename without extension (e.g. `microwave_door_open`).
 * Paths use `%20` so the browser request is unambiguous.
 */
const SFX_DIR = '/assets/sound%20effects';

export interface SoundEffectAsset {
  key: string;
  path: string;
  /**
   * Volume multiplier for this cue (1 = file decoded at normal Phaser gain).
   * Tune loud/quiet assets here so gameplay stays even; optional per-action scales in `appliances.json` multiply this.
   */
  volume?: number;
}

function sfx(filename: string, volumeScalar = 1): SoundEffectAsset {
  const key = filename.replace(/\.(ogg|mp3|wav)$/i, '');
  const path = `${SFX_DIR}/${filename}`;
  if (volumeScalar !== 1 && Number.isFinite(volumeScalar) && volumeScalar > 0) {
    return { key, path, volume: volumeScalar };
  }
  return { key, path };
}

export const FOOTSTEP_CLOTH_KEYS = [
  'Cloth_dig1.ogg',
  'Cloth_dig2.ogg',
  'Cloth_dig3.ogg',
  'Cloth_dig4.ogg',
] as const;

export const SOUND_EFFECT_ASSETS: SoundEffectAsset[] = [
  sfx('bell_01.ogg'),
  sfx('bell_02.ogg'),
  sfx('bell_03.ogg'),
  sfx('car_driving.mp3', 3),
  sfx('dishes_01.ogg'),
  sfx('dishes_02.ogg'),
  sfx('dishes_03.ogg'),
  sfx('dishes_04.ogg'),
  sfx('door_01.ogg'),
  sfx('door_02.ogg'),
  sfx('door_close_01.ogg'),
  sfx('door_close_02.ogg'),
  sfx('door_close_03.ogg'),
  sfx('door_close_04.ogg'),
  sfx('door_open.ogg'),
  sfx('explosion.ogg'),
  sfx('glass_01.ogg'),
  sfx('glass_02.ogg'),
  sfx('glass_03.ogg'),
  sfx('glass_04.ogg'),
  sfx('glass_05.ogg'),
  sfx('gong_01.ogg'),
  sfx('gong_02.ogg'),
  sfx('hit_01.ogg'),
  sfx('hit_02.ogg'),
  sfx('hit_03.ogg'),
  sfx('hit_04.ogg'),
  sfx('key_open_01.ogg'),
  sfx('key_open_02.ogg'),
  sfx('keyboard_typing.mp3', 0.8),
  sfx('machine_01.ogg'),
  sfx('machine_02.ogg'),
  sfx('machine_03.ogg'),
  sfx('metal_01.ogg'),
  sfx('metal_02.ogg'),
  sfx('metal_03.ogg'),
  sfx('metal_04.ogg'),
  sfx('metal_05.ogg'),
  sfx('metal_06.ogg'),
  sfx('metal_07.ogg'),
  sfx('metal_08.ogg'),
  sfx('metal_09.ogg'),
  sfx('metal_10.ogg'),
  sfx('metal_11.ogg'),
  sfx('metal_12.ogg'),
  sfx('microwave_ding.mp3'),
  sfx('microwave_door_close.ogg'),
  sfx('microwave_door_open.ogg'),
  sfx('microwave_on.mp3'),
  sfx('noise_01.ogg'),
  sfx('noise_02.ogg'),
  sfx('open_car_door.mp3'),
  sfx('other_01.ogg'),
  sfx('other_02.ogg'),
  sfx('other_03.ogg'),
  sfx('other_04.ogg'),
  sfx('other_05.ogg'),
  sfx('other_06.ogg'),
  sfx('other_07.ogg'),
  sfx('paper_01.ogg'),
  sfx('paper_02.ogg'),
  sfx('paper_03.ogg'),
  sfx('paper_04.ogg'),
  sfx('phone_dial.mp3', 0.8),
  sfx('plop_01.ogg'),
  sfx('plop_02.ogg'),
  sfx('pot_01.ogg'),
  sfx('pot_02.ogg'),
  sfx('shot_01.ogg'),
  sfx('shot_02.ogg'),
  sfx('slam_01.ogg'),
  sfx('slam_02.ogg'),
  sfx('slam_03.ogg'),
  sfx('slam_04.ogg'),
  sfx('slam_05.ogg'),
  sfx('slam_06.ogg'),
  sfx('slam_07.ogg'),
  sfx('splash_01.ogg'),
  sfx('splash_02.ogg'),
  sfx('spring_01.ogg'),
  sfx('spring_02.ogg'),
  sfx('spring_03.ogg'),
  sfx('spring_04.ogg'),
  sfx('spring_05.ogg'),
  sfx('spring_06.ogg'),
  sfx('spring_07.ogg'),
  sfx('spring_08.ogg'),
  sfx('spring_09.ogg'),
  sfx('switch_01.ogg'),
  sfx('switch_02.ogg'),
  sfx('toilet_01.ogg', 0.4),
  sfx('toilet_02.ogg', 0.4),
  sfx('tools_01.ogg'),
  sfx('tools_02.ogg'),
  sfx('tools_03.ogg'),
  sfx('tools_04.ogg'),
  sfx('tools_05.ogg'),
  sfx('weird_01.ogg'),
  sfx('weird_02.ogg'),
  sfx('weird_03.ogg'),
  sfx('weird_04.ogg'),
  sfx('weird_05.ogg'),
  sfx('entrance_door.mp3'),
  sfx('water_pour.mp3', 0.35),
  sfx('wash_hands.mp3'),
  sfx('vending_machine.mp3'),
  sfx('Cloth_dig1.ogg.mp3', 0.3),
  sfx('Cloth_dig2.ogg.mp3', 0.3),
  sfx('Cloth_dig3.ogg.mp3', 0.3),
  sfx('Cloth_dig4.ogg.mp3', 0.3),
  sfx('wooded_box_open.ogg'),
  sfx('wooden_01.ogg'),
  sfx('wooden_02.ogg'),
  sfx('wooden_03.ogg'),
];

const SFX_VOLUME_MAP = new Map<string, number>(
  SOUND_EFFECT_ASSETS
    .filter((a): a is SoundEffectAsset & { volume: number } => typeof a.volume === 'number')
    .map((a) => [a.key, a.volume])
);

/** Volume multiplier from `SOUND_EFFECT_ASSETS` for a loader key (default 1). */
export function getSfxVolumeScalar(key: string): number {
  const v = SFX_VOLUME_MAP.get(key);
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return 1;
}
