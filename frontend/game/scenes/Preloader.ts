import Phaser from 'phaser';
import { dmiPixelUiFont, dmiTitleFont } from '@/lib/fonts';
import { TILESET_ASSETS } from '../config/assets';
import { CHARACTER_ASSETS } from '../config/characters';
import { ACTIVE_CAR } from '../config/carAssets';
import { SOUND_EFFECT_ASSETS } from '../config/soundEffects';

const LOADING_TIPS = [
  'Stocking the warehouse…',
  'Calibrating the copier (again)…',
  'Straightening Dundies display…',
  'Checking pretzel RSVP spreadsheet…',
  'Watering the ficus by accounting…',
  'Syncing sales call bingo cards…',
  'Preparing conference room magic…',
  'Sharpening pencils in the annex…',
];

// The Preloader scene loads all assets, then reveals mode-select buttons
// directly on the loading screen rather than transitioning to a new scene.
export class Preloader extends Phaser.Scene {
  // Stored so create() can read/mutate them without a transition
  private loaderTitle!: Phaser.GameObjects.Text;
  private loaderStatus!: Phaser.GameObjects.Text;
  private loaderTipText!: Phaser.GameObjects.Text;
  private loaderPctText!: Phaser.GameObjects.Text;
  private loaderTitleTween!: Phaser.Tweens.Tween;
  private loaderTipTimer!: Phaser.Time.TimerEvent;
  private loaderObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Preloader');
  }

  preload() {
    const width = this.scale.width;
    const height = this.scale.height;
    const cx = width / 2;
    const cy = height / 2;

    const pamBg = this.add.image(cx, cy, 'pam-bg')
      .setDisplaySize(width, height)
      .setOrigin(0.5);

    const bg = this.add.graphics();
    bg.fillStyle(0x151f32, 0.78);
    bg.fillRect(0, 0, width, height);

    const paperGrain = this.add.graphics();
    paperGrain.fillStyle(0xf8fafc, 0.04);
    for (let y = 0; y < height; y += 3) {
      paperGrain.fillRect(0, y, width, 1);
    }

    const title = this.add
      .text(cx, cy - 102, 'DUNDER MIFFLIN', {
        fontFamily: dmiTitleFont.style.fontFamily,
        fontSize: '26px',
        color: '#f8fafc',
      })
      .setOrigin(0.5)
      .setShadow(2, 2, '#020617', 0, false, true);

    const subtitle = this.add
      .text(cx, cy - 58, 'Paper Company · Scranton Branch', {
        fontFamily: dmiPixelUiFont.style.fontFamily,
        fontSize: '28px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    const status = this.add
      .text(cx, cy - 40, 'Loading simulation', {
        fontFamily: dmiPixelUiFont.style.fontFamily,
        fontSize: '28px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5)
      .setVisible(false);

    const barW = 320;
    const barH = 20;
    const barX = cx - barW / 2;
    const barY = cy - barH / 2;
    const radius = 10;

    const barTrack = this.add.graphics();
    barTrack.fillStyle(0x1e293b, 0.95);
    barTrack.lineStyle(1, 0x475569, 0.85);
    barTrack.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, radius + 2);
    barTrack.strokeRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, radius + 2);

    const progressFill = this.add.graphics();
    const tipIndexStart = Phaser.Math.Between(0, LOADING_TIPS.length - 1);
    const tipText = this.add
      .text(cx, cy + 52, LOADING_TIPS[tipIndexStart], {
        fontFamily: dmiPixelUiFont.style.fontFamily,
        fontSize: '24px',
        color: '#64748b',
        align: 'center',
        wordWrap: { width: Math.min(440, width - 48) },
      })
      .setOrigin(0.5, 0);

    const pctText = this.add
      .text(cx, barY + barH + 18, '0%', {
        fontFamily: dmiPixelUiFont.style.fontFamily,
        fontSize: '24px',
        color: '#94a3b8',
      })
      .setOrigin(0.5, 0);

    let tipIndex = tipIndexStart;
    this.loaderTipTimer = this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => {
        tipIndex = (tipIndex + 1) % LOADING_TIPS.length;
        tipText.setText(LOADING_TIPS[tipIndex]);
      },
    });

    this.loaderTitleTween = this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.88 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const drawProgress = (value: number) => {
      progressFill.clear();
      pctText.setText(`${Math.round(value * 100)}%`);
      const innerPad = 3;
      const innerW = barW - innerPad * 2;
      const innerH = barH - innerPad * 2;
      const fillW = Math.max(0, innerW * value);
      if (fillW <= 0) return;
      progressFill.fillStyle(0x3b82f6, 1);
      progressFill.fillRoundedRect(barX + innerPad, barY + innerPad, fillW, innerH, radius - 3);
      progressFill.fillStyle(0x93c5fd, 0.35);
      progressFill.fillRoundedRect(barX + innerPad, barY + innerPad, fillW, innerH * 0.45, 4);
    };

    const onProgress = (value: number) => drawProgress(value);
    this.load.on('progress', onProgress);
    this.load.once('complete', () => {
      this.load.off('progress', onProgress);
      drawProgress(1);
    });

    // Store refs for create()
    this.loaderTitle = title;
    this.loaderStatus = status;
    this.loaderTipText = tipText;
    this.loaderPctText = pctText;
    this.loaderObjects = [pamBg, bg, paperGrain, barTrack, progressFill, title, subtitle, status, tipText, pctText];

    // pam-bg may already be cached if Boot ran first; Phaser skips re-download
    if (!this.textures.exists('pam-bg')) {
      this.load.image('pam-bg', '/images/pam-art.png');
    }

    // --- Load the embedded tilemap JSON ---
    // "infinite: true" maps use chunked data — Phaser handles this automatically
    this.load.tilemapTiledJSON('dmi_map', '/assets/tilemap/dunder-mifflin-tilemap.json');

    // --- Load each tileset PNG ---
    // The key here must match what you pass to map.addTilesetImage() in MainMap.
    for (const tileset of TILESET_ASSETS) {
      this.load.image(tileset.key, tileset.imagePath);
    }

    // --- World data ---
    this.load.json('office-objects', '/assets/world/office-objects.json');
    this.load.json('appliances', '/assets/world/appliances.json');
    this.load.image('emoji16-question', '/assets/ui/emojis_16x16/question.png');
    this.load.image('emoji16-phone', '/assets/ui/emojis_16x16/phone.png');
    this.load.image('emoji16-talk', '/assets/ui/emojis_16x16/talk.png');
    this.load.image('emoji16-computer', '/assets/ui/emojis_16x16/computer.png');
    this.load.image('ui-bubble-white-1', '/assets/ui/bubbles/bubble_white_1.png');

    // --- Character spritesheets ---
    // Frame size: 32×64 px (32 wide, 64 tall). Grid: 56 cols × 20 rows.
    for (const character of CHARACTER_ASSETS) {
      this.load.spritesheet(character.spriteKey, character.spritePath, {
        frameWidth:  32,
        frameHeight: 64,
      });
    }

    // --- Car sheets (loaded as plain images — frames are non-uniform size) ---
    this.load.image(ACTIVE_CAR.textureKey, ACTIVE_CAR.imagePath);

    // --- Sound effects (key = filename without extension) ---
    for (const { key, path } of SOUND_EFFECT_ASSETS) {
      this.load.audio(key, path);
    }
  }

  create() {
    // Stop loading animations
    this.loaderTitleTween.stop();
    this.loaderTipTimer.destroy();
    this.loaderTitle.setAlpha(1);

    // Hide loading-only UI
    this.loaderTipText.setVisible(false);
    this.loaderPctText.setVisible(false);

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // Buttons appear below the bar (bar sits at cy ± 12)
    const btnY = cy + 60;
    const btnW = 140;
    const btnH = 40;
    const gap = 20;

    this.makeButton(cx - btnW / 2 - gap / 2, btnY, btnW, btnH, 'SANDBOX', 0x1a1a1a, 0x383838, () => {
      this.loaderObjects.forEach(o => o.destroy());
      this.scene.start('MainMap');
    });

    this.makeButton(cx + btnW / 2 + gap / 2, btnY, btnW, btnH, 'SIMULATION', 0x0d1a0d, 0x2a4a2a, () => {
      this.loaderObjects.forEach(o => o.destroy());
      this.scene.start('SimulationMap');
    });

  }

  private makeButton(
    x: number, y: number, w: number, h: number,
    label: string, bgColor: number, borderColor: number,
    onClick: () => void,
  ) {
    const bg = this.add.rectangle(x, y, w, h, bgColor)
      .setStrokeStyle(1, borderColor)
      .setInteractive({ useHandCursor: true });

    const text = this.add.text(x, y, label, {
      fontFamily: dmiPixelUiFont.style.fontFamily,
      fontSize: '20px',
      color: '#E8E8E8',
      letterSpacing: 2,
    }).setOrigin(0.5);

    bg.on('pointerover', () => { bg.setStrokeStyle(1, 0xE8E8E8); text.setColor('#ffffff'); });
    bg.on('pointerout',  () => { bg.setStrokeStyle(1, borderColor); text.setColor('#E8E8E8'); });
    bg.on('pointerdown', onClick);
  }
}
