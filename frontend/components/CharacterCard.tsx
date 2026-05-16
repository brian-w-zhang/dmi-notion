'use client'
import Link from 'next/link'
import CharacterSprite from './CharacterSprite'
import type { CharacterAssetDef } from '../game/config/characters'

export default function CharacterCard({ character }: { character: CharacterAssetDef }) {
  return (
    <Link
      href={`/dashboard/${character.owner}`}
      className="flex flex-col items-center gap-2 pt-3 pb-2.5 px-2 bg-[#252525] border border-[#383838] rounded hover:bg-[#2D2D2D] hover:border-[#4A4A4A] transition-colors"
    >
      <CharacterSprite spritePath={character.spritePath} scale={3} />
      <span className="text-[#9B9B9B] text-center text-sm leading-tight w-full truncate">
        {character.displayName}
      </span>
    </Link>
  )
}
