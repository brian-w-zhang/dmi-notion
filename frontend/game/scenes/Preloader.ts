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

// The Preloader scene runs before the map is displayed.
// It loads all required assets and then starts the MainMap scene.
export class Preloader extends Phaser.Scene {
  private destroyLoaderChrome?: () => void;

  constructor() {
    super('Preloader');
  }

  preload() {
    const width = this.scale.width;
    const height = this.scale.height;
    const cx = width / 2;
    const cy = height / 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x151f32, 1);
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
      .text(cx, cy - 26, 'Loading simulation', {
        fontFamily: dmiPixelUiFont.style.fontFamily,
        fontSize: '28px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5);

    const barW = 320;
    const barH = 24;
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
    const tipTimer = this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => {
        tipIndex = (tipIndex + 1) % LOADING_TIPS.length;
        tipText.setText(LOADING_TIPS[tipIndex]);
      },
    });

    const titleTween = this.tweens.add({
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
      if (fillW <= 0) {
        return;
      }
      progressFill.fillStyle(0x3b82f6, 1);
      progressFill.fillRoundedRect(
        barX + innerPad,
        barY + innerPad,
        fillW,
        innerH,
        radius - 3,
      );
      progressFill.fillStyle(0x93c5fd, 0.35);
      progressFill.fillRoundedRect(barX + innerPad, barY + innerPad, fillW, innerH * 0.45, 4);
    };

    const onProgress = (value: number) => {
      drawProgress(value);
    };

    this.load.on('progress', onProgress);

    this.destroyLoaderChrome = () => {
      this.load.off('progress', onProgress);
      titleTween.stop();
      tipTimer.destroy();
      bg.destroy();
      paperGrain.destroy();
      barTrack.destroy();
      progressFill.destroy();
      title.destroy();
      subtitle.destroy();
      status.destroy();
      tipText.destroy();
      pctText.destroy();
      this.destroyLoaderChrome = undefined;
    };

    this.load.once('complete', () => {
      this.load.off('progress', onProgress);
      drawProgress(1);
    });

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
    this.destroyLoaderChrome?.();
    this.scene.start('MainMap');
  }
}
