import Phaser from 'phaser';
import type { ApplianceInteractable } from './ApplianceInteractionSystem';
import type { Character } from '../entities/Character';
import { resolveApplianceActionSfx } from './ApplianceActionSfx';
import { ApplianceActionSfxRuntime } from './ApplianceActionSfxRuntime';
import { SpeechBubbleOverlay } from '../entities/SpeechBubbleOverlay';
import { TalkHeadEmojiOverlay } from '../entities/TalkHeadEmojiOverlay';
import { SPEECH_BUBBLE_DEPTH } from '../scenes/mainMap.constants';

const ACTION_DURATION_MS = 1500;
const BAR_WIDTH = 34;
const BAR_HEIGHT = 5;
const BAR_GAP_ABOVE_BUBBLE_PX = 6;
const STATUS_DOTS = ['.', '..', '...', '..', '.'];
const STATUS_TICK_MS = 220;
const ACTION_BAR_DEPTH = SPEECH_BUBBLE_DEPTH + 1;
const STATUS_TEXT_DEPTH = SPEECH_BUBBLE_DEPTH + 2;

/**
 * Owns all appliance-action UI: progress bar, status text, emoji, speech bubble, and SFX.
 * Lives as a field on MainMap; MainMap delegates all action-progress concerns here.
 */
export class ApplianceActionController {
  private readonly scene: Phaser.Scene;
  private readonly onRegisterWorldObject: (...objs: Phaser.GameObjects.GameObject[]) => void;
  private readonly sfxRuntime: ApplianceActionSfxRuntime;

  private speechBubble: SpeechBubbleOverlay | TalkHeadEmojiOverlay | null = null;
  private gen = 0;
  private tween: Phaser.Tweens.Tween | null = null;
  private completionTimer: Phaser.Time.TimerEvent | null = null;
  private bar: Phaser.GameObjects.Graphics | null = null;
  private progress = { value: 0 };
  private statusPhrase: string | null = null;
  private statusDotIndex = 0;
  private statusEvent: Phaser.Time.TimerEvent | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private statusBaseWidth = 0;
  private emojiImage: Phaser.GameObjects.Image | null = null;
  private _isActive = false;
  /** Set while an action runs (after `tryStart`); cleared in `stopAll`. */
  private activeEmoji: string | null = null;

  get isActive(): boolean {
    return this._isActive;
  }

  /** True while the in-world talk action (Dwight + NPC) is using the talk emoji affordance. */
  isTalkActionActive(): boolean {
    return this._isActive && this.activeEmoji === 'talk';
  }

  constructor(
    scene: Phaser.Scene,
    onRegisterWorldObject: (...objs: Phaser.GameObjects.GameObject[]) => void
  ) {
    this.scene = scene;
    this.onRegisterWorldObject = onRegisterWorldObject;
    this.sfxRuntime = new ApplianceActionSfxRuntime(scene);
  }

  destroySpeechBubble(): void {
    this.speechBubble?.destroy();
    this.speechBubble = null;
  }

  /** Cancel any in-progress action and destroy all associated UI. */
  stopAll(): void {
    this.sfxRuntime.interrupt();
    this.gen += 1;
    this.tween?.stop();
    this.tween = null;
    this.completionTimer?.destroy();
    this.completionTimer = null;
    this.bar?.destroy();
    this.bar = null;
    this.progress.value = 0;
    this._isActive = false;
    this.stopStatus();
    this.destroySpeechBubble();
    this.destroyEmoji();
    this.activeEmoji = null;
  }

  /** Called each update frame: syncs speech bubble position and (when dwight is present) status text. */
  tick(dwight: Character | null): void {
    this.speechBubble?.syncToTarget();
    if (dwight) this.syncStatusPosition(dwight);
  }

