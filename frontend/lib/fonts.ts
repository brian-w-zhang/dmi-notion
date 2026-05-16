import { Press_Start_2P, VT323 } from 'next/font/google';

/** 8-bit style title — matches Phaser `pixelArt` presentation (PhaserGame applies className). */
export const dmiTitleFont = Press_Start_2P({
  subsets: ['latin'],
  weight: '400',
});

/** Bitmap-terminal style for preloader subtitle / status / tips. */
export const dmiPixelUiFont = VT323({
  subsets: ['latin'],
  weight: '400',
});
