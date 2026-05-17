import { EventBus } from '../EventBus';

export class ModeSelect extends Phaser.Scene {
  constructor() {
    super('ModeSelect');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Background
    this.add.rectangle(0, 0, width, height, 0x0a0a0a).setOrigin(0, 0);

    // Title
    this.add.text(cx, cy - 130, 'DUNDER MIFFLIN INFINITY', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#9B9B9B',
      letterSpacing: 6,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 95, 'Scranton Branch Simulation', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#4A4A4A',
      letterSpacing: 3,
    }).setOrigin(0.5);

    // Divider
    this.add.rectangle(cx, cy - 68, 180, 1, 0x262626).setOrigin(0.5);

    // Sandbox button
    this.makeButton(cx - 90, cy, 'SANDBOX', '#E8E8E8', '#1a1a1a', '#383838', () => {
      this.scene.start('MainMap');
    });

    // Simulation button
    this.makeButton(cx + 90, cy, 'SIMULATION', '#E8E8E8', '#1a2a1a', '#2a4a2a', () => {
      this.scene.start('MainMap', { replayMode: true });
    });

    // Labels under buttons
    this.add.text(cx - 90, cy + 42, 'dev & testing', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#4A4A4A',
    }).setOrigin(0.5);

    this.add.text(cx + 90, cy + 42, 'agent-driven run', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#2a6a2a',
    }).setOrigin(0.5);

    EventBus.emit('scene-ready', this);
  }

  private makeButton(
    x: number, y: number,
    label: string,
    textColor: string,
    bgColor: number,
    borderColor: number,
    onClick: () => void
  ) {
    const W = 140, H = 44;

    const bg = this.add.rectangle(x, y, W, H, bgColor)
      .setStrokeStyle(1, borderColor)
      .setInteractive({ useHandCursor: true });

    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: textColor,
      letterSpacing: 2,
    }).setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setStrokeStyle(1, 0xE8E8E8);
      text.setColor('#ffffff');
    });

    bg.on('pointerout', () => {
      bg.setStrokeStyle(1, borderColor);
      text.setColor(textColor);
    });

    bg.on('pointerdown', onClick);
  }
}
