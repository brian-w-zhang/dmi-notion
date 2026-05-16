'use client'
import Link from 'next/link'
import CharacterSprite from './CharacterSprite'
import type { CharacterAssetDef } from '../game/config/characters'

export default function CharacterCard({ character }: { character: CharacterAssetDef }) {
  return (
    <Link
      href={`/dashboard/${character.owner}`}
      className="flex flex-col items-center gap-2 pt-3 pb-2 px-2 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-600 hover:bg-gray-800/60 transition-colors"
    >
      <CharacterSprite spritePath={character.spritePath} scale={2} />
      <span
        className="text-white text-center leading-tight w-full"
        style={{ fontFamily: 'var(--font-vt323)', fontSize: '15px' }}
      >
        {character.displayName}
      </span>
    </Link>
  )
}
