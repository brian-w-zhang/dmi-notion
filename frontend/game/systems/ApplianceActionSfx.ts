import { getSfxVolumeScalar } from '../config/soundEffects';
import type { ApplianceInteractable } from './ApplianceInteractionSystem';

/**
 * Optional SFX for a timed appliance action. Any combination is allowed.
 * - `startKey`: one-shot when the action visuals begin (stopped when the bar completes or is interrupted, before `endKey`)
 * - `loopKey`: loops until the action completes or is interrupted (stopped abruptly if the bar finishes early)
 * - `endKey`: one-shot when the progress bar completes (after start + loop are stopped)
 * - `*Volume`: final Phaser gain = `getSfxVolumeScalar(key)` × optional per-action scale from JSON
 */
export interface ApplianceActionSfxProfile {
  startKey?: string;
  loopKey?: string;
  endKey?: string;
  startVolume?: number;
  loopVolume?: number;
  endVolume?: number;
}

/** Build SFX profile from `appliances.json` action fields on the interactable. */
export function resolveApplianceActionSfx(
  appliance: ApplianceInteractable
): ApplianceActionSfxProfile | null {
  const startKey = appliance.sfxStartKey;
  const loopKey = appliance.sfxLoopKey;
  const endKey = appliance.sfxEndKey;
  if (!startKey && !loopKey && !endKey) return null;
  const startVolume = startKey
    ? getSfxVolumeScalar(startKey) * (appliance.sfxStartVolumeScale ?? 1)
    : undefined;
  const loopVolume = loopKey
    ? getSfxVolumeScalar(loopKey) * (appliance.sfxLoopVolumeScale ?? 1)
    : undefined;
  const endVolume = endKey
    ? getSfxVolumeScalar(endKey) * (appliance.sfxEndVolumeScale ?? 1)
    : undefined;
  return { startKey, loopKey, endKey, startVolume, loopVolume, endVolume };
}
