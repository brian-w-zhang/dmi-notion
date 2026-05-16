import type { ActionPoint, Point } from './officeObjects';

export interface ApplianceAction {
  id: string;
  name: string;
  emoji: string;
  actionPointId: number | null;
  loadingPhrases?: string[];
  durationMs?: number;
  /**
   * Optional SFX loader keys (filename without extension under `public/assets/sound effects/`).
   * Wired at action start / loop during bar / bar complete — see `ApplianceActionSfxProfile`.
   */
  sfxStartKey?: string;
  sfxLoopKey?: string;
  sfxEndKey?: string;
  /** Multiplies the asset’s global `volume` from `soundEffects.ts` for this cue only (e.g. 1.2). */
  sfxStartVolumeScale?: number;
  sfxLoopVolumeScale?: number;
  sfxEndVolumeScale?: number;
}

export interface ApplianceDefinition {
  objectId: number;
  objectName: string;
  zone: string | null;
  center: Point;
  actionPoints: ActionPoint[];
  actions: ApplianceAction[];
  /**
   * Optional hotkey index when multiple interactables share one context (e.g. desk bundle).
   * Shown as `[hotkeySlot] to …` in the HUD. Persisted by generate-appliances-json when present.
   */
  hotkeySlot?: number;
}

export interface ApplianceActionsData {
  appliances: ApplianceDefinition[];
  meta?: {
    generatedAt?: string;
    sourceFile?: string;
    [key: string]: unknown;
  };
}