  /** Begin the action sequence for `appliance` on `dwight`. Cancels any active action first. */
  perform(appliance: ApplianceInteractable, dwight: Character, onComplete?: () => void): void {
    const loadingPhrase = this.pickPhrase(appliance);
    const durationMs = appliance.durationMs ?? ACTION_DURATION_MS;
    const sfxProfile = resolveApplianceActionSfx(appliance);

    this.stopAll();
    const myGen = this.gen;

    const tryStart = (): void => {
      if (this.gen !== myGen) return;

      this.destroySpeechBubble();

      const textureKey = `emoji16-${appliance.emoji}`;
      const emojiKey = this.scene.textures.exists(textureKey) ? textureKey : 'emoji16-question';

      if (appliance.emoji === 'talk') {
        const overlay = TalkHeadEmojiOverlay.attach(this.scene, dwight.sprite, {
          emojiTextureKey: emojiKey,
          depth: SPEECH_BUBBLE_DEPTH,
          alpha: 1,
          verticalBobAmplitudePx: 2.5,
          verticalBobPeriodMs: 2800,
          verticalBobPhaseRad: Math.PI * 0.7,
          smoothWalkHorizontalNudge: true,
        });
        this.speechBubble = overlay;
        this.activeEmoji = appliance.emoji;
        this.onRegisterWorldObject(overlay.getRoot());
        overlay.syncToTarget();
      } else {
        const overlay = SpeechBubbleOverlay.attach(this.scene, dwight.sprite, {
          bubbleTextureKey: 'ui-bubble-white-1',
          emojiTextureKey: emojiKey,
          depth: SPEECH_BUBBLE_DEPTH,
          bubbleScale: 1.5,
          verticalBobAmplitudePx: 2.5,
          verticalBobPeriodMs: 2800,
          verticalBobPhaseRad: Math.PI * 0.7,
          smoothWalkHorizontalNudge: false,
        });
        this.speechBubble = overlay;
        this.activeEmoji = appliance.emoji;
        this.onRegisterWorldObject(overlay.getRoot());
        overlay.syncToTarget();
      }

      this.sfxRuntime.begin(sfxProfile);

      if (appliance.emoji === 'talk') {
        // Dwight dialogue should show emoji + status text without the loading bar.
        this.startStatus(loadingPhrase, dwight);
        this._isActive = true;
        this.completionTimer = this.scene.time.delayedCall(durationMs, () => {
          this.completionTimer = null;
          this._isActive = false;
          this.stopStatus();
          if (this.gen !== myGen) return;
          this.sfxRuntime.complete(sfxProfile);
          this.speechBubble?.fadeOutAndDestroy(() => {
            this.speechBubble = null;
          });
          onComplete?.();
        });
      } else {
        this.startProgress(dwight, durationMs, loadingPhrase, myGen, () => {
          if (this.gen !== myGen) return;
          this.sfxRuntime.complete(sfxProfile);
          this.speechBubble?.fadeOutAndDestroy(() => {
            this.speechBubble = null;
          });
          onComplete?.();
        });
      }
    };

    const textureKey = `emoji16-${appliance.emoji}`;
    if (this.scene.textures.exists(textureKey)) {
      tryStart();
    } else {
      const path = `/assets/ui/emojis_16x16/${appliance.emoji}.png`;
      this.scene.load.image(textureKey, path);
      this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.gen !== myGen) return;
        tryStart();
      });
      this.scene.load.start();
    }
  }

  private pickPhrase(appliance: ApplianceInteractable): string {
    if (!appliance.loadingPhrases.length) return appliance.actionName;
    return Phaser.Utils.Array.GetRandom(appliance.loadingPhrases);
  }

  private barTopWorldY(dwight: Character): number {
    if (this.speechBubble) {
      return (
        this.speechBubble.getBubbleTopWorldY() -
        BAR_GAP_ABOVE_BUBBLE_PX -
        BAR_HEIGHT
      );
    }
    return dwight.sprite.y - 64;
  }

  private syncStatusPosition(dwight: Character): void {
    const statusText = this.statusText;
    if (!statusText) return;
    const barTop = this.barTopWorldY(dwight);
    statusText.setPosition(
      dwight.sprite.x - this.statusBaseWidth / 2,
      barTop - 6 - statusText.height
    );
  }

  private tickStatus(dwight: Character): void {
    if (!this.statusPhrase) return;
    const dots = STATUS_DOTS[this.statusDotIndex];
    this.statusText?.setText(`${this.statusPhrase}${dots}`);
    this.syncStatusPosition(dwight);
    this.statusDotIndex = (this.statusDotIndex + 1) % STATUS_DOTS.length;
  }

  private startStatus(basePhrase: string, dwight: Character): void {
    this.stopStatus();
    this.statusPhrase = basePhrase.trim();
    this.statusDotIndex = 0;
    this.statusText = this.scene.add.text(0, 0, '', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      backgroundColor: '#00000099',
      padding: { left: 6, right: 6, top: 3, bottom: 4 },
      align: 'left',
    }).setOrigin(0, 0).setDepth(STATUS_TEXT_DEPTH);
    this.onRegisterWorldObject(this.statusText);
    this.statusText.setText(this.statusPhrase);
    this.statusBaseWidth = this.statusText.width;
    this.tickStatus(dwight);
    this.statusEvent = this.scene.time.addEvent({
      delay: STATUS_TICK_MS,
      loop: true,
      callback: () => this.tickStatus(dwight),
    });
  }

  private stopStatus(): void {
    this.statusEvent?.remove();
    this.statusEvent = null;
    this.statusPhrase = null;
    this.statusDotIndex = 0;
    this.statusText?.destroy();
    this.statusText = null;
    this.statusBaseWidth = 0;
  }

  private drawBar(dwight: Character, progress: number): void {
    const bar = this.bar;
    if (!bar) return;

    const clamped = Phaser.Math.Clamp(progress, 0, 1);
    const x = dwight.sprite.x - BAR_WIDTH / 2;
    const y = this.barTopWorldY(dwight);

    bar.clear();
    bar.fillStyle(0x000000, 0.55);
    bar.fillRoundedRect(x - 1, y - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2, 3);
    bar.fillStyle(0x1f2937, 0.95);
    bar.fillRoundedRect(x, y, BAR_WIDTH, BAR_HEIGHT, 2);
    bar.fillStyle(0xffd700, 1);
    bar.fillRoundedRect(x, y, BAR_WIDTH * clamped, BAR_HEIGHT, 2);
  }

  private startProgress(
    dwight: Character,
    durationMs: number,
    loadingPhrase: string,
    completionGen: number,
    onComplete: () => void
  ): void {
    this._isActive = true;
    this.progress.value = 0;
    this.bar = this.scene.add.graphics().setDepth(ACTION_BAR_DEPTH);
    this.onRegisterWorldObject(this.bar);
    this.drawBar(dwight, 0);
    this.startStatus(loadingPhrase, dwight);

    this.tween = this.scene.tweens.add({
      targets: this.progress,
      value: 1,
      duration: durationMs,
      ease: 'Linear',
      onUpdate: () => this.drawBar(dwight, this.progress.value),
      onComplete: () => {
        this.tween = null;
        this.bar?.destroy();
        this.bar = null;
        this._isActive = false;
        this.stopStatus();
        if (this.gen === completionGen) {
          onComplete();
        }
      },
    });
  }

  private destroyEmoji(): void {
    this.emojiImage?.destroy();
    this.emojiImage = null;
  }

  private showEmoji(emojiName: string, dwight: Character): void {
    const textureKey = `emoji16-${emojiName}`;
    if (!this.scene.textures.exists(textureKey)) {
      if (this.scene.load.isLoading()) {
        this.showEmojiWithTexture('emoji16-question', dwight);
        return;
      }
      const path = `/assets/ui/emojis_16x16/${emojiName}.png`;
      this.scene.load.image(textureKey, path);
      this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.scene.textures.exists(textureKey)) this.showEmojiWithTexture(textureKey, dwight);
        else this.showEmojiWithTexture('emoji16-question', dwight);
      });
      this.scene.load.start();
      return;
    }
    this.showEmojiWithTexture(textureKey, dwight);
  }

  private showEmojiWithTexture(textureKey: string, dwight: Character): void {
    this.destroyEmoji();
    const emoji = this.scene.add.image(dwight.sprite.x, dwight.sprite.y - 72, textureKey)
      .setDepth(STATUS_TEXT_DEPTH)
      .setScale(1.5);
    this.onRegisterWorldObject(emoji);
    this.emojiImage = emoji;

    this.scene.tweens.add({
      targets: emoji,
      y: emoji.y - 8,
      alpha: 0.25,
      duration: 1200,
      ease: 'Sine.Out',
      onComplete: () => {
        if (this.emojiImage === emoji) this.emojiImage = null;
        emoji.destroy();
      },
    });
  }
}
