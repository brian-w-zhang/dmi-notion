'use client'
import Link from 'next/link'
import CharacterSprite from './CharacterSprite'
import type { CharacterAssetDef } from '../game/config/characters'

export default function CharacterCard({ character }: { character: CharacterAssetDef }) {
  return (
    <Link
      href={`/dashboard/${character.owner}`}
      className="flex items-center gap-3 px-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-600 hover:bg-gray-800/60 transition-colors overflow-hidden"
      style={{ height: '88px' }}
    >
      {/* Sprite clipped to card height — shows head + torso */}
      <div className="shrink-0 overflow-hidden" style={{ width: 64, height: 88 }}>
        <CharacterSprite spritePath={character.spritePath} scale={2} />
      </div>
      <span
        className="text-white leading-tight"
        style={{ fontFamily: 'var(--font-vt323)', fontSize: '20px' }}
      >
        {character.displayName}
      </span>
    </Link>
  )
}
