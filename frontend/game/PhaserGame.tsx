'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { dmiPixelUiFont, dmiTitleFont } from '@/lib/fonts';
import { Boot } from './scenes/Boot';
import { Preloader } from './scenes/Preloader';
import { ModeSelect } from './scenes/ModeSelect';
import { MainMap } from './scenes/MainMap';
import { EventBus } from './EventBus';

function patchClosedAudioContextGuard() {
  if (typeof window === 'undefined' || (window as { __dmiAudioContextPatched?: boolean }).__dmiAudioContextPatched) {
    return;
  }

  const audioConstructors = [
    window.AudioContext,
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
  ].filter(Boolean) as Array<typeof AudioContext>;

  for (const AudioConstructor of audioConstructors) {
    const proto = AudioConstructor.prototype as AudioContext;
    const originalSuspend = proto.suspend;
    const originalResume = proto.resume;

    if (typeof originalSuspend === 'function' && !(originalSuspend as { __dmiPatched?: boolean }).__dmiPatched) {
      const patchedSuspend = function patchedSuspend(this: AudioContext, ...args: unknown[]) {
        if (this.state === 'closed') {
          return Promise.resolve();
        }
        return originalSuspend.apply(this, args as []);
      };

      (patchedSuspend as { __dmiPatched?: boolean }).__dmiPatched = true;
      proto.suspend = patchedSuspend;
    }

    if (typeof originalResume === 'function' && !(originalResume as { __dmiPatched?: boolean }).__dmiPatched) {
      const patchedResume = function patchedResume(this: AudioContext, ...args: unknown[]) {
        if (this.state === 'closed') {
          return Promise.resolve();
        }
        return originalResume.apply(this, args as []);
      };

      (patchedResume as { __dmiPatched?: boolean }).__dmiPatched = true;
      proto.resume = patchedResume;
    }
  }

  (window as { __dmiAudioContextPatched?: boolean }).__dmiAudioContextPatched = true;
}

interface PhaserGameProps {
  onSceneReady?: (scene: Phaser.Scene) => void;
}

export default function PhaserGame({ onSceneReady }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return; // already mounted

    // Phaser can occasionally call suspend/resume on an already-closed context
    // during startup/teardown races (common on fast refresh / remount).
    patchClosedAudioContextGuard();

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.WEBGL,          // WebGL renderer for performance and cross-texture capabilities
      parent: containerRef.current,  // mount into our div
      width: '100%',
      height: '100%',
      backgroundColor: '#151f32',
      scene: [Boot, Preloader, ModeSelect, MainMap],
      pixelArt: true,               // crisp pixel rendering for 32px tiles
      antialias: false,
      roundPixels: true,
    };

    gameRef.current = new Phaser.Game(config);

    // Forward the scene-ready event to the React parent
    const handleSceneReady = (scene: Phaser.Scene) => {
      onSceneReady?.(scene);
    };
    EventBus.on('scene-ready', handleSceneReady);

    return () => {
      // Clean up Phaser when the React component unmounts
      EventBus.off('scene-ready', handleSceneReady);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [onSceneReady]);

  return (
    <div
      ref={containerRef}
      id="phaser-container"
      className={`w-full h-full ${dmiTitleFont.className} ${dmiPixelUiFont.className}`}
    />
  );
}
