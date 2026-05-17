import Phaser from 'phaser';
import type { Car } from '../entities/Car';
import type { Character } from '../entities/Character';
import type { MainMapHud } from './mainMapHud';

// ── Types (must match generateDummyReplay.ts output) ─────────────────────────

type Facing   = 'front' | 'back' | 'left' | 'right';
type CarAnim  = 'drive' | 'idle';
type CharAnim = 'walk' | 'idle' | 'sit';

interface FullStep {
  step:         number;
  car_x:        number; car_y: number; car_facing: Facing; car_anim: CarAnim;
  char_x:       number; char_y: number; char_facing: Facing; char_anim: CharAnim;
  char_visible: boolean;
  follow:       'car' | 'char';
  emoji:        string; desc: string;
  transition?:  'enter_building';
  seated?:      boolean;
}

interface ReplayFile {
  meta: { ms_per_step: number; sprite_key: string; car_texture: string };
  steps: FullStep[];
}

// ── Controller ────────────────────────────────────────────────────────────────

export class MainMapReplayController {
  private readonly replay: ReplayFile;
  private stepIdx         = 1;
  private paused          = false;
  private stepTimer!:       Phaser.Time.TimerEvent;
  private currentFollow: 'car' | 'char' = 'car';

  constructor(
    private readonly scene:  Phaser.Scene,
    private readonly car:    Car,
    private readonly dwight: Character,
    private readonly hud:    MainMapHud,
  ) {
    this.replay = scene.cache.json.get('replay') as ReplayFile;
  }

  get isValid(): boolean {
    return !!(this.replay?.steps?.length);
  }

  start(): void {
    const { steps, meta } = this.replay;
    const first = steps[0];

    // Step 0: instant placement
    this.car.snapToPivot(first.car_x, first.car_y);
    this._playCarAnim(first.car_anim, first.car_facing);

    this.dwight.sprite.setVisible(first.char_visible);
    this.dwight.teleportTo(first.char_x, first.char_y);
    if (first.char_visible) this._playCharAnim(first.char_anim, first.char_facing);

    // Camera
    const cam = this.scene.cameras.main;
    cam.setLerp(0.1, 0.1);
    cam.startFollow(this.car.sprite);
    this.currentFollow = 'car';

    // HUD
    this.hud.enterReplayMode(steps.length - 1);
    this.hud.setReplayStatus(first.emoji, first.desc, 0, steps.length - 1);

    // Step timer starts after a short settle delay
    this.scene.time.delayedCall(600, () => {
      this.stepTimer = this.scene.time.addEvent({
        delay:         meta.ms_per_step,
        loop:          true,
        callback:      this._tick,
        callbackScope: this,
      });
    });
  }

  destroy(): void {
    this.stepTimer?.remove(false);
  }

  // ── Timer tick ──────────────────────────────────────────────────────────────

  private _tick(): void {
    if (this.paused) return;
    if (this.stepIdx >= this.replay.steps.length) {
      this.stepTimer.remove(false);
      return;
    }
    const step = this.replay.steps[this.stepIdx++];
    if (step.transition === 'enter_building') {
      this._doTransition(step);
      return;
    }
    this._applyStep(step, false);
  }

  // ── Apply step ──────────────────────────────────────────────────────────────

  private _applyStep(step: FullStep, instant: boolean): void {
    const ms = this.replay.meta.ms_per_step;

    this.hud.setReplayStatus(step.emoji, step.desc, step.step, this.replay.steps.length - 1);

    // Car — always tracked (stays at parked position after dismount)
    if (instant) {
      this.car.snapToPivot(step.car_x, step.car_y);
    } else {
      this.scene.tweens.add({
        targets: this.car.sprite, x: step.car_x, y: step.car_y,
        duration: ms, ease: 'Linear',
      });
    }
    this._playCarAnim(step.car_anim, step.car_facing);

    // Dwight
    this.dwight.sprite.setVisible(step.char_visible);
    if (step.char_visible) {
      if (instant) {
        this.dwight.teleportTo(step.char_x, step.char_y);
      } else {
        this.scene.tweens.add({
          targets: this.dwight.sprite, x: step.char_x, y: step.char_y,
          duration: ms, ease: 'Linear',
        });
      }
      this._playCharAnim(step.char_anim, step.char_facing);
    }

    // Camera follow — switch when `follow` field changes
    if (step.follow !== this.currentFollow) {
      this.currentFollow = step.follow;
      const cam = this.scene.cameras.main;
      cam.stopFollow();
      cam.startFollow(step.follow === 'car' ? this.car.sprite : this.dwight.sprite);
    }
  }

  // ── Building transition ─────────────────────────────────────────────────────
  // Mirrors sandbox: teleportTo (instant) + camera snap. No black fade — the
  // destination position is hidden under occluding tiles naturally.

  private _doTransition(step: FullStep): void {
    this.dwight.sprite.setVisible(false);
    this.dwight.teleportTo(step.char_x, step.char_y);
    this._playCharAnim(step.char_anim, step.char_facing);

    const cam = this.scene.cameras.main;
    cam.stopFollow();
    // Disable lerp for this one snap so the camera jumps instantly
    cam.setLerp(1, 1);
    cam.centerOn(step.char_x, step.char_y);
    cam.startFollow(this.dwight.sprite);
    cam.setLerp(0.1, 0.1);
    this.currentFollow = 'char';

    this.hud.setReplayStatus(step.emoji, step.desc, step.step, this.replay.steps.length - 1);

    // Reveal Dwight on the next render frame — camera is already at the new
    // position so there is no visible jump.
    this.scene.time.delayedCall(16, () => {
      this.dwight.sprite.setVisible(true);
    });
  }

  // ── Animation helpers ───────────────────────────────────────────────────────

  private _playCarAnim(anim: CarAnim, facing: Facing): void {
    const key = `${this.replay.meta.car_texture}-${anim}-${facing}`;
    if (this.car.sprite.anims.currentAnim?.key !== key) this.car.sprite.play(key, true);
  }

  private _playCharAnim(anim: CharAnim, facing: Facing): void {
    const base =
      anim === 'walk' ? 'walk' :
      anim === 'sit'  ? (facing === 'left' || facing === 'right' ? 'sit-legs' : 'idle-full') :
      'idle-full';
    const key = `${this.replay.meta.sprite_key}-${base}-${facing}`;
    if (this.dwight.sprite.anims.currentAnim?.key !== key) this.dwight.sprite.play(key, true);
  }
}
