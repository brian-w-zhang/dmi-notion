import Phaser from 'phaser';

// Loads assets needed by the Preloader's own UI before handing off.
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.image('pam-bg', '/images/pam-art.png');
  }

  create() {
    this.scene.start('Preloader');
  }
}
