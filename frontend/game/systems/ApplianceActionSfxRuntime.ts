import Phaser from 'phaser';
import type { ApplianceActionSfxProfile } from './ApplianceActionSfx';

/**
 * Handles start / looping / end SFX for one appliance action session.
 * Start and loop playback are stopped without fade when the bar completes or the action is interrupted.
 */
export class ApplianceActionSfxRuntime {
  /** Loader key for the start one-shot currently playing (if any). */
  private startKey: string | null = null;
  /** Loader key for the sound currently looping for an in-progress action (if any). */
  private loopKey: string | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  begin(profile: ApplianceActionSfxProfile | null): void {
    this.interrupt();
    if (!profile) return;

    const snd = this.scene.sound;
    if (profile.startKey) {
      this.startKey = profile.startKey;
      const cfg: Phaser.Types.Sound.SoundConfig =
        profile.startVolume != null ? { volume: profile.startVolume } : {};
      snd.play(profile.startKey, cfg);
    }
    if (profile.loopKey) {
      this.loopKey = profile.loopKey;
      const cfg: Phaser.Types.Sound.SoundConfig = { loop: true };
      if (profile.loopVolume != null) cfg.volume = profile.loopVolume;
      snd.play(profile.loopKey, cfg);
    }
  }

  /**
   * Call when the progress bar finishes: stop start + loop, then play end cue (if any).
   */
  complete(profile: ApplianceActionSfxProfile | null): void {
    this.stopStartAndLoop();
    if (!profile?.endKey) return;
    const cfg: Phaser.Types.Sound.SoundConfig =
      profile.endVolume != null ? { volume: profile.endVolume } : {};
    this.scene.sound.play(profile.endKey, cfg);
  }

  /** Action cancelled / superseded: stop start + loop; do not play end. */
  interrupt(): void {
    this.stopStartAndLoop();
  }

  private stopStartAndLoop(): void {
    if (this.startKey) {
      this.scene.sound.stopByKey(this.startKey);
      this.startKey = null;
    }
    if (this.loopKey) {
      this.scene.sound.stopByKey(this.loopKey);
      this.loopKey = null;
    }
  }
}
