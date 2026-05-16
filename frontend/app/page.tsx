'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';

// Phaser can ONLY run client-side (it uses the DOM/WebGL directly).
// next/dynamic with ssr: false prevents it from being server-rendered.
const PhaserGame = dynamic(() => import('../game/PhaserGame'), { ssr: false });

// --- Placeholder agent data (will come from the backend later) ---
const AGENTS = [
  { id: 'michael', name: 'Michael Scott',  role: 'Regional Manager',  status: 'In his office' },
  { id: 'jim',     name: 'Jim Halpert',    role: 'Sales Rep',         status: 'At his desk' },
  { id: 'dwight',  name: 'Dwight Schrute', role: 'Assistant (to the) Regional Manager', status: 'Patrolling' },
  { id: 'pam',     name: 'Pam Beesly',     role: 'Receptionist',      status: 'At reception' },
  { id: 'angela',  name: 'Angela Martin',  role: 'Head of Accounting', status: 'Working' },
];

export default function SimulationPage() {
  const [sceneReady, setSceneReady] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const handleSceneReady = useCallback(() => {
    setSceneReady(true);
  }, []);

  return (
    <main className="flex h-screen w-screen bg-black overflow-hidden relative">
      <section className="flex-1 right-0 h-full w-full">
        <PhaserGame onSceneReady={handleSceneReady} />
      </section>
      <div className="absolute bottom-3 right-3 z-50 flex gap-2">
        <a
          href="/dashboard/actions"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 bg-gray-900/80 border border-gray-700/60 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors backdrop-blur-sm"
        >
          Actions ↗
        </a>
        <a
          href="/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 bg-gray-900/80 border border-gray-700/60 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors backdrop-blur-sm"
        >
          Characters ↗
        </a>
      </div>
    </main>
  );
}
