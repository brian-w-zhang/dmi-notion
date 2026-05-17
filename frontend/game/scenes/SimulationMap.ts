import { EventBus } from '../EventBus';

// Simulation scene — will replay pre-generated step files from
// frontend/public/assets/simulation/steps/*.json
// For now: placeholder with a back button.
export class SimulationMap extends Phaser.Scene {
  constructor() {
    super('SimulationMap');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.add.rectangle(0, 0, width, height, 0x080e08).setOrigin(0, 0);

    this.add.text(cx, cy - 30, 'SIMULATION', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#4a8a4a',
      letterSpacing: 4,
    }).setOrigin(0.5);

    this.add.text(cx, cy, 'No simulation files loaded yet.', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#383838',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 20, 'Run the server to generate steps/XXXXXX.json', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#2a4a2a',
    }).setOrigin(0.5);

    // Back to mode select
    const back = this.add.text(cx, cy + 70, '← back', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#4A4A4A',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    back.on('pointerover', () => back.setColor('#E8E8E8'));
    back.on('pointerout', () => back.setColor('#4A4A4A'));
    back.on('pointerdown', () => this.scene.start('ModeSelect'));

    EventBus.emit('scene-ready', this);
  }
}
