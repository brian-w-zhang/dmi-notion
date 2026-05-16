import Phaser from "phaser";
import { FOOTSTEP_CLOTH_KEYS } from "../config/soundEffects";

// Time between footstep sounds in milliseconds. Tuned for Character.speed = 3.
const STEP_INTERVAL_MS = 400;

export class FootstepSystem {
  private readonly scene: Phaser.Scene;
  // Start at the interval so the very first step fires immediately when walking begins.
  private elapsed = STEP_INTERVAL_MS;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Call once per update tick.
   * @param isWalking Whether the character is currently moving.
   * @param delta     Frame delta in ms (Phaser update's second argument).
   */
  update(isWalking: boolean, delta: number): void {
    if (!isWalking) {
      // Snap elapsed back to the interval so the next walk starts with an immediate step.
      this.elapsed = STEP_INTERVAL_MS;
      return;
    }

    this.elapsed += delta;
    if (this.elapsed >= STEP_INTERVAL_MS) {
      this.elapsed -= STEP_INTERVAL_MS;
      this.playStep();
    }
  }

  private playStep(): void {
    const key = Phaser.Utils.Array.GetRandom([...FOOTSTEP_CLOTH_KEYS]);
    this.scene.sound.play(key, {
      volume: Phaser.Math.FloatBetween(0.2, 0.4),
      detune: Phaser.Math.Between(-200, 200),
      rate: Phaser.Math.FloatBetween(0.85, 1.15),
    });
  }
}
